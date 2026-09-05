import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { requireSellerSession } from "../seller-session.server";


async function getShopifyAdmin() {
  const offlineSession =
    await db.session.findFirst({
      where: {
        isOnline: false,
      },
    });

  if (!offlineSession) {
    throw new Error(
      "HairGrab could not find the Shopify offline session.",
    );
  }

  return unauthenticated.admin(
    offlineSession.shop,
  );
}


async function getPrimaryLocationId(
  admin: any,
) {
  const response =
    await admin.graphql(
      `#graphql
      query HairGrabPrimaryLocation {
        location {
          id
        }
      }
      `,
    );

  const json =
    await response.json();

  const id =
    json?.data
      ?.location
      ?.id;

  if (!id) {
    throw new Error(
      "Shopify inventory location could not be found.",
    );
  }

  return String(id);
}


async function getOwnedProduct(
  sellerId: string,
  productId:
    string |
    undefined,
) {
  if (!productId) {
    throw new Response(
      "Product is required",
      {
        status:
          400,
      },
    );
  }

  const product =
    await db.sellerProduct.findFirst({
      where: {
        id:
          productId,
        sellerId,
      },
    });

  if (
    !product ||
    !product.shopifyProductId
  ) {
    throw new Response(
      "Product not found",
      {
        status:
          404,
      },
    );
  }

  return product;
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

  const response =
    await admin.graphql(
      `#graphql
      query HairGrabEditProduct(
        $id: ID!
      ) {
        product(id: $id) {
          id
          title
          descriptionHtml
          handle
          status
          productType
          vendor

          featuredImage {
            url
            altText
          }

          variants(first: 100) {
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
    );

  const json =
    await response.json();

  if (
    json?.errors
      ?.length
  ) {
    throw new Error(
      json.errors
        .map(
          (error: {
            message?: string;
          }) =>
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
        status:
          404,
      },
    );
  }

  return {
    seller: {
      businessName:
        seller.businessName,
    },
    coreProductId:
      coreProduct.id,
    product,
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
        deleteResult?.userErrors ||
        [];

      if (
        deleteErrors.length >
        0
      ) {
        throw new Error(
          deleteErrors
            .map(
              (error: {
                message?: string;
              }) =>
                error.message ||
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

    const variantsRaw =
      String(
        formData.get(
          "variants",
        ) || "[]",
      );

    const variants =
      JSON.parse(
        variantsRaw,
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
                `<p>${description
                  .replace(
                    /\n/g,
                    "</p><p>",
                  )}</p>`,
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
            (error: {
              message?: string;
            }) =>
              error.message ||
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
                    sku:
                      variant.sku
                        .trim() ||
                      null,
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
              (error: {
                message?: string;
              }) =>
                error.message ||
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
            (variant) =>
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
            (variant) => ({
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

              compareQuantity:
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
            ) {
              inventorySetQuantities(
                input: $input
              ) {
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
                  name:
                    "available",

                  reason:
                    "correction",

                  ignoreCompareQuantity:
                    true,

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
                (error: {
                  message?: string;
                }) =>
                  error.message ||
                  "Unable to update inventory.",
              )
              .join(" | "),
          );
        }
      }
    }

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
        "Product updated successfully.",
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
                    variant,
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
                    variant,
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
                        {variant.title}
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
                const confirmed =
                  window.confirm(
                    "Delete this product permanently? This cannot be undone.",
                  );

                if (
                  !confirmed
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
        name={name}
        defaultValue={
          defaultValue
        }
        type={type}
        step={step}
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
