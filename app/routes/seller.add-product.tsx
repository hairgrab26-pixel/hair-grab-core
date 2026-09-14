import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  redirect,
  useLoaderData,
} from "react-router";


import crypto from "node:crypto";

import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { syncHairGrabShippingProfile } from "../hairgrab-shipping.server";
import { displayProductCategory } from "../product-categories";
import ProductBuilder from "../components/ProductBuilder";
import { productOptions, productClassifications, installationMethodChoices, locTypeChoices } from "../components/ProductBuilder";


// ==========================================================
// TYPES
// ==========================================================

type ProductType =
  | "WIG"
  | "BUNDLE"
  | "CLOSURE_FRONTAL"
  | "EXTENSION"
  | "BRAIDING_HAIR"
  | "HAIR_ESSENTIAL";

type Choice = {
  value: string;
  label: string;
};

type VariantRow = {
  key: string;
  label: string;
  length: string;
  option: string;
  color: string;
};

type VariantData = {
  price: string;
  salePrice: string;
  inventory: string;
  sku: string;
};

type ProductPayload = {
  title: string;
  description: string;

  productType: ProductType;

  material: string;
  colors: string[];
  texture: string;

  selectedOptions: string[];
  optionsAreVariants: boolean;
  searchClassifications: string[];
  installationMethods: string[];
  locType: string;

  density: string;
  laceSize: string;
  laceType: string;
  capSize: string;
  bundleWeight: string;

  shippingMethod: string;
  flatRateShipping: string;
  localPickupAvailable: boolean;
  localDeliveryAvailable: boolean;
  shipsWithin: string;
  returnPolicy: string;
  showOnMap: string;

  imageUrls?: string[];
  sourceOptionNames?: string[];
  csvSourceKey?: string;

  variants: Array<{
    label: string;
    length: string;
    option: string;
    color: string;
    price: string;
    salePrice?: string;
    inventory: string;
    sku: string;
    sourceOptionValues?: string[];
  }>;
};


// ==========================================================
// SELLER SESSION
// ==========================================================

const SELLER_SESSION_COOKIE =
  "hairgrab_seller_session";

type SellerSessionPayload = {
  sellerId: string;
  portalAccountId: string;
  expiresAt: number;
};

function getSessionSecret() {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.SHOPIFY_API_SECRET ||
    "";

  if (!secret) {
    throw new Error(
      "Seller session secret is not configured.",
    );
  }

  return secret;
}

function signValue(value: string) {
  return crypto
    .createHmac(
      "sha256",
      getSessionSecret(),
    )
    .update(value)
    .digest("base64url");
}

function safeEqual(
  first: string,
  second: string,
) {
  try {
    const a =
      Buffer.from(
        first,
        "utf8",
      );

    const b =
      Buffer.from(
        second,
        "utf8",
      );

    if (
      a.length !== b.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      a,
      b,
    );
  } catch {
    return false;
  }
}

function getCookie(
  request: Request,
  name: string,
) {
  const cookieHeader =
    request.headers.get(
      "Cookie",
    );

  if (!cookieHeader) {
    return null;
  }

  for (
    const cookie of
    cookieHeader.split(";")
  ) {
    const [
      cookieName,
      ...rest
    ] =
      cookie
        .trim()
        .split("=");

    if (
      cookieName === name
    ) {
      return (
        rest.join("=") ||
        null
      );
    }
  }

  return null;
}

