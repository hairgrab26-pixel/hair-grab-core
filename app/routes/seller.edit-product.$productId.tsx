import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { requireSellerSession } from "../seller-session.server";
import { syncHairGrabShippingProfile } from "../hairgrab-shipping.server";

type ShopifyMetafieldDefinition = {
  name: string;
  namespace: string;
  key: string;
  type: { name: string };
  validations: Array<{ name: string; value: string | null }>;
};

type ProductMetafield = {
  namespace: string;
  key: string;
  type: string;
  value: string;
};

const CLASSIFICATION_TAGS = [
  "Kosher Wig",
  "Medical Wig",
  "Crochet Hair",
  "Locs / Locks",
];

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

function findMetafieldDefinition(
  definitions: ShopifyMetafieldDefinition[],
  names: string[],
) {
  const wanted = names.map(normalizeMetafieldName);

  return definitions.find((definition) =>
    wanted.includes(
      normalizeMetafieldName(definition.name),
    ),
  );
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

  if (
    definition.type.name ===
    "boolean"
  ) {
    return String(
      Boolean(value),
    );
  }

  return resolved ?? raw;
}

function addExistingMetafield({
  definitions,
  output,
  names,
  value,
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

  const definition =
    findMetafieldDefinition(
      definitions,
      names,
    );

  if (!definition) {
    return;
  }

  const prepared =
    prepareMetafieldValue(
      definition,
      value,
    );

  if (prepared === null) {
    return;
  }

  output.push({
    namespace:
      definition.namespace,
    key:
      definition.key,
    type:
      definition.type.name,
    value:
      prepared,
  });
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

    if (
      errors.length > 0
    ) {
      console.warn(
        `[HairGrab Core] Could not update metafield ${metafield.namespace}.${metafield.key}:`,
        errors,
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
  const definition =
    findMetafieldDefinition(
      definitions,
      names,
    );

  if (!definition) {
    return "";
  }

  return getMetafieldValue(
    productMetafields,
    definition.namespace,
    definition.key,
  );
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

            featuredImage {
              url
              altText
            }

            metafields(
              first: 100
            ) {
              nodes {
                namespace
                key
                type
                value
              }
            }

            variants(
              first: 100
            ) {
              nodes {
                id
                title
                price
                sku
                inventoryQuantity

                inventoryItem {
                  id
                }
              }
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

  let shippingMethod =
    getMetafieldValue(
      productMetafields,
      "hairgrab",
      "shipping_charge_type",
    ) ||
    legacyShipping ||
    "Free Shipping";

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
    },

    coreProductId:
      coreProduct.id,

    product,

    settings: {
      shippingMethod,

      flatRateShipping:
        getMetafieldValue(
          productMetafields,
          "hairgrab",
          "flat_rate_shipping",
        ),

      shipsWithin:
        getMetafieldByDefinitionName(
          productMetafields,
          metafieldDefinitions,
          [
            "Ships Within",
          ],
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
          ) =>
            (
              product.tags ||
              []
            ).includes(
              tag,
            ),
        ),
    },
  };
};

export const action = async ({
  request,
  params,
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

    const title =
      String(
        formData.get(
          "title",
        ) || "",
      ).trim();

    const description =
      String(
        formData.get(
          "description",
        ) || "",
      ).trim();

    if (!title) {
      return {
        success:
          false,
        message:
          "Product name is required.",
      };
    }

    const shippingMethod =
      String(
        formData.get(
          "shippingMethod",
        ) ||
        "Free Shipping",
      ).trim();

    const flatRateShipping =
      String(
        formData.get(
          "flatRateShipping",
        ) || "",
      ).trim();

    if (
      shippingMethod !==
        "Free Shipping" &&
      shippingMethod !==
        "Flat Rate Shipping"
    ) {
      return {
        success: false,
        message:
          "Choose Free Shipping or Flat Rate Shipping.",
      };
    }

    const shipsWithin =
      String(
        formData.get(
          "shipsWithin",
        ) ||
        "48 Hours",
      ).trim();

    const returnPolicy =
      String(
        formData.get(
          "returnPolicy",
        ) ||
        "14-Day Returns",
      ).trim();

    const showOnMap =
      String(
        formData.get(
          "showOnMap",
        ) || "No",
      ).trim();

    const localPickupAvailable =
      seller.offersLocalPickup &&
      formData.get(
        "localPickupAvailable",
      ) === "on";

    const localDeliveryAvailable =
      seller.offersLocalDelivery &&
      formData.get(
        "localDeliveryAvailable",
      ) === "on";

    const searchClassifications =
      formData
        .getAll(
          "searchClassifications",
        )
        .map(String)
        .filter(
          (
            value,
          ) =>
            CLASSIFICATION_TAGS.includes(
              value,
            ),
        );

    if (
      shippingMethod ===
      "Flat Rate Shipping"
    ) {
      const amount =
        Number(
          flatRateShipping,
        );

      if (
        !Number.isFinite(
          amount,
        ) ||
        amount <= 0
      ) {
        return {
          success:
            false,
          message:
            "Enter a flat-rate shipping amount greater than $0.",
        };
      }
    }

    const variants =
      JSON.parse(
        String(
          formData.get(
            "variants",
          ) || "[]",
        ),
      ) as Array<{
        id: string;
        inventoryItemId:
          string;
        price: string;
        sku: string;
        inventory:
          string;
      }>;

    const { admin } =
      await getShopifyAdmin();

    const currentResponse =
      await admin.graphql(
        `#graphql
        query HairGrabEditCurrentTags(
          $id: ID!
        ) {
          product(
            id: $id
          ) {
            tags
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
      );

    const currentJson =
      await currentResponse.json();

    const currentTags =
      (
        currentJson?.data
          ?.product
          ?.tags ||
        []
      ) as string[];

    const preservedTags =
      currentTags.filter(
        (
          tag,
        ) =>
          !CLASSIFICATION_TAGS.includes(
            tag,
          ),
      );

    const tags =
      [
        ...new Set([
          ...preservedTags,
          ...searchClassifications,
        ]),
      ];

    const productResponse =
      await admin.graphql(
        `#graphql
        mutation HairGrabUpdateSellerProduct(
          $product: ProductUpdateInput!
        ) {
          productUpdate(
            product: $product
          ) {
            product {
              id
              title
              handle
              status
              tags
            }

            userErrors {
              field
              message
            }
          }
        }
        `,
        {
          variables: {
            product: {
              id:
                coreProduct
                  .shopifyProductId,

              title,

              descriptionHtml:
                `<p>${description.replace(
                  /\n/g,
                  "</p><p>",
                )}</p>`,

              tags,
            },
          },
        },
      );

    const productJson =
      await productResponse.json();

    const productErrors =
      productJson?.data
        ?.productUpdate
        ?.userErrors ||
      [];

    if (
      productErrors.length >
      0
    ) {
      throw new Error(
        productErrors
          .map(
            (
              e: {
                message?: string;
              },
            ) =>
              e.message ||
              "Unable to update product.",
          )
          .join(" | "),
      );
    }

    if (
      variants.length >
      0
    ) {
      const variantResponse =
        await admin.graphql(
          `#graphql
          mutation HairGrabUpdateSellerVariants(
            $productId: ID!
            $variants: [ProductVariantsBulkInput!]!
          ) {
            productVariantsBulkUpdate(
              productId: $productId
              variants: $variants
            ) {
              productVariants {
                id
                price
                sku
              }

              userErrors {
                field
                message
              }
            }
          }
          `,
          {
            variables: {
              productId:
                coreProduct
                  .shopifyProductId,

             variants:
  variants.map(
    (
      variant,
    ) => ({
      id:
        variant.id,

      price:
        Number(
          variant.price,
        ),

      inventoryItem: {
        sku:
          variant.sku
            .trim() ||
          null,
      },
    }),
  ),
            },
          },
        );

      const variantJson =
        await variantResponse.json();

      const variantErrors =
        variantJson?.data
          ?.productVariantsBulkUpdate
          ?.userErrors ||
        [];

      if (
        variantErrors.length >
        0
      ) {
        throw new Error(
          variantErrors
            .map(
              (
                e: {
                  message?: string;
                },
              ) =>
                e.message ||
                "Unable to update variants.",
            )
            .join(" | "),
        );
      }

      const locationId =
        await getPrimaryLocationId(
          admin,
        );

      const inventoryQuantities =
        variants
          .filter(
            (
              variant,
            ) =>
              variant
                .inventoryItemId &&
              variant.inventory
                .trim() !==
                "" &&
              Number.isFinite(
                Number(
                  variant.inventory,
                ),
              ),
          )
          .map(
            (
              variant,
            ) => ({
              inventoryItemId:
                variant
                  .inventoryItemId,

              locationId,

              quantity:
                Math.max(
                  0,
                  Math.floor(
                    Number(
                      variant.inventory,
                    ),
                  ),
                ),

              changeFromQuantity:
                null,
            }),
          );

      if (
        inventoryQuantities.length >
        0
      ) {
        const inventoryResponse =
          await admin.graphql(
            `#graphql
            mutation HairGrabSetSellerInventory(
              $input: InventorySetQuantitiesInput!
              $idempotencyKey: String!
            ) {
              inventorySetQuantities(
                input: $input
              ) @idempotent(key: $idempotencyKey) {
                userErrors {
                  field
                  message
                }
              }
            }
            `,
            {
              variables: {
                idempotencyKey:
                  randomUUID(),

                input: {
                  name:
                    "available",

                  reason:
                    "correction",

                  referenceDocumentUri:
                    `hairgrab://seller-product/${coreProduct.id}`,

                  quantities:
                    inventoryQuantities,
                },
              },
            },
          );

        const inventoryJson =
          await inventoryResponse.json();

        const inventoryErrors =
          inventoryJson?.data
            ?.inventorySetQuantities
            ?.userErrors ||
          [];

        if (
          inventoryErrors.length >
          0
        ) {
          throw new Error(
            inventoryErrors
              .map(
                (
                  e: {
                    message?: string;
                  },
                ) =>
                  e.message ||
                  "Unable to update inventory.",
              )
              .join(" | "),
          );
        }
      }
    }

    const definitions =
      await getProductMetafieldDefinitions(
        admin,
      );

    const metafields:
      ProductMetafield[] = [
      {
        namespace:
          "hairgrab",
        key:
          "shipping_charge_type",
        type:
          "single_line_text_field",
        value:
          shippingMethod,
      },

      {
        namespace:
          "hairgrab",
        key:
          "local_pickup_available",
        type:
          "boolean",
        value:
          String(
            Boolean(
              localPickupAvailable,
            ),
          ),
      },

      {
        namespace:
          "hairgrab",
        key:
          "local_delivery_available",
        type:
          "boolean",
        value:
          String(
            Boolean(
              localDeliveryAvailable,
            ),
          ),
      },
    ];

    if (
      shippingMethod ===
      "Flat Rate Shipping"
    ) {
      metafields.push({
        namespace:
          "hairgrab",
        key:
          "flat_rate_shipping",
        type:
          "number_decimal",
        value:
          Number(
            flatRateShipping,
          ).toFixed(2),
      });
    }

    addExistingMetafield({
      definitions,
      output:
        metafields,

      names: [
        "Shipping Method / Shipping Options",
        "Shipping Method / Shipping",
        "Shipping Method",
        "Shipping Methods",
      ],

      value:
        shippingMethod,
    });

    addExistingMetafield({
      definitions,
      output:
        metafields,
      names: [
        "Ships Within",
      ],
      value:
        shipsWithin,
    });

    addExistingMetafield({
      definitions,
      output:
        metafields,
      names: [
        "Return Policy",
      ],
      value:
        returnPolicy,
    });

    addExistingMetafield({
      definitions,
      output:
        metafields,
      names: [
        "Show on HairGrab Map",
      ],
      value:
        showOnMap,
    });

    addExistingMetafield({
      definitions,
      output:
        metafields,
      names: [
        "Shipping Territory",
      ],
      value:
        seller.sellsNationwide
          ? "Nationwide"
          : "Local",
    });

    await setProductMetafieldsSafely({
      admin,
      productId:
        coreProduct
          .shopifyProductId,
      metafields,
    });

    const shippingLocationId =
      await getPrimaryLocationId(
        admin,
      );

    await syncHairGrabShippingProfile({
      admin,
      locationId:
        shippingLocationId,
      variantIds:
        variants.map(
          (variant) =>
            variant.id,
        ),
      shippingMethod,
      flatRateShipping,
    });

    await db.sellerProduct.update({
      where: {
        id:
          coreProduct.id,
      },

      data: {
        title,
      },
    });

    return {
      success:
        true,
      message:
        "Product updated successfully in HairGrab and Shopify.",
    };
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

