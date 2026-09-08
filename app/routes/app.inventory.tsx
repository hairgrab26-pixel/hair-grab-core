import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

type ShopifyMetafield = {
  namespace: string;
  key: string;
  type: string;
  value: string;
};

type ShopifyVariant = {
  id: string;
  title: string;
  inventoryQuantity: number | null;
  inventoryItem?: { tracked?: boolean | null } | null;
  selectedOptions: Array<{ name: string; value: string }>;
};

type ShopifyProduct = {
  id: string;
  title: string;
  status: string;
  vendor: string;
  productType: string;
  tags: string[];
  metafields: { nodes: ShopifyMetafield[] };
  variants: { nodes: ShopifyVariant[] };
};

type BreakdownItem = {
  label: string;
  products: number;
  units: number;
};

const SPECIAL_CLASSIFICATIONS = [
  "Kosher Wig",
  "Medical Wig",
  "Crochet Hair",
  "Locs / Locks",
];

const MAIN_CATEGORIES = [
  "Wigs",
  "Bundles",
  "Closures & Frontals",
  "Extensions",
  "Braiding Hair",
  "Hair Essentials",
];

function normalize(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function parseMetafieldValues(value: string) {
  const raw = String(value || "").trim();

  if (!raw) return [] as string[];

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed.map(String).map((v) => v.trim()).filter(Boolean);
    }

    if (typeof parsed === "string" || typeof parsed === "number") {
      return [String(parsed).trim()].filter(Boolean);
    }
  } catch {
    // Plain string.
  }

  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

function getSelectedOption(variant: ShopifyVariant, name: string) {
  return (
    variant.selectedOptions.find(
      (option) => normalize(option.name) === normalize(name),
    )?.value || ""
  );
}

function productCategory(product: ShopifyProduct) {
  const value = normalize(product.productType);

  if (value === "wig" || value === "wigs") return "Wigs";
  if (value === "bundle" || value === "bundles") return "Bundles";
  if (value.includes("closure") || value.includes("frontal")) {
    return "Closures & Frontals";
  }
  if (value === "extension" || value === "extensions") return "Extensions";
  if (value === "braidinghair" || value.includes("braiding")) {
    return "Braiding Hair";
  }
  if (
    value === "hairessential" ||
    value === "hairessentials" ||
    value.includes("essential")
  ) {
    return "Hair Essentials";
  }

  return product.productType?.trim() || "Other";
}

function trackedUnits(product: ShopifyProduct) {
  return product.variants.nodes.reduce((total, variant) => {
    if (!variant.inventoryItem?.tracked) return total;

    return total + Math.max(0, Number(variant.inventoryQuantity || 0));
  }, 0);
}

function hasTrackedInventory(product: ShopifyProduct) {
  return product.variants.nodes.some((variant) =>
    Boolean(variant.inventoryItem?.tracked),
  );
}

function addBreakdown(
  map: Map<string, { products: Set<string>; units: number }>,
  label: string,
  productId: string,
  units: number,
) {
  const clean = String(label || "").trim();
  if (!clean) return;

  const current = map.get(clean) || {
    products: new Set<string>(),
    units: 0,
  };

  current.products.add(productId);
  current.units += Math.max(0, units);
  map.set(clean, current);
}

function toBreakdown(
  map: Map<string, { products: Set<string>; units: number }>,
) {
  return Array.from(map.entries())
    .map(([label, value]) => ({
      label,
      products: value.products.size,
      units: value.units,
    }))
    .sort((a, b) => b.products - a.products || a.label.localeCompare(b.label));
}

async function getMetafieldDefinitionNames(admin: any) {
  const response = await admin.graphql(
    `#graphql
    query HairGrabInventoryMetafieldDefinitions {
      metafieldDefinitions(ownerType: PRODUCT, first: 250) {
        nodes {
          name
          namespace
          key
        }
      }
    }`,
  );

  const json = await response.json();
  const map = new Map<string, string>();

  for (const definition of json?.data?.metafieldDefinitions?.nodes || []) {
    map.set(
      `${definition.namespace}.${definition.key}`,
      String(definition.name || definition.key),
    );
  }

  return map;
}

