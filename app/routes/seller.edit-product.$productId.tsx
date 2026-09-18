import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { requireSellerSession } from "../seller-session.server";
import { extensionTypeFromOptions, EXTENSION_TYPE_METAFIELD, productTypeToCategoryLabel, PRODUCT_CATEGORY_LABELS, type ProductType } from "../product-categories";
import { diffMedia, diffVariants, hydrateMediaEditState, hydrateVariantEditState, serializeMetafieldValue, type ExistingProductSnapshot } from "../product-builder-model";
import { reconcileMedia, reconcileVariants } from "../product-edit-mutations.server";
import { productOptions, productClassifications, installationMethodChoices, locTypeChoices, type EditBuilderData } from "../components/ProductBuilder";
import ProductBuilder from "../components/ProductBuilder";
import { syncHairGrabShippingProfile } from "../hairgrab-shipping.server";
import { hydrateSellerAttributes, normalizeDensity, normalizeShipsWithin, replaceAttributeTags } from "../product-attribute-tags";
import { sellerProductAttributeTags } from "../seller-product-attributes";

type ShopifyMetafieldDefinition = {
  name: string;
  namespace: string;
  key: string;
  type: { name: string };
  validations: Array<{ name: string; value: string | null }>;
  constraints: {
    key: string | null;
  } | null;
};

type ProductMetafield = {
  namespace: string;
  key: string;
  type: string;
  value: string;
};

// Phase 2A: Crochet Hair is now a current, assignable classification
// (see productClassifications.BRAIDING_HAIR in ../components/ProductBuilder,
// which added CROCHET_HAIR alongside the existing LOCS entry), not merely a
// historical value to recognize on read -- so it belongs in the live list
// below rather than only in LEGACY_CLASSIFICATION_TAGS.
const CLASSIFICATION_TAGS = [
  "Kosher Wig",
  "Medical Wig",
  "Locs",
  "Crochet Hair",
];

const LEGACY_CLASSIFICATION_TAGS = [
  "Locs / Locks",
];

// Which of CLASSIFICATION_TAGS actually apply to a given canonical
// shopper category (see ../product-categories.ts for the category
// labels). Bundles, Closures & Frontals, Extensions, and Hair
// Essentials have no specialized classification today, so they
// are intentionally absent here — add an entry only when there is
// an approved, category-specific classification for them.
//
// Phase 2A relabel: keyed by the current shopper-facing category
// label ("Braids + Crochet", not the pre-Phase-2A "Braiding Hair") to
// match PRODUCT_CATEGORY_LABELS.BRAIDING_HAIR in ../product-categories.
const CLASSIFICATION_TAGS_BY_CATEGORY: Record<string, string[]> = {
  Wigs: ["Kosher Wig", "Medical Wig"],
  "Braids + Crochet": ["Locs", "Crochet Hair"],
};

async function getShopifyAdmin() {
  const offlineSession = await db.session.findFirst({
    where: { isOnline: false },
  });

  if (!offlineSession) {
    throw new Error(
      "HairGrab could not find the Shopify offline session.",
    );
  }

  return unauthenticated.admin(offlineSession.shop);
}

async function getPrimaryLocationId(admin: any) {
  const response = await admin.graphql(`#graphql
    query HairGrabPrimaryLocation {
      location {
        id
      }
    }
  `);

  const json = await response.json();
  const id = json?.data?.location?.id;

  if (!id) {
    throw new Error(
      "Shopify inventory location could not be found.",
    );
  }

  return String(id);
}

async function getOwnedProduct(
  sellerId: string,
  productId: string | undefined,
) {
  if (!productId) {
    throw new Response("Product is required", {
      status: 400,
    });
  }

  const product = await db.sellerProduct.findFirst({
    where: {
      id: productId,
      sellerId,
    },
  });

  if (!product || !product.shopifyProductId) {
    throw new Response("Product not found", {
      status: 404,
    });
  }

  return product;
}

function normalizeMetafieldName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function definitionIsConstrained(definition: ShopifyMetafieldDefinition) {
  // Category/taxonomy constraints cause metafieldsSet to fail with
  // "Owner subtype does not match the metafield definition's constraints".
  return Boolean(definition.constraints?.key);
}

function findMetafieldDefinition(
  definitions: ShopifyMetafieldDefinition[],
  names: string[],
  { allowConstrained = false }: { allowConstrained?: boolean } = {},
) {
  const wanted = names.map(normalizeMetafieldName);

  const matches = definitions.filter((definition) =>
    wanted.includes(
      normalizeMetafieldName(definition.name),
    ),
  );

  const candidates = allowConstrained
    ? matches
    : matches.filter(
        (definition) => !definitionIsConstrained(definition),
      );

  if (candidates.length === 0) {
    return undefined;
  }

  const ranked = [...candidates].sort((a, b) => {
    let score = (definition: ShopifyMetafieldDefinition) => {
      let points = 0;
      if (definition.namespace === "custom") points += 20;
      if (!definition.constraints) points += 10;
      return points;
    };
    return score(b) - score(a);
  });

  return ranked[0];
}

function getDefinitionChoices(
  definition: ShopifyMetafieldDefinition,
) {
  const choiceValidation =
    definition.validations.find(
      (validation) =>
        normalizeMetafieldName(
          validation.name,
        ) === "choices",
    );

  if (!choiceValidation?.value) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(
      choiceValidation.value,
    );

    return Array.isArray(parsed)
      ? parsed.map(String)
      : [];
  } catch {
    return [];
  }
}