function stripHtml(
  html: string,
) {
  return String(
    html || "",
  )
    .replace(
      /<br\s*\/?>/gi,
      "\n",
    )
    .replace(
      /<\/p>/gi,
      "\n",
    )
    .replace(
      /<[^>]+>/g,
      "",
    )
    .replace(
      /\n{3,}/g,
      "\n\n",
    )
    .trim();
}

export default function SellerEditProductPage() {
  const {
    product,
    seller,
    settings,
  } =
    useLoaderData<
      typeof loader
    >();

  const actionData =
    useActionData<
      typeof action
    >();

  const variants =
    product
      .variants
      ?.nodes ||
    [];

  return (
    <div
      style={{
        minHeight:
          "100vh",
        background:
          "#faf8fc",
        padding:
          "28px 18px 70px",
        fontFamily:
          "Arial, sans-serif",
        color:
          "#21152a",
      }}
    >
      <div
        style={{
          maxWidth:
            "920px",
          margin:
            "0 auto",
        }}
      >
        <Link
          to="/seller/products"
          style={{
            color:
              "#4B1678",
            textDecoration:
              "none",
            fontWeight:
              "800",
            fontSize:
              "12px",
          }}
        >
          ← Back to Products
        </Link>

        <div
          style={{
            background:
              "white",
            border:
              "1px solid #e6d9ef",
            borderRadius:
              "18px",
            padding:
              "26px",
            marginTop:
              "12px",
          }}
        >
          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              gap:
                "14px",
              flexWrap:
                "wrap",
              alignItems:
                "start",
            }}
          >
            <div>
              <div
                style={{
                  color:
                    "#7b3fa0",
                  fontSize:
                    "11px",
                  fontWeight:
                    "800",
                  textTransform:
                    "uppercase",
                }}
              >
                HairGrab Product
              </div>

              <h1
                style={{
                  margin:
                    "5px 0",
                  color:
                    "#4B1678",
                }}
              >
                Edit Product
              </h1>

              <div
                style={{
                  color:
                    "#756b79",
                  fontSize:
                    "12px",
                }}
              >
                Update the existing listing. HairGrab will not create a duplicate.
              </div>
            </div>

            <a
              href={`https://hairgrab.com/products/${product.handle}`}
              target="_blank"
              rel="noreferrer"
              style={{
                border:
                  "1px solid #d8c8e2",
                color:
                  "#4B1678",
                borderRadius:
                  "8px",
                padding:
                  "9px 12px",
                textDecoration:
                  "none",
                fontSize:
                  "11px",
                fontWeight:
                  "800",
              }}
            >
              Store View ↗
            </a>
          </div>

          {actionData && (
            <div
              style={{
                marginTop:
                  "18px",
                padding:
                  "12px",
                borderRadius:
                  "10px",
                background:
                  actionData.success
                    ? "#edf8ef"
                    : "#fff1f1",
                color:
                  actionData.success
                    ? "#28743b"
                    : "#922f2f",
                fontSize:
                  "12px",
                fontWeight:
                  "700",
              }}
            >
              {actionData.message}
            </div>
          )}

          <Form
            method="post"
            onSubmit={(
              event,
            ) => {
              const form =
                event.currentTarget;

              const variantPayload =
                variants.map(
                  (
                    variant: any,
                  ) => ({
                    id:
                      variant.id,

                    inventoryItemId:
                      variant
                        .inventoryItem
                        ?.id ||
                      "",

                    price:
                      (
                        form.elements.namedItem(
                          `price_${variant.id}`,
                        ) as HTMLInputElement
                      )?.value ||
                      variant.price,

                    sku:
                      (
                        form.elements.namedItem(
                          `sku_${variant.id}`,
                        ) as HTMLInputElement
                      )?.value ||
                      "",

                    inventory:
                      (
                        form.elements.namedItem(
                          `inventory_${variant.id}`,
                        ) as HTMLInputElement
                      )?.value ||
                      "0",
                  }),
                );

              const hidden =
                form.elements.namedItem(
                  "variants",
                ) as HTMLInputElement;

              hidden.value =
                JSON.stringify(
                  variantPayload,
                );
            }}
          >
            <input
              type="hidden"
              name="intent"
              value="save"
            />

            <input
              type="hidden"
              name="variants"
              defaultValue="[]"
            />

            <Section
              title="Product Information"
            >
              <label
                style={
                  labelStyle
                }
              >
                Product Name
              </label>

              <input
                name="title"
                defaultValue={
                  product.title
                }
                style={
                  fieldStyle
                }
              />

              <label
                style={{
                  ...labelStyle,
                  marginTop:
                    "15px",
                }}
              >
                Description
              </label>

              <textarea
                name="description"
                defaultValue={
                  stripHtml(
                    product.descriptionHtml,
                  )
                }
                rows={
                  7
                }
                style={{
                  ...fieldStyle,
                  resize:
                    "vertical",
                }}
              />
            </Section>

            <Section
              title="Search & Product Classification"
            >
              <div
                style={{
                  color:
                    "#756b79",
                  fontSize:
                    "12px",
                  lineHeight:
                    1.5,
                  marginBottom:
                    "12px",
                }}
              >
                Select any specialized classification that applies. These help HairGrab place the product in the right shopper searches and filters.
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "9px",
                  flexWrap:
                    "wrap",
                }}
              >
                {CLASSIFICATION_TAGS.map(
                  (
                    classification,
                  ) => (
                    <label
                      key={
                        classification
                      }
                      style={
                        choiceCardStyle
                      }
                    >
                      <input
                        type="checkbox"
                        name="searchClassifications"
                        value={
                          classification
                        }
                        defaultChecked={
                          settings
                            .searchClassifications
                            .includes(
                              classification,
                            )
                        }
                      />

                      <span>
                        {
                          classification
                        }
                      </span>
                    </label>
                  ),
                )}
              </div>
            </Section>

            <Section
              title="Price & Inventory"
            >
              <div
                style={{
                  display:
                    "grid",
                  gap:
                    "12px",
                }}
              >
                {variants.map(
                  (
                    variant: any,
                  ) => (
                    <div
                      key={
                        variant.id
                      }
                      style={{
                        border:
                          "1px solid #eee7f2",
                        borderRadius:
                          "10px",
                        padding:
                          "13px",
                      }}
                    >
                      <div
                        style={{
                          fontWeight:
                            "800",
                          color:
                            "#4B1678",
                          fontSize:
                            "12px",
                          marginBottom:
                            "10px",
                        }}
                      >
                        {
                          variant.title
                        }
                      </div>

                      <div
                        style={{
                          display:
                            "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(150px, 1fr))",
                          gap:
                            "10px",
                        }}
                      >
                        <MiniField
                          label="Price"
                          name={`price_${variant.id}`}
                          defaultValue={
                            variant.price ||
                            ""
                          }
                          type="number"
                          step="0.01"
                        />

                        <MiniField
                          label="Inventory"
                          name={`inventory_${variant.id}`}
                          defaultValue={String(
                            variant.inventoryQuantity ??
                            0,
                          )}
                          type="number"
                          step="1"
                        />

                        <MiniField
                          label="SKU"
                          name={`sku_${variant.id}`}
                          defaultValue={
                            variant.sku ||
                            ""
                          }
                        />
                      </div>
                    </div>
                  ),
                )}
              </div>
            </Section>

            <Section
              title="Shipping & Fulfillment"
            >
              <label
                style={
                  labelStyle
                }
              >
                Customer Shipping Charge *
              </label>

              <select
                name="shippingMethod"
                defaultValue={
                  settings.shippingMethod
                }
                style={
                  fieldStyle
                }
              >

                <option value="Free Shipping">
                  Free Shipping — Seller Covers Shipping Cost
                </option>

                <option value="Flat Rate Shipping">
                  Flat Rate Shipping — You Set the Rate
                </option>
              </select>

              <div
                style={
                  helperStyle
                }
              >
                Choose what the shopper pays for shipping. HairGrab shipping labels are handled separately during fulfillment.
              </div>

              <label
                style={{
                  ...labelStyle,
                  marginTop:
                    "15px",
                }}
              >
                Flat Rate Amount
              </label>

              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap:
                    "8px",
                  maxWidth:
                    "230px",
                }}
              >
                <span
                  style={{
                    fontWeight:
                      800,
                  }}
                >
                  $
                </span>

                <input
                  name="flatRateShipping"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={
                    settings.flatRateShipping
                  }
                  placeholder="7.99"
                  style={
                    fieldStyle
                  }
                />
              </div>

              <div
                style={
                  helperStyle
                }
              >
                Only used when Flat Rate Shipping is selected. The seller is responsible for any difference if the actual label costs more.
              </div>

              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(210px, 1fr))",
                  gap:
                    "12px",
                  marginTop:
                    "16px",
                }}
              >
                <div>
                  <label
                    style={
                      labelStyle
                    }
                  >
                    Ships Within *
                  </label>

                  <select
                    name="shipsWithin"
                    defaultValue={
                      settings.shipsWithin ||
                      "48 Hours"
                    }
                    style={
                      fieldStyle
                    }
                  >
                    <option value="24 Hours">
                      24 Hours
                    </option>

                    <option value="48 Hours">
                      48 Hours
                    </option>

                    <option value="72 Hours">
                      72 Hours
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    style={
                      labelStyle
                    }
                  >
                    Return Policy *
                  </label>

                  <select
                    name="returnPolicy"
                    defaultValue={
                      settings.returnPolicy ||
                      "14-Day Returns"
                    }
                    style={
                      fieldStyle
                    }
                  >
                    <option value="14-Day Returns">
                      14-Day Returns
                    </option>

                    <option value="Final Sale">
                      Final Sale
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    style={
                      labelStyle
                    }
                  >
                    Show on HairGrab Map
                  </label>

                  <select
                    name="showOnMap"
                    defaultValue={
                      settings.showOnMap ||
                      "No"
                    }
                    style={
                      fieldStyle
                    }
                  >
                    <option value="Yes">
                      Yes
                    </option>

                    <option value="No">
                      No
                    </option>
                  </select>
                </div>
              </div>

              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(250px, 1fr))",
                  gap:
                    "12px",
                  marginTop:
                    "16px",
                }}
              >
                <label
                  style={{
                    ...choiceCardStyle,
                    opacity:
                      seller.offersLocalPickup
                        ? 1
                        : 0.55,
                  }}
                >
                  <input
                    type="checkbox"
                    name="localPickupAvailable"
                    defaultChecked={
                      settings.localPickupAvailable
                    }
                    disabled={
                      !seller.offersLocalPickup
                    }
                  />

                  <span>
                    <strong>
                      Local Pickup Available
                    </strong>
                    <br />
                    <small>
                      {
                        seller.offersLocalPickup
                          ? "Show shoppers that this product can be picked up locally."
                          : "Enable Local Pickup in Seller Settings first."
                      }
                    </small>
                  </span>
                </label>

                <label
                  style={{
                    ...choiceCardStyle,
                    opacity:
                      seller.offersLocalDelivery
                        ? 1
                        : 0.55,
                  }}
                >
                  <input
                    type="checkbox"
                    name="localDeliveryAvailable"
                    defaultChecked={
                      settings.localDeliveryAvailable
                    }
                    disabled={
                      !seller.offersLocalDelivery
                    }
                  />

                  <span>
                    <strong>
                      Seller-Managed Local Delivery
                    </strong>
                    <br />
                    <small>
                      {
                        seller.offersLocalDelivery
                          ? "You arrange delivery directly for nearby shoppers."
                          : "Enable Local Delivery in Seller Settings first."
                      }
                    </small>
                  </span>
                </label>
              </div>

              <div
                style={{
                  marginTop:
                    "16px",
                  background:
                    "#f3eafa",
                  border:
                    "1px solid #d7bde8",
                  borderRadius:
                    "12px",
                  padding:
                    "14px",
                }}
              >
                <div
                  style={{
                    color:
                      "#4B1678",
                    fontWeight:
                      900,
                    fontSize:
                      "13px",
                  }}
                >
                  ⚡ HairGrab Same-Day Delivery — Coming Soon
                </div>

                <div
                  style={{
                    marginTop:
                      "5px",
                    color:
                      "#5e4b69",
                    fontSize:
                      "11px",
                    lineHeight:
                      1.5,
                  }}
                >
                  HairGrab is working to bring DoorDash-style same-day delivery to participating areas. A local delivery driver may be able to pick up eligible orders from the seller and deliver them directly to nearby HairGrab shoppers. No action is needed right now. HairGrab will notify eligible sellers when this becomes available in their area.
                </div>
              </div>
            </Section>

            <div
              style={{
                marginTop:
                  "22px",
                display:
                  "flex",
                gap:
                  "10px",
                flexWrap:
                  "wrap",
              }}
            >
              <button
                type="submit"
                style={{
                  border:
                    0,
                  background:
                    "#4B1678",
                  color:
                    "white",
                  borderRadius:
                    "9px",
                  padding:
                    "12px 17px",
                  fontWeight:
                    "800",
                  cursor:
                    "pointer",
                }}
              >
                Save Changes
              </button>

              <Link
                to="/seller/products"
                style={{
                  border:
                    "1px solid #d8c8e2",
                  color:
                    "#4B1678",
                  borderRadius:
                    "9px",
                  padding:
                    "11px 16px",
                  textDecoration:
                    "none",
                  fontWeight:
                    "800",
                  fontSize:
                    "13px",
                }}
              >
                Cancel
              </Link>
            </div>
          </Form>

          <div
            style={{
              marginTop:
                "28px",
              paddingTop:
                "20px",
              borderTop:
                "1px solid #eee7f2",
            }}
          >
            <div
              style={{
                color:
                  "#922f2f",
                fontWeight:
                  "800",
                fontSize:
                  "13px",
              }}
            >
              Remove Product
            </div>

            <div
              style={{
                color:
                  "#756b79",
                fontSize:
                  "11px",
                marginTop:
                  "4px",
                lineHeight:
                  1.5,
              }}
            >
              This permanently removes the product from HairGrab and Shopify.
            </div>

            <Form
              method="post"
              onSubmit={(
                event,
              ) => {
                if (
                  !window.confirm(
                    "Delete this product permanently? This cannot be undone.",
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              <input
                type="hidden"
                name="intent"
                value="delete"
              />

              <button
                type="submit"
                style={{
                  marginTop:
                    "12px",
                  border:
                    "1px solid #cfa9a9",
                  background:
                    "#fff7f7",
                  color:
                    "#922f2f",
                  borderRadius:
                    "9px",
                  padding:
                    "10px 14px",
                  fontWeight:
                    "800",
                  cursor:
                    "pointer",
                }}
              >
                Delete Product
              </button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children:
    React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop:
          "24px",
        paddingTop:
          "22px",
        borderTop:
          "1px solid #eee7f2",
      }}
    >
      <h2
        style={{
          margin:
            "0 0 15px",
          color:
            "#4B1678",
          fontSize:
            "19px",
        }}
      >
        {title}
      </h2>

      {children}
    </div>
  );
}