function readSellerSession(
  request: Request,
): SellerSessionPayload | null {
  const sessionValue =
    getCookie(
      request,
      SELLER_SESSION_COOKIE,
    );

  if (!sessionValue) {
    return null;
  }

  const parts =
    sessionValue.split(".");

  if (
    parts.length !== 2
  ) {
    return null;
  }

  const [
    encodedPayload,
    suppliedSignature,
  ] = parts;

  const expectedSignature =
    signValue(
      encodedPayload,
    );

  if (
    !safeEqual(
      suppliedSignature,
      expectedSignature,
    )
  ) {
    return null;
  }

  try {
    const payload =
      JSON.parse(
        Buffer
          .from(
            encodedPayload,
            "base64url",
          )
          .toString(
            "utf8",
          ),
      ) as SellerSessionPayload;

    if (
      !payload.sellerId ||
      !payload.portalAccountId ||
      !payload.expiresAt ||
      payload.expiresAt <
        Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}


// ==========================================================
// AUTHENTICATE HAIRGRAB SELLER
// ==========================================================

async function getSellerFromRequest(
  request: Request,
) {
  const session =
    readSellerSession(
      request,
    );

  if (!session) {
    return null;
  }

  const portalAccount =
    await db.sellerPortalAccount.findUnique({
      where: {
        id:
          session.portalAccountId,
      },
    });

  if (
    !portalAccount ||
    portalAccount.sellerId !==
      session.sellerId ||
    portalAccount.status !==
      "ACTIVE"
  ) {
    return null;
  }

  const seller =
    await db.seller.findUnique({
      where: {
        id:
          session.sellerId,
      },

      include: {
        approvedApplication:
          true,
      },
    });

  if (!seller) {
    return null;
  }

  if (
    seller.status ===
      "SUSPENDED" ||
    seller.status ===
      "INACTIVE" ||
    seller.status ===
      "CLOSED"
  ) {
    return null;
  }

  return seller;
}


// ==========================================================
// LOADER
// ==========================================================

export const loader =
  async ({
    request,
  }: LoaderFunctionArgs) => {
    const seller =
      await getSellerFromRequest(
        request,
      );

    if (!seller) {
      return redirect(
        "/seller/login",
      );
    }

    return {
      seller: {
        id:
          seller.id,
        sellerCode:
          seller.sellerCode,
        businessName:
          seller.businessName,
        shopifyVendor:
          seller.shopifyVendor,
        sellsNationwide:
          seller.sellsNationwide,
        offersLocalPickup:
          seller.offersLocalPickup,
        offersLocalDelivery:
          seller.offersLocalDelivery,
      },
    };
  };


// ==========================================================
// SHOPIFY HELPERS
// ==========================================================
// ==========================================================
// EXISTING SHOPIFY PRODUCT METAFIELDS
//
// HairGrab reads the Product metafield definitions that
// already exist in Shopify and writes into those definitions.
//
// This prevents duplicate hairgrab.* metafields and means
// the Shopify fields Mel already built are populated
// automatically.
// ==========================================================

type ShopifyMetafieldDefinition = {
  name: string;
  namespace: string;
  key: string;

  type: {
    name: string;
  };

  validations: Array<{
    name: string;
    type: string;
    value: string | null;
  }>;

  constraints:
    | {
        key: string | null;
      }
    | null;
};

function normalizeMetafieldName(
  value: string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}


async function getProductMetafieldDefinitions(
  admin: any,
) {
  const response =
    await admin.graphql(
      `#graphql
      query HairGrabProductMetafieldDefinitions {
        metafieldDefinitions(
          ownerType: PRODUCT
          first: 250
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
              type
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

  if (
    json?.errors &&
    json.errors.length > 0
  ) {
    throw new Error(
      json.errors
        .map(
          (error: {
            message?: string;
          }) =>
            error.message ||
            "Unable to read Shopify metafield definitions.",
        )
        .join(" | "),
    );
  }

  return (
    json?.data
      ?.metafieldDefinitions
      ?.nodes || []
  ) as ShopifyMetafieldDefinition[];
}


function findMetafieldDefinition(
  definitions:
    ShopifyMetafieldDefinition[],
  names: string[],
) {
  const normalizedNames =
    names.map(
      normalizeMetafieldName,
    );

  const matches =
    definitions.filter(
      (definition) =>
        normalizedNames.includes(
          normalizeMetafieldName(
            definition.name,
          ),
        ),
    );

  if (
    matches.length === 0
  ) {
    return undefined;
  }

  // Shopify can expose more than one definition with the
  // same display name. HairGrab should use Mel's normal
  // custom product metafield before a category-constrained
  // or standard definition with the same label.
  const ranked =
    [...matches].sort(
      (a, b) => {
        const score = (
          definition:
            ShopifyMetafieldDefinition,
        ) => {
          let points = 0;

          if (
            definition.namespace ===
            "custom"
          ) {
            points += 20;
          }

          if (
            !definition.constraints
          ) {
            points += 10;
          }

          return points;
        };

        return (
          score(b) -
          score(a)
        );
      },
    );

  return ranked[0];
}

function getDefinitionChoices(
  definition:
    ShopifyMetafieldDefinition,
) {
  const choiceValidation =
    definition.validations.find(
      (validation) =>
        normalizeMetafieldName(
          validation.name,
        ) === "choices",
    );

  if (
    !choiceValidation?.value
  ) {
    return [] as string[];
  }

  try {
    const parsed =
      JSON.parse(
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
  // Hair Category
  wig: [
    "wigs",
  ],

  closurefrontal: [
    "closuresandfrontals",
    "closuresfrontals",
  ],

  // Hair Type
  humanhair: [
    "100humanhair",
  ],

  humansyntheticblend: [
    "humanhairblend",
  ],

  // Shipping Method
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

  // Boolean-style Shopify choice fields
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
  if (
    choices.length === 0
  ) {
    return value;
  }

  const normalizedValue =
    normalizeMetafieldName(
      value,
    );

  const exact =
    choices.find(
      (choice) =>
        normalizeMetafieldName(
          choice,
        ) ===
        normalizedValue,
    );

  if (exact) {
    return exact;
  }

  const aliases =
    METAFIELD_VALUE_ALIASES[
      normalizedValue
    ] || [];

  for (
    const alias of
    aliases
  ) {
    const matched =
      choices.find(
        (choice) =>
          normalizeMetafieldName(
            choice,
          ) ===
          alias,
      );

    if (matched) {
      return matched;
    }
  }

  // Simple singular/plural tolerance, e.g. Wig -> Wigs.
  const singularPluralMatch =
    choices.find(
      (choice) => {
        const normalizedChoice =
          normalizeMetafieldName(
            choice,
          );

        return (
          normalizedChoice ===
            `${normalizedValue}s` ||
          `${normalizedChoice}s` ===
            normalizedValue
        );
      },
    );

  return (
    singularPluralMatch ||
    null
  );
}


function prepareMetafieldValue(
  definition:
    ShopifyMetafieldDefinition,
  value:
    | string
    | string[]
    | boolean,
) {
  const type =
    definition.type.name;

  const choices =
    getDefinitionChoices(
      definition,
    );

  const rawValues =
    Array.isArray(value)
      ? value.map(String)
      : [
          typeof value ===
          "boolean"
            ? value
              ? "true"
              : "false"
            : String(value),
        ];

  const resolvedValues =
    rawValues
      .map(
        (item) =>
          resolveChoiceValue(
            item,
            choices,
          ),
      )
      .filter(
        (
          item,
        ): item is string =>
          Boolean(item),
      );

  // If Shopify has restricted choices and HairGrab doesn't
  // have a valid matching value, skip this metafield instead
  // of rejecting the entire product save.
  if (
    choices.length > 0 &&
    resolvedValues.length === 0
  ) {
    return null;
  }

  if (
    type.startsWith(
      "list.",
    )
  ) {
    return JSON.stringify(
      resolvedValues,
    );
  }

  if (
    type === "boolean"
  ) {
    return String(
      Boolean(value),
    );
  }

  if (
    type.includes(
      "integer",
    ) ||
    type.includes(
      "decimal",
    )
  ) {
    return String(
      resolvedValues[0] ??
      rawValues[0],
    );
  }

  if (
    Array.isArray(value)
  ) {
    return resolvedValues.join(
      ", ",
    );
  }

  return (
    resolvedValues[0] ??
    rawValues[0]
  );
}


function addExistingMetafield({
  definitions,
  output,
  names,
  value,
}: {
  definitions:
    ShopifyMetafieldDefinition[];

  output: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;

  names: string[];

  value:
    | string
    | string[]
    | boolean
    | null
    | undefined;
}) {
  if (
    value === null ||
    value === undefined
  ) {
    return;
  }

  if (
    typeof value === "string" &&
    !value.trim()
  ) {
    return;
  }

  if (
    Array.isArray(value) &&
    value.length === 0
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

  const preparedValue =
    prepareMetafieldValue(
      definition,
      value,
    );

  if (
    preparedValue === null
  ) {
    console.warn(
      `[HairGrab Core] Skipping metafield "${definition.name}" because "${String(value)}" is not one of its allowed Shopify choices.`,
    );

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
      preparedValue,
  });
}


function formatErrors(
  errors:
    | Array<{
        field?: string[];
        message?: string;
      }>
    | undefined,
) {
  if (
    !errors ||
    errors.length === 0
  ) {
    return "";
  }

  return errors
    .map(
      (error) =>
        error.message ||
        "Unknown Shopify error.",
    )
    .join(" | ");
}

async function setProductMetafieldsSafely({
  admin,
  productId,
  metafields,
}: {
  admin: any;
  productId: string;

  metafields: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;
}) {
  const saved: string[] = [];
  const skipped: string[] = [];

  for (
    const metafield of
    metafields
  ) {
    try {
      const response =
        await admin.graphql(
          `#graphql
          mutation HairGrabSetProductMetafield(
            $metafields: [MetafieldsSetInput!]!
          ) {
            metafieldsSet(
              metafields: $metafields
            ) {
              metafields {
                id
                namespace
                key
                value
              }

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

                  namespace:
                    metafield.namespace,

                  key:
                    metafield.key,

                  type:
                    metafield.type,

                  value:
                    metafield.value,
                },
              ],
            },
          },
        );

      const json =
        await response.json();

      const result =
        json?.data
          ?.metafieldsSet;

      const errors =
        result?.userErrors ||
        [];

      if (
        errors.length > 0
      ) {
        skipped.push(
          `${metafield.namespace}.${metafield.key}`,
        );

        console.warn(
          `[HairGrab Core] Skipping incompatible Shopify metafield ${metafield.namespace}.${metafield.key}:`,
          errors
            .map(
              (error: {
                message?: string;
              }) =>
                error.message ||
                "Unknown metafield error.",
            )
            .join(" | "),
        );

        continue;
      }

      saved.push(
        `${metafield.namespace}.${metafield.key}`,
      );
    } catch (error) {
      skipped.push(
        `${metafield.namespace}.${metafield.key}`,
      );

      console.warn(
        `[HairGrab Core] Could not write Shopify metafield ${metafield.namespace}.${metafield.key}:`,
        error,
      );
    }
  }

  return {
    saved,
    skipped,
  };
}

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
  admin: Awaited<
    ReturnType<
      typeof getShopifyAdmin
    >
  >["admin"],
) {
  const response =
    await admin.graphql(`
      #graphql
      query HairGrabPrimaryLocation {
        location {
          id
          name
        }
      }
    `);

  const json =
    await response.json();

  const locationId =
    json?.data
      ?.location
      ?.id;

  if (!locationId) {
    throw new Error(
      "Shopify primary inventory location could not be found.",
    );
  }

  return String(
    locationId,
  );
}