const METAFIELD_VALUE_ALIASES:
  Record<string, string[]> = {
  freeshipping: [
    "free",
    "freeshippingavailable",
  ],
  calculatedatcheckout: [
    "calculatedshipping",
    "calculated",
  ],
  localpickup: [
    "localpickupavailable",
  ],
  localdelivery: [
    "localdeliveryavailable",
  ],
  true: [
    "yes",
  ],
  false: [
    "no",
  ],
};

function resolveChoiceValue(
  value: string,
  choices: string[],
) {
  if (choices.length === 0) {
    return value;
  }

  const normalizedValue =
    normalizeMetafieldName(value);

  const exact =
    choices.find(
      (choice) =>
        normalizeMetafieldName(choice) ===
        normalizedValue,
    );

  if (exact) {
    return exact;
  }

  for (
    const alias of
    METAFIELD_VALUE_ALIASES[
      normalizedValue
    ] || []
  ) {
    const matched =
      choices.find(
        (choice) =>
          normalizeMetafieldName(
            choice,
          ) === alias,
      );

    if (matched) {
      return matched;
    }
  }

  return null;
}

function prepareMetafieldValue(
  definition:
    ShopifyMetafieldDefinition,
  value:
    string | boolean,
) {
  const choices =
    getDefinitionChoices(
      definition,
    );

  const raw =
    typeof value === "boolean"
      ? value
        ? "true"
        : "false"
      : String(value);

  const resolved =
    resolveChoiceValue(
      raw,
      choices,
    );

  if (
    choices.length > 0 &&
    !resolved
  ) {
    return null;
  }

  if (definition.type.name === "boolean") return String(Boolean(value));
  return serializeMetafieldValue(definition.type.name, resolved ?? raw);
}