function MiniField({
  label,
  name,
  defaultValue,
  type =
    "text",
  step,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  step?: string;
}) {
  return (
    <label>
      <div
        style={{
          color:
            "#756b79",
          fontSize:
            "10px",
          marginBottom:
            "5px",
          fontWeight:
            "700",
        }}
      >
        {label}
      </div>

      <input
        name={
          name
        }
        defaultValue={
          defaultValue
        }
        type={
          type
        }
        step={
          step
        }
        style={
          fieldStyle
        }
      />
    </label>
  );
}

const fieldStyle = {
  width:
    "100%",
  boxSizing:
    "border-box" as const,
  border:
    "1px solid #d8cce0",
  borderRadius:
    "10px",
  padding:
    "11px 12px",
  background:
    "#ffffff",
  color:
    "#21152a",
  fontSize:
    "14px",
};

const labelStyle = {
  display:
    "block",
  marginBottom:
    "6px",
  color:
    "#4B1678",
  fontSize:
    "13px",
  fontWeight:
    "800",
};

const helperStyle = {
  color:
    "#756b79",
  fontSize:
    "10px",
  lineHeight:
    1.45,
  marginTop:
    "5px",
};

const choiceCardStyle = {
  display:
    "flex",
  alignItems:
    "flex-start",
  gap:
    "8px",
  border:
    "1px solid #dfd1e8",
  borderRadius:
    "10px",
  padding:
    "10px 12px",
  color:
    "#4B1678",
  fontSize:
    "12px",
  cursor:
    "pointer",
  background:
    "#fff",
};