// ==========================================================
// STAGED MEDIA UPLOAD
// ==========================================================

type StagedTarget = {
  url: string;
  resourceUrl: string;
  parameters: Array<{
    name: string;
    value: string;
  }>;
};

async function stageFiles(
  admin: Awaited<
    ReturnType<
      typeof getShopifyAdmin
    >
  >["admin"],
  files: File[],
  resource:
    | "PRODUCT_IMAGE"
    | "VIDEO",
) {
  if (
    files.length === 0
  ) {
    return [];
  }

  const input =
    files.map(
      (file) => ({
        filename:
          file.name,

        mimeType:
          file.type ||
          (resource ===
          "VIDEO"
            ? "video/mp4"
            : "image/jpeg"),

        httpMethod:
          "POST",

        resource,

        ...(resource ===
        "VIDEO"
          ? {
              fileSize:
                String(
                  file.size,
                ),
            }
          : {}),
      }),
    );

  const response =
    await admin.graphql(
      `#graphql
      mutation HairGrabStageUploads(
        $input: [StagedUploadInput!]!
      ) {
        stagedUploadsCreate(
          input: $input
        ) {
          stagedTargets {
            url
            resourceUrl

            parameters {
              name
              value
            }
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
          input,
        },
      },
    );

  const json =
    await response.json();

  const result =
    json?.data
      ?.stagedUploadsCreate;

  const errors =
    formatErrors(
      result?.userErrors,
    );

  if (errors) {
    throw new Error(
      `Media staging failed: ${errors}`,
    );
  }

  const targets =
    (result
      ?.stagedTargets ||
      []) as StagedTarget[];

  if (
    targets.length !==
    files.length
  ) {
    throw new Error(
      "Shopify did not return the expected media upload targets.",
    );
  }

  const uploaded:
    Array<{
      originalSource: string;
      contentType:
        | "IMAGE"
        | "VIDEO";
      alt: string;
    }> = [];

  for (
    let index = 0;
    index <
    files.length;
    index++
  ) {
    const file =
      files[index];

    const target =
      targets[index];

    const uploadForm =
      new FormData();

    for (
      const parameter of
      target.parameters
    ) {
      uploadForm.append(
        parameter.name,
        parameter.value,
      );
    }

    uploadForm.append(
      "file",
      file,
      file.name,
    );

    const uploadResponse =
      await fetch(
        target.url,
        {
          method:
            "POST",

          body:
            uploadForm,
        },
      );

    if (
      !uploadResponse.ok
    ) {
      throw new Error(
        `Upload failed for ${file.name}.`,
      );
    }

    uploaded.push({
      originalSource:
        target.resourceUrl,

      contentType:
        resource ===
        "VIDEO"
          ? "VIDEO"
          : "IMAGE",

      alt:
        file.name,
    });
  }

  return uploaded;
}


// ==========================================================
// ACTION — SAVE PRODUCT
// ==========================================================

export const action =
  async ({
    request,
  }: ActionFunctionArgs): Promise<any> => {
    const seller =
      await getSellerFromRequest(
        request,
      );

    if (!seller) {
      return {
        success: false,
        message:
          "Your seller session has expired. Please sign in again.",
      };
    }

    try {
      const formData =
        await request.formData();

      const csvBatchRaw = String(formData.get("csvBatchPayload") || "");
      if (csvBatchRaw) {
        let batch: ProductPayload[] = [];
        try {
          const parsed = JSON.parse(csvBatchRaw);
          batch = Array.isArray(parsed) ? parsed.slice(0, 100) : [];
        } catch {
          return {
            success: false,
            csvBatch: true,
            message: "HairGrab could not read the CSV import batch.",
            results: [],
          };
        }

        if (batch.length === 0) {
          return {
            success: false,
            csvBatch: true,
            message: "No ready products were received for import.",
            results: [],
          };
        }

        const results: Array<{ key: string; title: string; success: boolean; message: string }> = [];
        const cookie = request.headers.get("Cookie") || "";

        for (const product of batch) {
          const childForm = new FormData();
          childForm.append("productPayload", JSON.stringify(product));
          const childHeaders = new Headers();
          if (cookie) childHeaders.set("Cookie", cookie);
          const childRequest = new Request(request.url, {
            method: "POST",
            headers: childHeaders,
            body: childForm,
          });

          const result = await action({ request: childRequest } as ActionFunctionArgs);
          results.push({
            key: String(product.csvSourceKey || product.title || ""),
            title: String(product.title || "Untitled product"),
            success: Boolean(result?.success),
            message: String(result?.message || (result?.success ? "Imported" : "Add failed")),
          });
        }

        const imported = results.filter((result) => result.success).length;
        const failed = results.length - imported;
        return {
          success: failed === 0,
          csvBatch: true,
          message: failed === 0
            ? `${imported} product${imported === 1 ? "" : "s"} added successfully to My Products as Shopify drafts.`
            : `${imported} imported · ${failed} need attention.`,
          imported,
          failed,
          results,
        };
      }

      const payloadRaw =
        String(
          formData.get(
            "productPayload",
          ) || "",
        );

      if (!payloadRaw) {
        return {
          success: false,
          message:
            "Product information was not received.",
        };
      }

      const payload =
        JSON.parse(
          payloadRaw,
        ) as ProductPayload;

      const saveAsDraft =
        String(
          formData.get(
            "saveAsDraft",
          ) ||
          "",
        ) === "true";

      if (
        payload.shippingMethod !==
          "Free Shipping" &&
        payload.shippingMethod !==
          "Flat Rate Shipping"
      ) {
        return {
          success: false,
          message:
            "Choose Free Shipping or Flat Rate Shipping.",
        };
      }

      if (
        !payload.title?.trim()
      ) {
        return {
          success: false,
          message:
            "Product name is required.",
        };
      }

      if (
        !saveAsDraft &&
        !payload.description
          ?.trim()
      ) {
        return {
          success: false,
          message:
            "Product description is required.",
        };
      }

      if (
        !payload.productType
      ) {
        return {
          success: false,
          message:
            "Product type is required.",
        };
      }

      if (
        !Array.isArray(
          payload.variants,
        ) ||
        payload.variants
          .length === 0
      ) {
        if (saveAsDraft) {
          payload.variants = [
            {
              label: "Draft",
              length: "",
              option: "",
              color:
                payload.colors?.[0] ||
                "Natural / 1B",
              price: "0",
              salePrice: "",
              inventory: "",
              sku: "",
            },
          ];
        } else {
          return {
            success: false,
            message:
              "At least one product variant is required.",
          };
        }
      }

      for (
        const variant of
        payload.variants
      ) {
        if (
          saveAsDraft &&
          !String(
            variant.price ||
            "",
          ).trim()
        ) {
          variant.price = "0";
        }

        const price =
          Number(
            variant.price,
          );

        if (
          !Number.isFinite(
            price,
          ) ||
          price < 0
        ) {
          return {
            success:
              false,

            message:
              `Enter a valid price for ${variant.label}.`,
          };
        }

        const salePriceRaw =
          String(
            variant.salePrice ||
            "",
          ).trim();

        if (salePriceRaw) {
          const salePrice =
            Number(
              salePriceRaw,
            );

          if (
            !Number.isFinite(
              salePrice,
            ) ||
            salePrice < 0
          ) {
            return {
              success: false,
              message:
                `Enter a valid sale price for ${variant.label}.`,
            };
          }

          if (
            salePrice >= price
          ) {
            return {
              success: false,
              message:
                `Sale price for ${variant.label} must be lower than the regular price.`,
            };
          }
        }
      }

      const imageFiles =
        formData
          .getAll(
            "images",
          )
          .filter(
            (
              value,
            ): value is File =>
              value instanceof
              File &&
              value.size >
                0,
          )
          .slice(
            0,
            10,
          );

      // CSV imports can bring existing public image URLs with them.
      // Download them server-side so Shopify receives the same staged
      // upload format used by manual seller uploads.
      const remoteImageFiles: File[] = [];
      for (const [index, url] of (payload.imageUrls || []).slice(0, Math.max(0, 10 - imageFiles.length)).entries()) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const contentType = response.headers.get("content-type") || "image/jpeg";
          if (!contentType.toLowerCase().startsWith("image/")) continue;
          const buffer = await response.arrayBuffer();
          const extension =
            contentType.includes("png") ? "png" :
            contentType.includes("webp") ? "webp" :
            contentType.includes("gif") ? "gif" : "jpg";
          remoteImageFiles.push(
            new File([buffer], `csv-image-${index + 1}.${extension}`, { type: contentType }),
          );
        } catch {
          // A broken source image must not prevent the rest of the product from importing.
        }
      }

      const allImageFiles = [...imageFiles, ...remoteImageFiles].slice(0, 10);

      const videoFiles =
        formData
          .getAll(
            "videos",
          )
          .filter(
            (
              value,
            ): value is File =>
              value instanceof
              File &&
              value.size >
                0,
          )
          .slice(
            0,
            3,
          );

      const {
        admin,
      } =
        await getShopifyAdmin();

      const locationId =
        await getPrimaryLocationId(
          admin,
        );

      // ====================================================
      // UPLOAD MEDIA FIRST
      // ====================================================

      const uploadedImages =
        await stageFiles(
          admin,
          allImageFiles,
          "PRODUCT_IMAGE",
        );

      const uploadedVideos =
        await stageFiles(
          admin,
          videoFiles,
          "VIDEO",
        );

      const productFiles =
        [
          ...uploadedImages,
          ...uploadedVideos,
        ];

      // ====================================================
      // SHOPIFY PRODUCT OPTIONS
      // ====================================================

      const hairProduct =
        payload.productType !==
        "HAIR_ESSENTIAL";

      const uniqueLengths =
        Array.from(
          new Set(
            payload.variants
              .map(
                (
                  variant,
                ) =>
                  variant.length,
              )
              .filter(
                Boolean,
              ),
          ),
        );

      const uniqueStyleOptions =
        Array.from(
          new Set(
            payload.variants
              .map(
                (
                  variant,
                ) =>
                  variant.option,
              )
              .filter(
                Boolean,
              ),
          ),
        );

      const currentOptions =
        productOptions[
          payload.productType
        ];

      const styleLabel =
        (
          value: string,
        ) =>
          currentOptions.find(
            (
              option,
            ) =>
              option.value ===
              value,
          )?.label ||
          value;

      const productOptionsInput:
        Array<{
          name: string;
          values: Array<{
            name: string;
          }>;
        }> = [];

      const sourceOptionNames = (payload.sourceOptionNames || [])
        .map((name) => String(name || "").trim())
        .filter(Boolean);

      const useSourceOptions =
        sourceOptionNames.length > 0 &&
        payload.variants.some(
          (variant) => Array.isArray(variant.sourceOptionValues) && variant.sourceOptionValues.some(Boolean),
        );

      if (useSourceOptions) {
        sourceOptionNames.forEach((optionName, optionIndex) => {
          const values = Array.from(
            new Set(
              payload.variants
                .map((variant) => String(variant.sourceOptionValues?.[optionIndex] || "").trim())
                .filter(Boolean),
            ),
          );
          if (values.length > 0) {
            productOptionsInput.push({
              name: optionName,
              values: values.map((value) => ({ name: value })),
            });
          }
        });
      } else if (
        hairProduct &&
        uniqueLengths.length >
          0
      ) {
        productOptionsInput.push({
          name:
            "Length",

          values:
            uniqueLengths.map(
              (
                length,
              ) => ({
                name:
                  `${length}"`,
              }),
            ),
        });
      }

      if (
        !useSourceOptions &&
        payload.optionsAreVariants &&
        uniqueStyleOptions.length >
          0
      ) {
        productOptionsInput.push({
          name:
            "Style",

          values:
            uniqueStyleOptions.map(
              (
                option,
              ) => ({
                name:
                  styleLabel(
                    option,
                  ),
              }),
            ),
        });
      }

      if (
        !useSourceOptions &&
        Array.isArray(
          payload.colors,
        ) &&
        payload.colors.length >
          1
      ) {
        productOptionsInput.push({
          name:
            "Color",

          values:
            payload.colors.map(
              (
                colorValue,
              ) => ({
                name:
                  colorValue,
              }),
            ),
        });
      }

      if (
        productOptionsInput.length ===
        0
      ) {
        productOptionsInput.push({
          name:
            "Option",

          values:
            payload.variants.length > 1
              ? payload.variants.map((variant, index) => ({
                  name: String(variant.label || `Variant ${index + 1}`).trim() || `Variant ${index + 1}`,
                }))
              : [{ name: "Standard" }],
        });
      }

      // ====================================================
      // VARIANTS
      // ====================================================

      const variantsInput =
        payload.variants.map(
          (
            variant,
            index,
          ) => {
            const optionValues:
              Array<{
                optionName:
                  string;
                name:
                  string;
              }> =
              [];

            if (useSourceOptions) {
              sourceOptionNames.forEach((optionName, optionIndex) => {
                const value = String(variant.sourceOptionValues?.[optionIndex] || "").trim();
                if (value) {
                  optionValues.push({
                    optionName,
                    name: value,
                  });
                }
              });
            } else if (
              hairProduct &&
              variant.length
            ) {
              optionValues.push({
                optionName:
                  "Length",

                name:
                  `${variant.length}"`,
              });
            }

            if (
              !useSourceOptions &&
              payload.optionsAreVariants &&
              variant.option
            ) {
              optionValues.push({
                optionName:
                  "Style",

                name:
                  styleLabel(
                    variant.option,
                  ),
              });
            }

            if (
              !useSourceOptions &&
              Array.isArray(
                payload.colors,
              ) &&
              payload.colors.length >
                1 &&
              variant.color
            ) {
              optionValues.push({
                optionName:
                  "Color",

                name:
                  variant.color,
              });
            }

            if (
              optionValues.length ===
              0
            ) {
              optionValues.push({
                optionName:
                  "Option",

                name:
                  payload.variants.length > 1
                    ? String(variant.label || `Variant ${index + 1}`).trim() || `Variant ${index + 1}`
                    : "Standard",
              });
            }

            const inventory =
              String(
                variant.inventory ||
                  "",
              ).trim();

            const hasInventory =
              inventory !==
                "" &&
              Number.isFinite(
                Number(
                  inventory,
                ),
              );

            return {
              optionValues,

              price:
                Number(
                  variant.salePrice ||
                  variant.price,
                ),

              ...(variant.salePrice
                ? {
                    compareAtPrice:
                      Number(
                        variant.price,
                      ),
                  }
                : {}),

              ...(variant.sku
                ?.trim()
                ? {
                    sku:
                      variant.sku.trim(),
                  }
                : {}),

              inventoryPolicy:
                "DENY",

              inventoryItem: {
                tracked:
                  hasInventory,
              },

              ...(hasInventory
                ? {
                    inventoryQuantities:
                      [
                        {
                          locationId,

                          name:
                            "available",

                          quantity:
                            Math.max(
                              0,
                              Math.floor(
                                Number(
                                  inventory,
                                ),
                              ),
                            ),
                        },
                      ],
                  }
                : {}),

              position:
                index +
                1,
            };
          },
        );

      // ====================================================
      // EXISTING SHOPIFY METAFIELDS
      //
      // HairGrab reads the Product metafield definitions that
      // already exist in Shopify and fills those exact fields.
      // No duplicate hairgrab.* metafields are created here.
      // ====================================================

      const metafieldDefinitions =
        await getProductMetafieldDefinitions(
          admin,
        );

      const metafields: Array<{
        namespace: string;
        key: string;
        type: string;
        value: string;
      }> = [];

      // Canonical shopper-facing category label — single source
      // of truth in ../product-categories.ts. Do NOT recompute
      // this inline; every screen that writes or displays a
      // product's category must go through that shared helper.
      const productTypeDisplay =
        displayProductCategory(
          payload.productType,
        );

      const selectedLengthValues =
        Array.from(
          new Set(
            payload.variants
              .map(
                (variant) =>
                  variant.length
                    ? String(
                        variant.length,
                      )
                    : "",
              )
              .filter(Boolean),
          ),
        );

      // ----------------------------------------------------
      // PRODUCT-SPECIFIC VALUES
      // ----------------------------------------------------

      // Defaults to the same canonical category label used for
      // Shopify's productType/tags (see ../product-categories.ts).
      // EXTENSION is the one type that gets a finer-grained "Hair
      // Category" metafield value based on the selected option —
      // that's intentionally different from the top-level category.
      let hairCategoryMetafieldValue =
        productTypeDisplay;

      if (
        payload.productType ===
        "EXTENSION"
      ) {
        if (
          payload.selectedOptions.includes(
            "CLIP_IN",
          )
        ) {
          hairCategoryMetafieldValue =
            "Clip-Ins";
        } else if (
          payload.selectedOptions.includes(
            "TAPE_IN",
          )
        ) {
          hairCategoryMetafieldValue =
            "Tape-Ins";
        } else if (
          payload.selectedOptions.includes(
            "I_TIP",
          )
        ) {
          hairCategoryMetafieldValue =
            "I-Tips & K Tips";
        } else if (
          payload.selectedOptions.includes(
            "HALO",
          )
        ) {
          hairCategoryMetafieldValue =
            "Halo Extensions";
        } else {
          hairCategoryMetafieldValue =
            "Other";
        }
      }

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Hair Category",
        ],

        value:
          hairCategoryMetafieldValue,
      });

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Hair Type",
          "Material",
        ],

        value:
          payload.material,
      });

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Color",
        ],

        value:
          payload.colors,
      });

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Texture",
        ],

        value:
          payload.texture,
      });

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Length",
        ],

        value:
          selectedLengthValues,
      });

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Cap Type",
          "Cap Size",
        ],

        value:
          payload.capSize,
      });

      // ----------------------------------------------------
      // SELLER / SHIPPING VALUES
      //
      // Product-specific choices come from this quick form.
      // Seller city/state are auto-filled from HairGrab seller
      // data, with the approved application as a fallback.
      // ----------------------------------------------------

      const shipsFromCity =
        seller.city ||
        seller.approvedApplication
          ?.city ||
        "";

      const shipsFromState =
        seller.state ||
        seller.approvedApplication
          ?.state ||
        "";

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Ships From City",
        ],

        value:
          shipsFromCity,
      });

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Ships From State",
        ],

        value:
          shipsFromState,
      });

      // ----------------------------------------------------
      // HAIRGRAB SHIPPING SOURCE OF TRUTH
      //
      // Keep the legacy Shopify choice metafield populated when
      // the selected value is compatible, but store HairGrab's
      // shipping settings in dedicated unstructured metafields
      // so seller-set flat rates and local fulfillment are not
      // constrained by the old Shopify choice list.
      // ----------------------------------------------------

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Shipping Method / Shipping Options",
          "Shipping Method / Shipping",
          "Shipping Method",
          "Shipping Methods",
        ],

        value:
          payload.shippingMethod,
      });

      metafields.push({
        namespace:
          "hairgrab",
        key:
          "shipping_charge_type",
        type:
          "single_line_text_field",
        value:
          payload.shippingMethod,
      });

      if (
        payload.shippingMethod ===
          "Flat Rate Shipping" &&
        Number(
          payload.flatRateShipping,
        ) > 0
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
              payload.flatRateShipping,
            ).toFixed(2),
        });
      }

      metafields.push({
        namespace:
          "hairgrab",
        key:
          "local_pickup_available",
        type:
          "boolean",
        value:
          String(
            Boolean(
              payload.localPickupAvailable,
            ),
          ),
      });

      metafields.push({
        namespace:
          "hairgrab",
        key:
          "local_delivery_available",
        type:
          "boolean",
        value:
          String(
            Boolean(
              payload.localDeliveryAvailable,
            ),
          ),
      });

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

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

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Show on HairGrab Map",
        ],

        value:
          payload.showOnMap,
      });

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Ships Within",
        ],

        value:
          payload.shipsWithin,
      });

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Return Policy",
        ],

        value:
          payload.returnPolicy,
      });

      // ----------------------------------------------------
      // OPTIONAL HAIR DETAILS
      //
      // These fill automatically if matching Shopify product
      // metafield definitions already exist.
      // ----------------------------------------------------

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Density",
        ],

        value:
          payload.density,
      });

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Lace Size",
        ],

        value:
          payload.laceSize,
      });

      addExistingMetafield({
        definitions:
          metafieldDefinitions,

        output:
          metafields,

        names: [
          "Lace Type",
        ],

        value:
          payload.laceType,
      });

      // ====================================================
      // CREATE SHOPIFY PRODUCT
      //
      // ALWAYS DRAFT FOR NOW.
      // ====================================================

      const selectedOptionTags =
        payload.selectedOptions
          .map(
            (value) =>
              productOptions[
                payload.productType
              ].find(
                (option) =>
                  option.value ===
                  value,
              )?.label ||
              "",
          )
          .filter(Boolean);

      const classificationTags =
        (
          productClassifications[
            payload.productType
          ] || []
        )
          .filter(
            (choice) =>
              payload.searchClassifications
                ?.includes(
                  choice.value,
                ),
          )
          .map(
            (choice) =>
              choice.label,
          );

      const installationTags =
        installationMethodChoices
          .filter(
            (choice) =>
              payload.installationMethods
                ?.includes(
                  choice.value,
                ),
          )
          .map(
            (choice) =>
              choice.label,
          );

      if (
        installationTags.length >
        0
      ) {
        metafields.push({
          namespace:
            "hairgrab",
          key:
            "installation_methods",
          type:
            "list.single_line_text_field",
          value:
            JSON.stringify(
              installationTags,
            ),
        });
      }

      const locTypeLabel =
        locTypeChoices.find(
          (choice) =>
            choice.value ===
            payload.locType,
        )?.label || "";

      if (locTypeLabel) {
        metafields.push({
          namespace: "hairgrab",
          key: "loc_type",
          type: "single_line_text_field",
          value: locTypeLabel,
        });
      }


      const productSetResponse =
        await admin.graphql(
          `#graphql
          mutation HairGrabCreateSellerProduct(
            $productSet: ProductSetInput!
            $synchronous: Boolean!
          ) {
            productSet(
              input: $productSet
              synchronous: $synchronous
            ) {
              product {
                id
                title
                handle
                status
                vendor

                variants(first: 250) {
                  nodes {
                    id
                    title
                    price
                    sku
                    inventoryQuantity
                  }
                }

                media(first: 20) {
                  nodes {
                    id
                    mediaContentType
                    status
                    alt
                  }
                }
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
              synchronous:
                true,

              productSet: {
                title:
                  payload.title.trim(),

                descriptionHtml:
                  `<p>${payload.description
                    .trim()
                    .replace(
                      /\n/g,
                      "</p><p>",
                    )}</p>`,

                productType:
                  productTypeDisplay,

                vendor:
                  seller.shopifyVendor,

                status:
                  "DRAFT",

                tags: [
                  "HairGrab",
                  `HairGrab Seller ${seller.sellerCode}`,
                  productTypeDisplay,
                  ...selectedOptionTags,
                  ...classificationTags,
                  ...installationTags,
                  ...(locTypeLabel ? [locTypeLabel] : []),
                ],

                productOptions:
                  productOptionsInput,

                variants:
                  variantsInput,

                ...(productFiles.length >
                0
                  ? {
                      files:
                        productFiles,
                    }
                  : {}),
              },
            },
          },
        );

      const productSetJson =
        await productSetResponse.json();

      const productSetResult =
        productSetJson?.data
          ?.productSet;

      const shopifyErrors =
        formatErrors(
          productSetResult
            ?.userErrors,
        );

      if (shopifyErrors) {
        throw new Error(
          `Shopify rejected the product: ${shopifyErrors}`,
        );
      }

      const shopifyProduct =
        productSetResult
          ?.product;

      if (
        !shopifyProduct
          ?.id
      ) {
        throw new Error(
          "Shopify did not return a product after saving.",
        );
      }

      // ====================================================
      // SYNC SHOPIFY CHECKOUT SHIPPING PROFILE
      // ====================================================

      await syncHairGrabShippingProfile({
        admin,
        locationId,
        variantIds: (shopifyProduct.variants?.nodes || []).map(
          (variant: { id?: string }) => String(variant.id || ""),
        ),
        shippingMethod: payload.shippingMethod,
        flatRateShipping: payload.flatRateShipping,
      });

      // ====================================================
      // WRITE EXISTING SHOPIFY METAFIELDS SAFELY
      //
      // The product is already created at this point.
      // Each existing Shopify metafield is written separately.
      // If Shopify rejects one because of category/subtype
      // constraints, HairGrab skips only that field instead of
      // rejecting the entire seller product.
      // ====================================================

      const metafieldSaveResult =
        await setProductMetafieldsSafely({
          admin,

          productId:
            String(
              shopifyProduct.id,
            ),

          metafields,
        });

      // ====================================================
      // SAVE HAIRGRAB OWNERSHIP RECORD
      // ====================================================

      const firstSku =
        payload.variants.find(
          (
            variant,
          ) =>
            variant.sku
              ?.trim(),
        )?.sku?.trim() ||
        null;

      const coreProduct =
        await db.sellerProduct.create({
          data: {
            sellerId:
              seller.id,

            shopifyProductId:
              String(
                shopifyProduct.id,
              ),

            shopifyHandle:
              shopifyProduct.handle
                ? String(
                    shopifyProduct.handle,
                  )
                : null,

            title:
              payload.title.trim(),

            status:
              "DRAFT",

            sellerSku:
              firstSku,

            publishedToShopify:
              false,
          },
        });

      return {
        success: true,

        message:
          saveAsDraft
            ? "Draft saved. You can continue editing it from My Products."
            : "Product saved successfully. HairGrab received it for review.",

        draftSaved:
          saveAsDraft,

        shopifyProductId:
          String(
            shopifyProduct.id,
          ),

        shopifyHandle:
          shopifyProduct.handle
            ? String(
                shopifyProduct.handle,
              )
            : null,

        sellerProductId:
          coreProduct.id,

        variantCount:
          shopifyProduct
            ?.variants
            ?.nodes
            ?.length ||
          payload.variants
            .length,

        mediaCount:
          shopifyProduct
            ?.media
            ?.nodes
            ?.length ||
          productFiles.length,

        metafieldsSaved:
          metafieldSaveResult
            .saved.length,

        metafieldsSkipped:
          metafieldSaveResult
            .skipped.length,
      };

    } catch (error) {
      console.error(
        "[HairGrab Core] Product save error:",
        error,
      );

      return {
        success: false,

        message:
          error instanceof
          Error
            ? error.message
            : "HairGrab could not save this product.",
      };
    }
  };



export default function SellerAddProductPage() {
  const { seller } = useLoaderData<typeof loader>();
  return <ProductBuilder seller={seller} />;
}