function addExistingMetafield({
  definitions,
  output,
  names,
  value,
  fallback,
}: {
  definitions:
    ShopifyMetafieldDefinition[];

  output:
    ProductMetafield[];

  names:
    string[];

  value:
    string |
    boolean |
    null |
    undefined;
  fallback?: {
    namespace: string;
    key: string;
    type: string;
  };
}) {
  if (
    value === null ||
    value === undefined ||
    (
      typeof value === "string" &&
      !value.trim()
    )
  ) {
    return;
  }

  const seen = new Set<string>();
  let wrote = false;
  for (const name of names) {
    const definition = findMetafieldDefinition(definitions, [name]);
    if (!definition) continue;
    const identity = `${definition.namespace}:${definition.key}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const prepared = prepareMetafieldValue(definition, value);
    if (prepared === null) continue;
    output.push({
      namespace: definition.namespace,
      key: definition.key,
      type: definition.type.name,
      value: prepared,
    });
    wrote = true;
  }

  if (!wrote && fallback && fallback.namespace !== "shopify") {
    if (typeof value === "boolean") {
      output.push({ ...fallback, value: value ? "true" : "false" });
    } else if (typeof value === "string" && value.trim()) {
      output.push({ ...fallback, value: value.trim() });
    }
  }
}

async function getProductMetafieldDefinitions(
  admin: any,
) {
  const response =
    await admin.graphql(
      `#graphql
      query HairGrabProductMetafieldDefinitions {
        metafieldDefinitions(
          first: 100
          ownerType: PRODUCT
        ) {
          nodes {
            name
            namespace
            key

            type {
              name
            }

            validations {
              name
              value
            }
            constraints {
              key
            }
          }
        }
      }
      `,
    );

  const json =
    await response.json();

  return (
    json?.data
      ?.metafieldDefinitions
      ?.nodes || []
  ) as ShopifyMetafieldDefinition[];
}

async function setProductMetafieldsSafely({
  admin,
  productId,
  metafields,
}: {
  admin: any;
  productId: string;
  metafields:
    ProductMetafield[];
}) {
  for (
    const metafield of
    metafields
  ) {
    try {
      const response =
        await admin.graphql(
          `#graphql
          mutation HairGrabEditSetMetafield(
            $metafields: [MetafieldsSetInput!]!
          ) {
            metafieldsSet(
              metafields: $metafields
            ) {
              userErrors {
                field
                message
                code
              }
            }
          }
          `,
          {
            variables: {
              metafields: [
                {
                  ownerId:
                    productId,
                  ...metafield,
                },
              ],
            },
          },
        );

      const json =
        await response.json();

      const errors =
        json?.data
          ?.metafieldsSet
          ?.userErrors ||
        [];

      if (json?.errors?.length || errors.length) {
        console.warn(
          `[HairGrab Core] Skipping incompatible Shopify metafield ${metafield.namespace}.${metafield.key}:`,
          [...(json.errors || []), ...errors].map((error: { message?: string }) => error.message).join(" | "),
        );
      }
    } catch (error) {
      console.warn(
        `[HairGrab Core] Could not update metafield ${metafield.namespace}.${metafield.key}:`,
        error,
      );
    }
  }
}

function getMetafieldValue(
  productMetafields:
    ProductMetafield[],
  namespace:
    string,
  key:
    string,
) {
  return (
    productMetafields.find(
      (m) =>
        m.namespace ===
          namespace &&
        m.key === key,
    )?.value ||
    ""
  );
}

function getMetafieldByDefinitionName(
  productMetafields:
    ProductMetafield[],
  definitions:
    ShopifyMetafieldDefinition[],
  names:
    string[],
) {
  for (const allowConstrained of [false, true]) {
    for (const name of names) {
      const definition = findMetafieldDefinition(definitions, [name], { allowConstrained });
      if (!definition) continue;
      const value = getMetafieldValue(
        productMetafields,
        definition.namespace,
        definition.key,
      );
      if (String(value || "").trim()) return value;
    }
  }

  return "";
}

export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  const coreProduct =
    await getOwnedProduct(
      seller.id,
      params.productId,
    );

  const { admin } =
    await getShopifyAdmin();

  const [
    response,
    metafieldDefinitions,
  ] =
    await Promise.all([
      admin.graphql(
        `#graphql
        query HairGrabEditProduct(
          $id: ID!
        ) {
          product(
            id: $id
          ) {
            id
            title
            descriptionHtml
            handle
            status
            productType
            vendor
            tags

            options { id name optionValues { id name } }

            media(first: 250) {
              nodes {
                id
                mediaContentType
                alt
                ... on MediaImage { image { url } }
                ... on Video { sources { url mimeType } }
                ... on ExternalVideo { originUrl }
              }
              pageInfo { hasNextPage endCursor }
            }

            featuredImage {
              url
              altText
            }

            metafields(
              first: 250
            ) {
              nodes {
                namespace
                key
                type
                value
              }
              pageInfo { hasNextPage endCursor }
            }

            variants(
              first: 250
            ) {
              nodes {
                id
                title
                price
                compareAtPrice
                sku
                inventoryQuantity
                selectedOptions { name value }

                inventoryItem {
                  id
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
        `,
        {
          variables: {
            id:
              coreProduct
                .shopifyProductId,
          },
        },
      ),

      getProductMetafieldDefinitions(
        admin,
      ),
    ]);

  const json =
    await response.json();

  if (
    json?.errors
      ?.length
  ) {
    throw new Error(
      json.errors
        .map(
          (
            error: {
              message?: string;
            },
          ) =>
            error.message ||
            "Unable to load product.",
        )
        .join(" | "),
    );
  }

  const product =
    json?.data
      ?.product;

  if (!product) {
    throw new Response(
      "Shopify product not found",
      {
        status: 404,
      },
    );
  }

  // Shopify connections are paginated. An incomplete baseline must never be used
  // for an edit diff, even when the seller has more than 250 variants or media.
  for (const connectionName of ["variants", "media", "metafields"] as const) {
    const connection = product[connectionName];
    while (connection?.pageInfo?.hasNextPage) {
      const pageResponse = await admin.graphql(
        connectionName === "variants" ? `#graphql
          query HairGrabEditVariantPage($id: ID!, $after: String) {
            product(id: $id) { variants(first: 250, after: $after) {
              nodes { id title price compareAtPrice sku inventoryQuantity
                selectedOptions { name value } inventoryItem { id } }
              pageInfo { hasNextPage endCursor }
            } }
          }` : connectionName === "media" ? `#graphql
          query HairGrabEditMediaPage($id: ID!, $after: String) {
            product(id: $id) { media(first: 250, after: $after) {
              nodes { id mediaContentType alt
                ... on MediaImage { image { url } }
                ... on Video { sources { url mimeType } }
                ... on ExternalVideo { originUrl }
              }
              pageInfo { hasNextPage endCursor }
            } }
          }` : `#graphql
          query HairGrabEditMetafieldPage($id: ID!, $after: String) {
            product(id: $id) { metafields(first: 250, after: $after) {
              nodes { namespace key type value }
              pageInfo { hasNextPage endCursor }
            } }
          }`,
        { variables: { id: coreProduct.shopifyProductId, after: connection.pageInfo.endCursor } },
      );
      const pageJson: any = await pageResponse.json();
      if (pageJson?.errors?.length || !pageJson?.data?.product?.[connectionName]) {
        throw new Error(`Could not load every Shopify ${connectionName} page`);
      }
      const page = pageJson.data.product[connectionName];
      connection.nodes.push(...page.nodes);
      connection.pageInfo = page.pageInfo;
    }
  }

  const shopifySnapshot: ExistingProductSnapshot = {
    options: (product.options || []).map((option: any) => ({
      id: option.id,
      name: option.name,
      values: (option.optionValues || []).map((value: any) => ({ id: value.id, name: value.name })),
    })),
    variants: (product.variants?.nodes || []).map((variant: any) => ({
      id: variant.id,
      selectedOptions: variant.selectedOptions || [],
      price: String(variant.price),
      compareAtPrice: variant.compareAtPrice == null ? null : String(variant.compareAtPrice),
      sku: variant.sku ?? null,
      inventoryQuantity: variant.inventoryQuantity ?? null,
      inventoryItemId: variant.inventoryItem?.id ?? null,
    })),
    media: (product.media?.nodes || []).map((item: any, position: number) => ({
      id: item.id,
      mediaContentType: item.mediaContentType,
      alt: item.alt ?? null,
      url: item.image?.url || item.sources?.[0]?.url || item.originUrl || null,
      position,
    })),
  };
  // Refuse to render an edit form whose unchanged graph does not round-trip.
  const unchangedVariants = diffVariants(shopifySnapshot.variants, hydrateVariantEditState(shopifySnapshot));
  const unchangedMedia = diffMedia(shopifySnapshot.media, hydrateMediaEditState(shopifySnapshot));
  if (unchangedVariants.creates.length || unchangedVariants.updates.length || unchangedVariants.deletes.length ||
      unchangedMedia.creates.length || unchangedMedia.detaches.length || unchangedMedia.reorder) {
    throw new Error("Shopify product failed the no-change round-trip check");
  }

  const productMetafields =
    (
      product.metafields
        ?.nodes || []
    ) as ProductMetafield[];

  const legacyShipping =
    getMetafieldByDefinitionName(
      productMetafields,
      metafieldDefinitions,
      [
        "Shipping Method / Shipping Options",
        "Shipping Method / Shipping",
        "Shipping Method",
        "Shipping Methods",
      ],
    );

  const originalShippingMethod =
    getMetafieldValue(
      productMetafields,
      "hairgrab",
      "shipping_charge_type",
    ) ||
    legacyShipping ||
    "Free Shipping";
  let shippingMethod = originalShippingMethod;

  if (
    shippingMethod.includes(
      "Flat Rate",
    )
  ) {
    shippingMethod =
      "Flat Rate Shipping";
  }

  if (
    shippingMethod.includes(
      "Free",
    )
  ) {
    shippingMethod =
      "Free Shipping";
  }

  if (
    shippingMethod.includes(
      "Calculated",
    )
  ) {
    shippingMethod =
      "Free Shipping";
  }

  return {
    seller: {
      businessName:
        seller.businessName,

      sellsNationwide:
        seller.sellsNationwide,

      offersLocalPickup:
        seller.offersLocalPickup,

      offersLocalDelivery:
        seller.offersLocalDelivery,

      // Needed to build the seller's own public storefront link
      // (see the "Store View" button below) using the same
      // convention already established in
      // app/routes/api.featured-boutiques.tsx:
      // https://shops.hairgrab.com/seller-store/${storeSlug}
      storeSlug:
        seller.storeSlug || "",

      storefrontPublished:
        seller.storefrontPublished,
    },

    coreProductId:
      coreProduct.id,

    product,
    shopifySnapshot,

    settings: {
      builderShippingMethod: originalShippingMethod,
      ...(() => {
        const hydrated = hydrateSellerAttributes({
          tags: product.tags || [],
          metafields: productMetafields,
          named: {
            material: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Hair Type", "Material"]),
            colors: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Color"]),
            texture: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Texture"]),
            density: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Density"]),
            laceType: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Lace Type"]),
            laceSize: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Lace Size"]),
            capSize: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Cap Size"]),
            capType: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Cap Type"]),
            shipsWithin: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Ships Within"]),
            sameDayDelivery:
              getMetafieldValue(productMetafields, "custom", "same_day_delivery") === "true" ||
              getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Same Day Delivery", "Same-Day Delivery"]) === "true",
            bundleWeight: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Bundle Weight", "Weight"]) ||
              getMetafieldValue(productMetafields, "hairgrab", "bundle_weight"),
            extensionType: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Extension Type"]) ||
              getMetafieldValue(productMetafields, "hairgrab", "extension_type"),
          },
        });
        return hydrated;
      })(),
      // Read back through the same named-definition-first, documented
      // hairgrab-namespace-fallback path the action writes through below,
      // so existing products (with or without an Admin metafield
      // definition for either field) keep working.
      pieceCount: getMetafieldByDefinitionName(productMetafields, metafieldDefinitions, ["Piece Count", "Number of Pieces"]) ||
        getMetafieldValue(productMetafields, "hairgrab", "piece_count"),
      locType: getMetafieldValue(productMetafields, "hairgrab", "loc_type"),
      shippingMethod,

      flatRateShipping:
        getMetafieldValue(
          productMetafields,
          "hairgrab",
          "flat_rate_shipping",
        ),

      returnPolicy:
        getMetafieldByDefinitionName(
          productMetafields,
          metafieldDefinitions,
          [
            "Return Policy",
          ],
        ),

      showOnMap:
        getMetafieldByDefinitionName(
          productMetafields,
          metafieldDefinitions,
          [
            "Show on HairGrab Map",
          ],
        ),

      localPickupAvailable:
        getMetafieldValue(
          productMetafields,
          "hairgrab",
          "local_pickup_available",
        ) === "true",

      localDeliveryAvailable:
        getMetafieldValue(
          productMetafields,
          "hairgrab",
          "local_delivery_available",
        ) === "true",

      searchClassifications:
        CLASSIFICATION_TAGS.filter(
          (
            tag,
          ) => {
            const tags =
              (
                product.tags ||
                []
              ) as string[];

            if (
              tag ===
                "Locs" &&
              tags.includes(
                "Locs / Locks",
              )
            ) {
              return true;
            }

            return tags.includes(
              tag,
            );
          },
        ),
    },
  };
};

export const action = async ({
  request,
  params,
  context,
}: ActionFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  try {
    const coreProduct =
      await getOwnedProduct(
        seller.id,
        params.productId,
      );

    const formData =
      await request.formData();

    const intent =
      String(
        formData.get(
          "intent",
        ) || "save",
      ).trim();

    if (
      intent ===
      "delete"
    ) {
      const { admin } =
        await getShopifyAdmin();

      const deleteResponse =
        await admin.graphql(
          `#graphql
          mutation HairGrabDeleteSellerProduct(
            $input: ProductDeleteInput!
          ) {
            productDelete(
              input: $input
            ) {
              deletedProductId

              userErrors {
                field
                message
              }
            }
          }
          `,
          {
            variables: {
              input: {
                id:
                  coreProduct
                    .shopifyProductId,
              },
            },
          },
        );

      const deleteJson =
        await deleteResponse.json();

      const deleteResult =
        deleteJson?.data
          ?.productDelete;

      const deleteErrors =
        deleteResult
          ?.userErrors ||
        [];

      if (
        deleteErrors.length >
        0
      ) {
        throw new Error(
          deleteErrors
            .map(
              (
                e: {
                  message?: string;
                },
              ) =>
                e.message ||
                "Unable to delete product.",
            )
            .join(" | "),
        );
      }

      if (
        !deleteResult
          ?.deletedProductId
      ) {
        throw new Error(
          "Shopify did not confirm the product deletion.",
        );
      }

      await db.sellerProduct.delete({
        where: {
          id:
            coreProduct.id,
        },
      });

      return redirect(
        "/seller/products",
      );
    }

    if (intent === "builderSave") {
      const submitted = JSON.parse(String(formData.get("builderEdit") || "null"));
      if (!submitted?.baseline || !submitted?.variants || !submitted?.media || !submitted?.fields || !Array.isArray(submitted.changedFields)) {
        throw new Error("Incomplete product edit request");
      }
      const current = await loader({ request, params, context } as LoaderFunctionArgs) as Awaited<ReturnType<typeof loader>>;
      if (JSON.stringify(submitted.baseline) !== JSON.stringify(current.shopifySnapshot)) {
        throw new Error("This product changed in Shopify while you were editing. Reload before saving to preserve the latest data.");
      }
      const variantDiff = diffVariants(current.shopifySnapshot.variants, submitted.variants);
      const mediaDiff = diffMedia(current.shopifySnapshot.media, submitted.media);
      const fields = submitted.fields as Record<string, any>;
      const allowedFields = new Set(["title", "description", "productType", "selectedOptions", "searchClassifications", "installationMethods", "locType",
        "material", "colors", "texture", "density", "laceSize", "laceType", "capSize", "capType", "bundleWeight", "pieceCount", "lengths", "shippingMethod", "flatRateShipping",
        "localPickupAvailable", "localDeliveryAvailable", "sameDayDelivery", "shipsWithin", "returnPolicy", "showOnMap"]);
      const dirty = new Set<string>(submitted.changedFields);
      if ([...dirty].some((key) => !allowedFields.has(key))) throw new Error("Unsupported product field in edit request");
      const mediaFiles = [...formData.entries()].filter(([key]) => key.startsWith("media:")).map(([key, value]) => ({ key: key.slice(6), file: value as File }));
      if (!dirty.size && !variantDiff.creates.length && !variantDiff.updates.length && !variantDiff.deletes.length &&
          !mediaDiff.creates.length && !mediaDiff.detaches.length && !mediaDiff.reorder && !mediaFiles.length) {
        return { success: true, message: "Product already up to date.", productHandle: String(current.product.handle || "") };
      }
      const { admin } = await getShopifyAdmin();
      const productId = String(coreProduct.shopifyProductId);
      const productInput: Record<string, unknown> = { id: productId };
      if (dirty.has("title")) {
        if (!String(fields.title || "").trim()) throw new Error("Product title is required");
        productInput.title = String(fields.title).trim();
      }
      if (dirty.has("description")) productInput.descriptionHtml = `<p>${String(fields.description || "").trim().replace(/\n/g, "</p><p>")}</p>`;
      if (dirty.has("productType")) {
        if (!Object.prototype.hasOwnProperty.call(PRODUCT_CATEGORY_LABELS, String(fields.productType))) throw new Error("Choose a valid HairGrab product category");
        // CANONICAL value, not displayProductCategory()'s shopper-facing
        // label (Phase 2A safety fix) -- this must match what's already
        // live on the product so editing never drifts productType.
        const category = productTypeToCategoryLabel(fields.productType as ProductType);
        productInput.productType = category;
      }
      const tags = new Set(current.product.tags as string[]);
      if (dirty.has("productType")) {
        tags.delete(current.product.productType);
        tags.add(String(productInput.productType));
      }
      if (dirty.has("selectedOptions")) {
        for (const choice of Object.values(productOptions).flat()) tags.delete(choice.label);
        for (const value of fields.selectedOptions || []) {
          const choice = (productOptions[fields.productType as keyof typeof productOptions] || []).find((item) => item.value === value);
          if (choice) tags.add(choice.label);
        }
      }
      if (dirty.has("searchClassifications")) {
        for (const choice of Object.values(productClassifications).flat()) tags.delete(choice.label);
        tags.delete("Locs / Locks");
        for (const value of fields.searchClassifications || []) {
          const choice = (productClassifications[fields.productType as keyof typeof productClassifications] || []).find((item) => item.value === value);
          if (choice) tags.add(choice.label);
        }
      }
      if (dirty.has("installationMethods")) {
        for (const choice of installationMethodChoices) tags.delete(choice.label);
        for (const value of fields.installationMethods || []) {
          const choice = installationMethodChoices.find((item) => item.value === value);
          if (choice) tags.add(choice.label);
        }
      }
      if (dirty.has("locType")) {
        for (const choice of locTypeChoices) tags.delete(choice.label);
        const choice = locTypeChoices.find((item) => item.value === fields.locType);
        if (choice) tags.add(choice.label);
      }
      const replaced = replaceAttributeTags(tags, sellerProductAttributeTags({
        ...fields,
        hairCategory: PRODUCT_CATEGORY_LABELS[fields.productType as ProductType] || String(productInput.productType || current.product.productType || ""),
      }));
      tags.clear();
      for (const tag of replaced) tags.add(tag);
      productInput.tags = [...tags];
      if (Object.keys(productInput).length > 1) {
        const response = await admin.graphql(`#graphql
          mutation HairGrabBuilderEditProduct($product: ProductUpdateInput!) {
            productUpdate(product: $product) { product { id } userErrors { field message } }
          }`, { variables: { product: productInput } });
        const json: any = await response.json();
        const errors = [...(json.errors || []), ...(json.data?.productUpdate?.userErrors || [])];
        if (errors.length) throw new Error(errors.map((error: any) => error.message).join(" | "));
      }
      const locationId = await getPrimaryLocationId(admin);
      const effectiveShippingMethod = dirty.has("shippingMethod") ? String(fields.shippingMethod) : String(current.settings.builderShippingMethod || current.settings.shippingMethod);
      if ((variantDiff.creates.length || dirty.has("shippingMethod") || dirty.has("flatRateShipping")) &&
          !["Free Shipping", "Flat Rate Shipping"].includes(effectiveShippingMethod)) {
        throw new Error("This product uses an unsupported legacy shipping method. Choose a supported shipping method before adding variants.");
      }
      const createdIds = await reconcileVariants(admin, productId, locationId, variantDiff, current.shopifySnapshot.variants);
      if (createdIds.length || dirty.has("shippingMethod") || dirty.has("flatRateShipping")) {
        await syncHairGrabShippingProfile({ admin, locationId,
          variantIds: [...current.shopifySnapshot.variants.map((item) => item.id).filter((id) => !variantDiff.deletes.includes(id)), ...createdIds],
          shippingMethod: effectiveShippingMethod,
          flatRateShipping: dirty.has("flatRateShipping") ? String(fields.flatRateShipping || "") : String(current.settings.flatRateShipping || "") });
      }
      await reconcileMedia(admin, productId, mediaDiff, submitted.media.order, mediaFiles);
      const definitions = await getProductMetafieldDefinitions(admin);
      const metafields: ProductMetafield[] = [];
      const deleteMetafields: Array<{ ownerId: string; namespace: string; key: string }> = [];
      const existingMetafields = (current.product.metafields?.nodes || []) as ProductMetafield[];
      const removeIfPresent = (namespace: string, key: string) => {
        if (existingMetafields.some((item) => item.namespace === namespace && item.key === key)) {
          deleteMetafields.push({ ownerId: productId, namespace, key });
        }
      };
      if (dirty.has("productType") || dirty.has("selectedOptions")) {
        const definition = findMetafieldDefinition(definitions, ["Hair Category"]);
        if (definition) {
          const category = PRODUCT_CATEGORY_LABELS[fields.productType as ProductType];
          let value = category || current.product.productType;
          if (fields.productType === "EXTENSION") {
            const extensionOptions = fields.selectedOptions || [];
            value = extensionOptions.includes("CLIP_IN") ? "Clip-Ins" : extensionOptions.includes("TAPE_IN") ? "Tape-Ins" :
              extensionOptions.includes("I_TIP") ? "I-Tips & K Tips" : extensionOptions.includes("HALO") ? "Halo Extensions" : "Other";
          }
          addExistingMetafield({ definitions, output: metafields, names: ["Hair Category"], value });
        }
        const extensionDefinition = findMetafieldDefinition(definitions, ["Extension Type"]);
        if (fields.productType === "EXTENSION") {
          addExistingMetafield({
            definitions,
            output: metafields,
            names: ["Extension Type"],
            value: extensionTypeFromOptions(fields.selectedOptions),
            fallback: extensionDefinition ? undefined : EXTENSION_TYPE_METAFIELD,
          });
        } else {
          if (extensionDefinition) removeIfPresent(extensionDefinition.namespace, extensionDefinition.key);
          removeIfPresent(EXTENSION_TYPE_METAFIELD.namespace, EXTENSION_TYPE_METAFIELD.key);
        }
      }
      const namedFields: Array<{
        key: string;
        names: string[];
        fallback?: { namespace: string; key: string; type: string };
        always?: boolean;
      }> = [
        { key: "material", names: ["Hair Type", "Material"], fallback: { namespace: "custom", key: "material", type: "single_line_text_field" }, always: true },
        { key: "texture", names: ["Texture"], fallback: { namespace: "custom", key: "texture", type: "single_line_text_field" }, always: true },
        { key: "density", names: ["Density"], fallback: { namespace: "custom", key: "density", type: "single_line_text_field" }, always: true },
        { key: "laceSize", names: ["Lace Size"], fallback: { namespace: "custom", key: "lace_size", type: "single_line_text_field" }, always: true },
        { key: "laceType", names: ["Lace Type"], fallback: { namespace: "custom", key: "lace_type", type: "single_line_text_field" }, always: true },
        { key: "capSize", names: ["Cap Size"], fallback: { namespace: "custom", key: "cap_size", type: "single_line_text_field" }, always: true },
        { key: "capType", names: ["Cap Type"], fallback: { namespace: "custom", key: "cap_type", type: "single_line_text_field" }, always: true },
        { key: "shippingMethod", names: ["Shipping Method / Shipping Options", "Shipping Method / Shipping", "Shipping Method", "Shipping Methods"] },
        { key: "shipsWithin", names: ["Ships Within"], fallback: { namespace: "custom", key: "ships_within", type: "single_line_text_field" }, always: true },
        { key: "returnPolicy", names: ["Return Policy"] },
        { key: "showOnMap", names: ["Show on HairGrab Map"] },
      ];
      for (const { key, names, fallback, always } of namedFields) if (always || dirty.has(key)) {
        const value = key === "shipsWithin"
          ? normalizeShipsWithin(String(fields.shipsWithin || (fields.sameDayDelivery ? "Same Day" : "")))
          : key === "density"
            ? normalizeDensity(String(fields.density || ""))
            : key === "capType"
              ? String(fields.capType || fields.capSize || "")
            : String(fields[key] || "");
        if (value) addExistingMetafield({ definitions, output: metafields, names, value, fallback });
        else if (dirty.has(key)) {
          const definition = findMetafieldDefinition(definitions, names);
          if (definition) removeIfPresent(definition.namespace, definition.key);
          if (fallback) removeIfPresent(fallback.namespace, fallback.key);
        }
      }
      addExistingMetafield({
        definitions,
        output: metafields,
        names: ["Same Day Delivery", "Same-Day Delivery"],
        value: Boolean(fields.sameDayDelivery) || String(fields.shipsWithin || "").toLowerCase() === "same day",
        fallback: { namespace: "custom", key: "same_day_delivery", type: "boolean" },
      });
      // bundleWeight/pieceCount cannot use the namedFields loop above:
      // that loop silently no-ops when no Shopify Admin metafield
      // definition exists yet (addExistingMetafield returns early with
      // no definition). These two values must never be silently
      // discarded that way -- if a named definition exists it's used
      // (same helper, same behavior as every other field); otherwise a
      // documented, fixed hairgrab-namespace metafield is written so the
      // seller's saved value is preserved either way.
      if (String(fields.bundleWeight || "") || dirty.has("bundleWeight")) {
        const value = String(fields.bundleWeight || "");
        const definition = findMetafieldDefinition(definitions, ["Bundle Weight", "Weight"]);
        if (value) {
          if (definition) addExistingMetafield({ definitions, output: metafields, names: ["Bundle Weight", "Weight"], value });
          else metafields.push({ namespace: "hairgrab", key: "bundle_weight", type: "single_line_text_field", value });
        } else {
          if (definition) removeIfPresent(definition.namespace, definition.key);
          removeIfPresent("hairgrab", "bundle_weight");
        }
      }
      const lengthValues = [...new Set((fields.lengths || []).map((item: string) => String(item || "").trim()).filter(Boolean))];
      if (lengthValues.length) {
        const definition = findMetafieldDefinition(definitions, ["Length"]);
        if (definition) {
          metafields.push({
            namespace: definition.namespace,
            key: definition.key,
            type: definition.type.name,
            value: definition.type.name.startsWith("list.")
              ? JSON.stringify(lengthValues)
              : lengthValues[0],
          });
        }
      }
      if (fields.productType === "EXTENSION") {
        addExistingMetafield({
          definitions,
          output: metafields,
          names: ["Extension Type"],
          value: extensionTypeFromOptions(fields.selectedOptions),
          fallback: EXTENSION_TYPE_METAFIELD,
        });
      }
      if (dirty.has("pieceCount")) {
        const value = String(fields.pieceCount || "");
        const definition = findMetafieldDefinition(definitions, ["Piece Count", "Number of Pieces"]);
        if (value) {
          // Safety-review fix: pieceCount has no fixed choice list (a
          // 7-piece set must never be collapsed into a "5+" bucket), so
          // it's validated here as a plain positive whole number and,
          // when no Admin metafield definition exists yet, stored as
          // number_integer (not single_line_text_field) so it stays
          // filterable/sortable once Search & Discovery filtering is
          // enabled for it. Matches seller.add-product.tsx's create path.
          if (!/^[1-9][0-9]*$/.test(value)) {
            throw new Error("Piece Count must be a whole number greater than 0 (e.g. 7).");
          }
          if (definition) addExistingMetafield({ definitions, output: metafields, names: ["Piece Count", "Number of Pieces"], value });
          else metafields.push({ namespace: "hairgrab", key: "piece_count", type: "number_integer", value });
        } else {
          if (definition) removeIfPresent(definition.namespace, definition.key);
          removeIfPresent("hairgrab", "piece_count");
        }
      }
      if (dirty.has("colors")) {
        const definition = findMetafieldDefinition(definitions, ["Color"]);
        if (definition) {
          if ((fields.colors || []).length) metafields.push({ namespace: definition.namespace, key: definition.key, type: definition.type.name,
            value: definition.type.name.startsWith("list.") ? JSON.stringify(fields.colors || []) : String(fields.colors?.[0] || "") });
          else removeIfPresent(definition.namespace, definition.key);
        }
      }
      if (dirty.has("installationMethods")) metafields.push({ namespace: "hairgrab", key: "installation_methods",
        type: "list.single_line_text_field", value: JSON.stringify(installationMethodChoices
          .filter((item) => (fields.installationMethods || []).includes(item.value)).map((item) => item.label)) });
      const optionsChanged = variantDiff.creates.length || variantDiff.deletes.length || variantDiff.updates.some((item) =>
        JSON.stringify(item.selectedOptions) !== JSON.stringify(current.shopifySnapshot.variants.find((before) => before.id === item.id)?.selectedOptions));
      if (optionsChanged && current.shopifySnapshot.options.some((axis) => axis.name.toLowerCase() === "length")) {
        const definition = findMetafieldDefinition(definitions, ["Length"]);
        if (definition) {
          const changedById = new Map(variantDiff.updates.map((item) => [item.id, item]));
          const desiredVariants = [...current.shopifySnapshot.variants.filter((item) => !variantDiff.deletes.includes(item.id))
            .map((item) => changedById.get(item.id) || item), ...variantDiff.creates];
          const values = [...new Set(desiredVariants.flatMap((item) => item.selectedOptions.filter((option) => option.name.toLowerCase() === "length")
            .map((option) => option.value.replace(/\D/g, ""))).filter(Boolean))];
          metafields.push({ namespace: definition.namespace, key: definition.key, type: definition.type.name,
            value: definition.type.name.startsWith("list.") ? JSON.stringify(values) : values.join(", ") });
        }
      }
      const direct: Array<[string, string, string]> = [
        ["shippingMethod", "shipping_charge_type", "single_line_text_field"],
        ["flatRateShipping", "flat_rate_shipping", "number_decimal"],
        ["localPickupAvailable", "local_pickup_available", "boolean"],
        ["localDeliveryAvailable", "local_delivery_available", "boolean"],
        ["locType", "loc_type", "single_line_text_field"],
      ];
      for (const [key, metafieldKey, type] of direct) if (dirty.has(key)) {
        const value = key === "locType" ? (locTypeChoices.find((item) => item.value === fields.locType)?.label || "") : String(fields[key] ?? "");
        if (value) metafields.push({ namespace: "hairgrab", key: metafieldKey, type, value });
        else removeIfPresent("hairgrab", metafieldKey);
      }
      if (metafields.length) await setProductMetafieldsSafely({ admin, productId, metafields });
      if (deleteMetafields.length) {
        try {
          const response = await admin.graphql(`#graphql
            mutation HairGrabBuilderDeleteMetafields($metafields: [MetafieldIdentifierInput!]!) {
              metafieldsDelete(metafields: $metafields) { userErrors { field message } }
            }`, { variables: { metafields: deleteMetafields } });
          const json: any = await response.json();
          const errors = [...(json.errors || []), ...(json.data?.metafieldsDelete?.userErrors || [])];
          if (errors.length) {
            console.warn(
              "[HairGrab Core] Skipping metafield delete errors:",
              errors.map((error: any) => error.message).join(" | "),
            );
          }
        } catch (error) {
          console.warn("[HairGrab Core] Could not delete unused metafields:", error);
        }
      }
      if (dirty.has("title")) await db.sellerProduct.update({ where: { id: coreProduct.id }, data: { title: String(fields.title).trim() } });
      return { success: true, message: "Product updated successfully in HairGrab and Shopify.", productHandle: String(current.product.handle || "") };
    }

    throw new Error("Unsupported Edit Product action");
  } catch (error) {
    console.error(
      "[HairGrab Core] Product update error:",
      error,
    );

    return {
      success:
        false,

      message:
        error instanceof
        Error
          ? error.message
          : "HairGrab could not update this product.",
    };
  }
};

export default function SellerEditProductPage() {
  const { product, seller, settings, shopifySnapshot, coreProductId } = useLoaderData<typeof loader>();
  const edit: EditBuilderData = { product, settings, shopifySnapshot, coreProductId };
  const storefrontHref = seller.storeSlug && seller.storefrontPublished
    ? `https://shops.hairgrab.com/seller-store/${seller.storeSlug}`
    : "/seller/store-preview";
  return <>
    <div style={{ maxWidth: 920, margin: "18px auto 0", display: "flex", justifyContent: "space-between", padding: "0 18px" }}>
      <Link to="/seller/products">← Back to Products</Link>
      <a href={storefrontHref} target="_blank" rel="noreferrer">Store View</a>
    </div>
    <ProductBuilder seller={seller} edit={edit} />
    <Form method="post" style={{ maxWidth: 920, margin: "0 auto 50px", padding: "0 18px" }}
      onSubmit={(event) => { if (!window.confirm("Delete this product from Shopify and HairGrab?")) event.preventDefault(); }}>
      <input type="hidden" name="intent" value="delete" />
      <button type="submit" style={{ background: "white", border: "1px solid #c88", borderRadius: 8, color: "#9b2525", padding: "9px 12px" }}>Delete Product</button>
    </Form>
  </>;
}