async function getAllShopifyProducts(admin: any) {
  const products: ShopifyProduct[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
      query HairGrabInventoryProducts($after: String) {
        products(first: 100, after: $after) {
          nodes {
            id
            title
            status
            vendor
            productType
            tags

            metafields(first: 100) {
              nodes {
                namespace
                key
                type
                value
              }
            }

            variants(first: 250) {
              nodes {
                id
                title
                inventoryQuantity
                inventoryItem {
                  tracked
                }
                selectedOptions {
                  name
                  value
                }
              }
            }
          }

          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      {
        variables: { after },
      },
    );

    const json = await response.json();

    if (json?.errors?.length) {
      throw new Error(
        json.errors
          .map((error: { message?: string }) => error.message || "Shopify query failed.")
          .join(" | "),
      );
    }

    const connection = json?.data?.products;
    products.push(...(connection?.nodes || []));
    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    after = connection?.pageInfo?.endCursor || null;
  }

  return products;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const coreProducts = await db.sellerProduct.findMany({
    where: {
      shopifyProductId: { not: null },
      status: { notIn: ["ARCHIVED", "REJECTED"] },
    },
    include: {
      seller: {
        select: {
          id: true,
          sellerCode: true,
          businessName: true,
          activeProductLimit: true,
        },
      },
    },
  });

  const [shopifyProducts, definitionNames] = await Promise.all([
    getAllShopifyProducts(admin),
    getMetafieldDefinitionNames(admin),
  ]);

  const coreByShopifyId = new Map(
    coreProducts
      .filter((product) => Boolean(product.shopifyProductId))
      .map((product) => [String(product.shopifyProductId), product]),
  );

  const products = shopifyProducts.filter((product) =>
    coreByShopifyId.has(product.id),
  );

  const categoryMap = new Map<string, { products: Set<string>; units: number }>();
  const textureMap = new Map<string, { products: Set<string>; units: number }>();
  const lengthMap = new Map<string, { products: Set<string>; units: number }>();
  const colorMap = new Map<string, { products: Set<string>; units: number }>();
  const materialMap = new Map<string, { products: Set<string>; units: number }>();
  const classMap = new Map<string, { products: Set<string>; units: number }>();

  const sellerMap = new Map<
    string,
    {
      sellerCode: string;
      businessName: string;
      products: number;
      liveProducts: number;
      units: number;
      productLimit: number;
    }
  >();

  let totalUnits = 0;
  let liveProducts = 0;
  let draftProducts = 0;
  let productsWithTrackedInventory = 0;
  let outOfStockProducts = 0;
  let lowStockProducts = 0;

  for (const product of products) {
    const coreProduct = coreByShopifyId.get(product.id);
    if (!coreProduct) continue;

    const productUnits = trackedUnits(product);
    const inventoryTracked = hasTrackedInventory(product);

    totalUnits += productUnits;

    if (product.status === "ACTIVE") liveProducts += 1;
    else draftProducts += 1;

    if (inventoryTracked) {
      productsWithTrackedInventory += 1;

      if (productUnits === 0) outOfStockProducts += 1;
      else if (productUnits <= 3) lowStockProducts += 1;
    }

    addBreakdown(
      categoryMap,
      productCategory(product),
      product.id,
      productUnits,
    );

    const namedMeta = new Map<string, string[]>();

    for (const metafield of product.metafields.nodes) {
      const name =
        definitionNames.get(`${metafield.namespace}.${metafield.key}`) ||
        metafield.key;

      namedMeta.set(
        normalize(name),
        parseMetafieldValues(metafield.value),
      );
    }

    const getMeta = (names: string[]) => {
      for (const name of names) {
        const values = namedMeta.get(normalize(name));
        if (values?.length) return values;
      }
      return [] as string[];
    };

    for (const texture of getMeta(["Texture"])) {
      addBreakdown(textureMap, texture, product.id, productUnits);
    }

    for (const material of getMeta(["Hair Type", "Material"])) {
      addBreakdown(materialMap, material, product.id, productUnits);
    }

    const metaLengths = getMeta(["Length"]);
    const variantLengths = new Set<string>();

    for (const variant of product.variants.nodes) {
      const length = getSelectedOption(variant, "Length");
      if (!length) continue;

      variantLengths.add(length);
      addBreakdown(
        lengthMap,
        length,
        product.id,
        variant.inventoryItem?.tracked
          ? Math.max(0, Number(variant.inventoryQuantity || 0))
          : 0,
      );
    }

    if (variantLengths.size === 0) {
      for (const length of metaLengths) {
        addBreakdown(lengthMap, length, product.id, productUnits);
      }
    }

    const metaColors = getMeta(["Color"]);
    const variantColors = new Set<string>();

    for (const variant of product.variants.nodes) {
      const color = getSelectedOption(variant, "Color");
      if (!color) continue;

      variantColors.add(color);
      addBreakdown(
        colorMap,
        color,
        product.id,
        variant.inventoryItem?.tracked
          ? Math.max(0, Number(variant.inventoryQuantity || 0))
          : 0,
      );
    }

    if (variantColors.size === 0) {
      for (const color of metaColors) {
        addBreakdown(colorMap, color, product.id, productUnits);
      }
    }

    for (const classification of SPECIAL_CLASSIFICATIONS) {
      if (
        product.tags.some(
          (tag) => normalize(tag) === normalize(classification),
        )
      ) {
        addBreakdown(classMap, classification, product.id, productUnits);
      }
    }

    const seller = coreProduct.seller;
    const sellerEntry = sellerMap.get(seller.id) || {
      sellerCode: seller.sellerCode,
      businessName: seller.businessName,
      products: 0,
      liveProducts: 0,
      units: 0,
      productLimit: seller.activeProductLimit,
    };

    sellerEntry.products += 1;
    sellerEntry.units += productUnits;

    if (product.status === "ACTIVE") {
      sellerEntry.liveProducts += 1;
    }

    sellerMap.set(seller.id, sellerEntry);
  }

  for (const category of MAIN_CATEGORIES) {
    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        products: new Set<string>(),
        units: 0,
      });
    }
  }

  for (const classification of SPECIAL_CLASSIFICATIONS) {
    if (!classMap.has(classification)) {
      classMap.set(classification, {
        products: new Set<string>(),
        units: 0,
      });
    }
  }

  const categories = MAIN_CATEGORIES.map((label) => {
    const value = categoryMap.get(label)!;
    return {
      label,
      products: value.products.size,
      units: value.units,
    };
  });

  const classifications = SPECIAL_CLASSIFICATIONS.map((label) => {
    const value = classMap.get(label)!;
    return {
      label,
      products: value.products.size,
      units: value.units,
    };
  });

  const opportunities = [
    ...categories
      .filter((item) => item.products < 10)
      .map((item) => ({
        label: item.label,
        products: item.products,
        type: "Category",
        priority:
          item.products === 0 || item.products < 5 ? "HIGH" : "MEDIUM",
      })),

    ...classifications
      .filter((item) => item.products < 5)
      .map((item) => ({
        label: item.label,
        products: item.products,
        type: "Specialized",
        priority: item.products === 0 ? "HIGH" : "MEDIUM",
      })),
  ];

  return {
    generatedAt: new Date().toISOString(),

    summary: {
      trackedProducts: products.length,
      liveProducts,
      draftProducts,
      totalUnits,
      productsWithTrackedInventory,
      outOfStockProducts,
      lowStockProducts,
      trackedSellers: sellerMap.size,
    },

    categories,
    textures: toBreakdown(textureMap),
    lengths: toBreakdown(lengthMap).sort((a, b) => {
      const av = Number(a.label.replace(/[^0-9.]/g, ""));
      const bv = Number(b.label.replace(/[^0-9.]/g, ""));

      if (Number.isFinite(av) && Number.isFinite(bv)) return av - bv;
      return a.label.localeCompare(b.label);
    }),
    colors: toBreakdown(colorMap),
    materials: toBreakdown(materialMap),
    classifications,
    sellers: Array.from(sellerMap.values()).sort(
      (a, b) =>
        b.products - a.products ||
        a.businessName.localeCompare(b.businessName),
    ),
    opportunities,
  };
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5d8ef",
  borderRadius: "14px",
  padding: "20px",
  boxShadow: "0 2px 8px rgba(84, 35, 120, 0.06)",
};

