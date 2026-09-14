// ==========================================================
// PRODUCT CATEGORY AUDIT (staff-only, read-only)
//
// Phase 3 repair task: before anything ever rewrites a live
// Shopify product's productType, HairGrab staff need to see
// which products are already inconsistent and by how much.
//
// This route makes NO writes. It only reads every HairGrab
// product from Shopify and compares its current productType
// against the canonical category (see ../product-categories.ts).
// ==========================================================

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import type { CSSProperties } from "react";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  normalizeProductCategory,
  CANONICAL_PRODUCT_CATEGORIES,
} from "../product-categories";

type ShopifyAuditProduct = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  status: string;
};

type AuditRow = {
  shopifyProductId: string;
  title: string;
  handle: string;
  vendor: string;
  status: string;
  currentProductType: string;
  canonicalCategory: string | null;
  outcome: "OK" | "INCONSISTENT" | "UNRECOGNIZED";
  sellerBusinessName: string | null;
  sellerCode: string | null;
  sellerProductStatus: string | null;
};

async function fetchAllHairGrabProducts(
  admin: any,
): Promise<ShopifyAuditProduct[]> {
  const products: ShopifyAuditProduct[] = [];

  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
      query HairGrabProductCategoryAudit(
        $after: String
      ) {
        products(
          first: 100
          after: $after
          query: "tag:HairGrab"
        ) {
          nodes {
            id
            title
            handle
            vendor
            productType
            status
          }

          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      `,
      {
        variables: { after },
      },
    );

    const json = await response.json();

    if (json?.errors?.length) {
      throw new Error(
        json.errors
          .map((error: { message?: string }) =>
            error.message || "Unknown Shopify error.",
          )
          .join(" | "),
      );
    }

    const nodes = json?.data?.products?.nodes || [];

    for (const node of nodes) {
      products.push({
        id: String(node.id),
        title: String(node.title || ""),
        handle: String(node.handle || ""),
        vendor: String(node.vendor || ""),
        productType: String(node.productType || ""),
        status: String(node.status || ""),
      });
    }

    hasNextPage = Boolean(
      json?.data?.products?.pageInfo?.hasNextPage,
    );

    after = json?.data?.products?.pageInfo?.endCursor || null;

    if (hasNextPage && !after) {
      throw new Error(
        "Product category audit pagination stopped because no next cursor was returned.",
      );
    }
  }

  return products;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const shopifyProducts = await fetchAllHairGrabProducts(admin);

  const ownedProducts = await db.sellerProduct.findMany({
    where: {
      shopifyProductId: {
        in: shopifyProducts.map((p) => p.id),
      },
    },
    select: {
      shopifyProductId: true,
      status: true,
      seller: {
        select: {
          businessName: true,
          sellerCode: true,
        },
      },
    },
  });

  const ownedByShopifyId = new Map(
    ownedProducts
      .filter((p) => Boolean(p.shopifyProductId))
      .map((p) => [p.shopifyProductId as string, p]),
  );

  const rows: AuditRow[] = shopifyProducts.map((product) => {
    const canonical = normalizeProductCategory(
      product.productType,
    );

    let outcome: AuditRow["outcome"] = "OK";

    if (canonical === null) {
      outcome = "UNRECOGNIZED";
    } else if (canonical !== product.productType) {
      outcome = "INCONSISTENT";
    }

    const owned = ownedByShopifyId.get(product.id);

    return {
      shopifyProductId: product.id,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      status: product.status,
      currentProductType: product.productType,
      canonicalCategory: canonical,
      outcome,
      sellerBusinessName: owned?.seller?.businessName || null,
      sellerCode: owned?.seller?.sellerCode || null,
      sellerProductStatus: owned?.status || null,
    };
  });

  const summary = {
    total: rows.length,
    ok: rows.filter((r) => r.outcome === "OK").length,
    inconsistent: rows.filter((r) => r.outcome === "INCONSISTENT")
      .length,
    unrecognized: rows.filter((r) => r.outcome === "UNRECOGNIZED")
      .length,
  };

  return {
    rows,
    summary,
    canonicalCategories: CANONICAL_PRODUCT_CATEGORIES,
  };
};

export default function ProductCategoryAuditPage() {
  const { rows, summary, canonicalCategories } =
    useLoaderData<typeof loader>();

  const flagged = rows.filter((row) => row.outcome !== "OK");

  return (
    <div style={{ padding: "20px", maxWidth: "1100px" }}>
      <h1 style={{ color: "#4B1678", marginBottom: "4px" }}>
        Product Category Audit
      </h1>

      <p style={{ color: "#5c5163", marginTop: 0 }}>
        Read-only. Nothing on this page writes to Shopify. It
        compares every HairGrab-tagged product&apos;s current
        Shopify <code>productType</code> against the canonical
        categories: {canonicalCategories.join(", ")}.
      </p>

      <div
        style={{
          display: "flex",
          gap: "14px",
          margin: "16px 0",
          flexWrap: "wrap",
        }}
      >
        <SummaryTile label="Total products" value={summary.total} />
        <SummaryTile
          label="Already canonical"
          value={summary.ok}
          tone="good"
        />
        <SummaryTile
          label="Inconsistent (needs re-save)"
          value={summary.inconsistent}
          tone="warn"
        />
        <SummaryTile
          label="Unrecognized productType"
          value={summary.unrecognized}
          tone="bad"
        />
      </div>

      {flagged.length === 0 ? (
        <p style={{ color: "#2f6b3a" }}>
          No inconsistent or unrecognized products found.
        </p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
          }}
        >
          <thead>
            <tr style={{ background: "#f7f0fb", textAlign: "left" }}>
              <th style={thStyle}>Product</th>
              <th style={thStyle}>Seller</th>
              <th style={thStyle}>Current productType</th>
              <th style={thStyle}>Canonical category</th>
              <th style={thStyle}>Outcome</th>
              <th style={thStyle}>Shopify status</th>
            </tr>
          </thead>

          <tbody>
            {flagged.map((row) => (
              <tr key={row.shopifyProductId}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 700 }}>{row.title}</div>
                  <div style={{ color: "#948a9c", fontSize: "11px" }}>
                    {row.handle}
                  </div>
                </td>

                <td style={tdStyle}>
                  {row.sellerBusinessName || row.vendor}
                  {row.sellerCode ? ` (${row.sellerCode})` : ""}
                </td>

                <td style={tdStyle}>
                  <code>{row.currentProductType || "(empty)"}</code>
                </td>

                <td style={tdStyle}>
                  {row.canonicalCategory || (
                    <span style={{ color: "#a33" }}>
                      no match — needs manual review
                    </span>
                  )}
                </td>

                <td style={tdStyle}>
                  <OutcomeBadge outcome={row.outcome} />
                </td>

                <td style={tdStyle}>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "#2f6b3a"
      : tone === "warn"
        ? "#8a6d1f"
        : tone === "bad"
          ? "#a33"
          : "#4B1678";

  return (
    <div
      style={{
        border: "1px solid #eee0f5",
        borderRadius: "10px",
        padding: "12px 16px",
        minWidth: "150px",
      }}
    >
      <div style={{ fontSize: "22px", fontWeight: 800, color }}>
        {value}
      </div>
      <div style={{ fontSize: "12px", color: "#5c5163" }}>{label}</div>
    </div>
  );
}

function OutcomeBadge({
  outcome,
}: {
  outcome: AuditRow["outcome"];
}) {
  const background =
    outcome === "OK"
      ? "#e8f3e9"
      : outcome === "INCONSISTENT"
        ? "#fdf3d9"
        : "#fbe6e6";

  const color =
    outcome === "OK"
      ? "#2f6b3a"
      : outcome === "INCONSISTENT"
        ? "#8a6d1f"
        : "#a33";

  return (
    <span
      style={{
        background,
        color,
        fontSize: "11px",
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: "6px",
      }}
    >
      {outcome}
    </span>
  );
}

const thStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "2px solid #e2d5eb",
};

const tdStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #f0eaf5",
  verticalAlign: "top",
};