const headingStyle = {
  margin: "0 0 14px",
  color: "#542378",
  fontSize: "20px",
};

const thStyle = {
  textAlign: "left" as const,
  padding: "10px 8px",
  borderBottom: "1px solid #e8dfee",
  color: "#756b7b",
  fontSize: "11px",
};

const tdStyle = {
  padding: "11px 8px",
  borderBottom: "1px solid #f0e9f4",
  fontSize: "13px",
};

function BreakdownTable({
  items,
  emptyText,
}: {
  items: BreakdownItem[];
  emptyText: string;
}) {
  if (!items.length) {
    return <div style={{ color: "#756b7b", fontSize: "12px" }}>{emptyText}</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Attribute</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Products</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Units</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => (
            <tr key={item.label}>
              <td style={tdStyle}>
                <strong>{item.label}</strong>
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {item.products}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {item.units}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CatalogInventory() {
  const data = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        maxWidth: "1260px",
        margin: "0 auto",
        padding: "28px",
        fontFamily: "Arial, sans-serif",
        color: "#21152a",
      }}
    >
      <Link
        to="/app"
        style={{
          color: "#7b3fa0",
          fontSize: "12px",
          fontWeight: "700",
          textDecoration: "none",
        }}
      >
        ← HairGrab Core
      </Link>

      <h1
        style={{
          margin: "10px 0 6px",
          color: "#542378",
          fontSize: "30px",
        }}
      >
        Catalog Inventory
      </h1>

      <p style={{ color: "#756b7b", fontSize: "12px", lineHeight: "1.5" }}>
        Marketplace-wide product coverage and sellable inventory. Draft and live seller products are included so HairGrab can plan the launch assortment.
      </p>

      <div
        style={{
          padding: "13px 15px",
          background: "#f7f0fb",
          border: "1px solid #e2d1ef",
          borderRadius: "11px",
          color: "#542378",
          fontSize: "11px",
          lineHeight: "1.5",
          margin: "18px 0",
        }}
      >
        <strong>Inventory note:</strong> product counts show catalog depth. Unit counts show current Shopify inventory only where inventory tracking is enabled.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "12px",
          marginBottom: "22px",
        }}
      >
        {[
          ["Tracked Products", data.summary.trackedProducts, `${data.summary.liveProducts} live · ${data.summary.draftProducts} draft`],
          ["Units Available", data.summary.totalUnits, `${data.summary.productsWithTrackedInventory} products track inventory`],
          ["Sellers With Products", data.summary.trackedSellers, "Core seller catalog"],
          ["Out of Stock", data.summary.outOfStockProducts, "Tracked products at 0 units"],
          ["Low Stock", data.summary.lowStockProducts, "1–3 tracked units"],
        ].map(([label, value, note]) => (
          <div key={String(label)} style={cardStyle}>
            <div style={{ color: "#6f6675", fontSize: "12px", fontWeight: "700" }}>
              {label}
            </div>
            <div
              style={{
                fontSize: "28px",
                fontWeight: "800",
                color: "#542378",
                margin: "6px 0 2px",
              }}
            >
              {value}
            </div>
            <div style={{ color: "#93899a", fontSize: "10px" }}>{note}</div>
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, marginBottom: "22px" }}>
        <h2 style={headingStyle}>Category Coverage</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "10px",
          }}
        >
          {data.categories.map((item) => (
            <div
              key={item.label}
              style={{
                padding: "14px",
                border: "1px solid #eadff0",
                borderRadius: "11px",
                background: "#fcf9fe",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: "800", color: "#542378" }}>
                {item.label}
              </div>
              <div style={{ fontSize: "24px", fontWeight: "800", marginTop: "6px" }}>
                {item.products}
              </div>
              <div style={{ fontSize: "10px", color: "#93899a" }}>
                products · {item.units} units
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: "22px" }}>
        <h2 style={headingStyle}>Catalog Opportunities</h2>

        <p style={{ color: "#756b7b", fontSize: "12px" }}>
          Use these gaps to guide seller recruiting. Main categories flag below 10 products; specialized classifications flag below 5.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "9px",
          }}
        >
          {data.opportunities.map((item) => (
            <div
              key={`${item.type}-${item.label}`}
              style={{
                border: "1px solid #eadff0",
                borderRadius: "10px",
                padding: "12px",
              }}
            >
              <strong style={{ color: "#542378" }}>{item.label}</strong>
              <div style={{ marginTop: "4px", fontSize: "10px", color: "#93899a" }}>
                {item.type} · {item.products} products · {item.priority === "HIGH" ? "Needs attention" : "Build depth"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "18px",
          marginBottom: "22px",
        }}
      >
        <div style={cardStyle}>
          <h2 style={headingStyle}>Length</h2>
          <BreakdownTable items={data.lengths} emptyText="No length data found yet." />
        </div>

        <div style={cardStyle}>
          <h2 style={headingStyle}>Color</h2>
          <BreakdownTable items={data.colors} emptyText="No color data found yet." />
        </div>

        <div style={cardStyle}>
          <h2 style={headingStyle}>Texture</h2>
          <BreakdownTable items={data.textures} emptyText="No texture data found yet." />
        </div>

        <div style={cardStyle}>
          <h2 style={headingStyle}>Hair Type / Material</h2>
          <BreakdownTable items={data.materials} emptyText="No material data found yet." />
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: "22px" }}>
        <h2 style={headingStyle}>Specialized Hair</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "10px",
          }}
        >
          {data.classifications.map((item) => (
            <div
              key={item.label}
              style={{
                padding: "13px",
                border: "1px solid #eadff0",
                borderRadius: "10px",
              }}
            >
              <div style={{ fontWeight: "800", color: "#542378", fontSize: "12px" }}>
                {item.label}
              </div>
              <div style={{ marginTop: "6px", fontSize: "20px", fontWeight: "800" }}>
                {item.products}
              </div>
              <div style={{ color: "#93899a", fontSize: "10px" }}>
                products · {item.units} units
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={headingStyle}>Seller Catalog Coverage</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Seller</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Products</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Live</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Units</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Active Limit</th>
              </tr>
            </thead>

            <tbody>
              {data.sellers.map((seller) => (
                <tr key={seller.sellerCode}>
                  <td style={tdStyle}>
                    <strong>{seller.businessName}</strong>
                    <div style={{ color: "#93899a", fontSize: "10px", marginTop: "2px" }}>
                      {seller.sellerCode}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{seller.products}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{seller.liveProducts}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{seller.units}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{seller.productLimit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
