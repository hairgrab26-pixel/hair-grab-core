import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  redirect,
  useActionData,
  useFetcher,
  useLoaderData,
} from "react-router";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import crypto from "node:crypto";

import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { syncHairGrabShippingProfile } from "../hairgrab-shipping.server";


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

      const productTypeDisplay =
        payload.productType === "WIG"
          ? "Wigs"
          : payload.productType === "BUNDLE"
            ? "Bundles"
            : payload.productType === "CLOSURE_FRONTAL"
              ? "Closures & Frontals"
              : payload.productType === "EXTENSION"
                ? "Extensions"
                : payload.productType === "BRAIDING_HAIR"
                  ? "Braiding Hair"
                  : payload.productType === "HAIR_ESSENTIAL"
                    ? "Hair Essentials"
                    : productTypes.find(
                        (type) =>
                          type.value ===
                          payload.productType,
                      )?.label ||
                      payload.productType;

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

      let hairCategoryMetafieldValue =
        productTypeDisplay;

      if (
        payload.productType ===
        "WIG"
      ) {
        hairCategoryMetafieldValue =
          "Wigs";
      }

      if (
        payload.productType ===
        "CLOSURE_FRONTAL"
      ) {
        hairCategoryMetafieldValue =
          "Closures & Frontals";
      }

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


// ==========================================================
// PRODUCT CONFIG
// ==========================================================

const productTypes:
  Array<{
    value:
      ProductType;
    label:
      string;
    description:
      string;
  }> = [
  {
    value:
      "WIG",
    label:
      "Wig",
    description:
      "Glueless, lace, closure, frontal and other wigs.",
  },

  {
    value:
      "BUNDLE",
    label:
      "Bundles",
    description:
      "Single bundles, bundle deals and wefted hair.",
  },

  {
    value:
      "CLOSURE_FRONTAL",
    label:
      "Closure / Frontal",
    description:
      "Closures, frontals and 360 lace pieces.",
  },

  {
    value:
      "EXTENSION",
    label:
      "Extensions",
    description:
      "Clip-ins, tape-ins, I-tips, ponytails and halos.",
  },

  {
    value:
      "BRAIDING_HAIR",
    label:
      "Braiding Hair",
    description:
      "Human or synthetic braiding and protective-style hair.",
  },

  {
    value:
      "HAIR_ESSENTIAL",
    label:
      "Hair Essentials",
    description:
      "Hair care, tools and accessories.",
  },
];

const productOptions:
  Record<
    ProductType,
    Choice[]
  > = {
  WIG: [
    {
      value:
        "GLUELESS",
      label:
        "Glueless",
    },

    {
      value:
        "LACE",
      label:
        "Lace",
    },

    {
      value:
        "CLOSURE_WIG",
      label:
        "Closure Wig",
    },

    {
      value:
        "FRONTAL_WIG",
      label:
        "Frontal Wig",
    },

    {
      value:
        "FULL_LACE",
      label:
        "Full Lace",
    },

    {
      value:
        "HEADBAND",
      label:
        "Headband Wig",
    },
  ],

  BUNDLE: [
    {
      value:
        "SINGLE_BUNDLE",
      label:
        "Single Bundle",
    },

    {
      value:
        "BUNDLE_DEAL",
      label:
        "Bundle Deal",
    },

    {
      value:
        "WEFT",
      label:
        "Weft",
    },

    {
      value:
        "NO_WEFT",
      label:
        "No Weft",
    },

    {
      value:
        "WITH_CLOSURE",
      label:
        "Includes Closure",
    },

    {
      value:
        "WITH_FRONTAL",
      label:
        "Includes Frontal",
    },
  ],

  CLOSURE_FRONTAL: [
    {
      value:
        "CLOSURE",
      label:
        "Closure",
    },

    {
      value:
        "FRONTAL",
      label:
        "Frontal",
    },

    {
      value:
        "360_FRONTAL",
      label:
        "360 Frontal",
    },
  ],

  EXTENSION: [
    {
      value:
        "CLIP_IN",
      label:
        "Clip-Ins",
    },

    {
      value:
        "TAPE_IN",
      label:
        "Tape-Ins",
    },

    {
      value:
        "I_TIP",
      label:
        "I-Tips / Microlinks",
    },

    {
      value:
        "PONYTAIL",
      label:
        "Ponytail",
    },

    {
      value:
        "HALO",
      label:
        "Halo",
    },
  ],

  BRAIDING_HAIR: [
    {
      value:
        "PRE_STRETCHED",
      label:
        "Pre-Stretched",
    },

    {
      value:
        "BOHO",
      label:
        "Boho / Loose Curl",
    },
  ],

  HAIR_ESSENTIAL: [
    {
      value:
        "HAIR_CARE",
      label:
        "Hair Care",
    },

    {
      value:
        "TOOLS",
      label:
        "Tools",
    },

    {
      value:
        "ACCESSORIES",
      label:
        "Accessories",
    },
  ],
};

const productClassifications:
  Partial<
    Record<
      ProductType,
      Choice[]
    >
  > = {
  WIG: [
    {
      value:
        "KOSHER_WIG",
      label:
        "Kosher Wig",
    },

    {
      value:
        "MEDICAL_WIG",
      label:
        "Medical Wig",
    },
  ],

  BRAIDING_HAIR: [
    {
      value:
        "LOCS",
      label:
        "Locs",
    },
  ],
};

const installationMethodChoices: Choice[] = [
  {
    value:
      "CROCHET",
    label:
      "Crochet",
  },
  {
    value:
      "PRE_LOOPED",
    label:
      "Pre-Looped",
  },
];

const locTypeChoices: Choice[] = [
  { value: "BUTTERFLY_LOCS", label: "Butterfly Locs" },
  { value: "FAUX_LOCS", label: "Faux Locs" },
  { value: "GODDESS_LOCS", label: "Goddess Locs" },
  { value: "SOFT_LOCS", label: "Soft Locs" },
  { value: "DISTRESSED_LOCS", label: "Distressed Locs" },
  { value: "BOHO_LOCS", label: "Boho Locs" },
  { value: "MARLEY_LOCS", label: "Marley Locs" },
  { value: "WAVY_CURLY_LOCS", label: "Wavy / Curly Locs" },
  { value: "TRADITIONAL_LOCS", label: "Traditional Locs" },
  { value: "OTHER_LOCS", label: "Other" },
];


const materials = [
  "Human Hair",
  "Synthetic Hair",
  "Human / Synthetic Blend",
  "Other",
  "Not Applicable",
];

const colors = [
  "Natural / 1B",
  "1 - Jet Black",
  "2 - Dark Brown",
  "4 - Medium Brown",
  "27 - Honey Blonde",
  "30 - Auburn",
  "613 - Blonde",
  "99J - Burgundy",
  "Red",
  "Copper",
  "Pink",
  "Blue",
  "Purple",
  "Gray / Silver",
  "Mixed / Highlighted",
  "Other / Custom",
];

const textures = [
  "Straight",
  "Body Wave",
  "Loose Wave",
  "Deep Wave",
  "Water Wave",
  "Curly",
  "Deep Curly",
  "Kinky Curly",
  "Kinky Straight",
  "Coily",
  "Other",
];

const standardLengths = [
  "8",
  "10",
  "12",
  "14",
  "16",
  "18",
  "20",
  "22",
  "24",
  "26",
  "28",
  "30",
  "32",
  "34",
  "36",
  "40",
];

const densities = [
  "130%",
  "150%",
  "180%",
  "200%",
  "250%",
];

const laceSizes = [
  "2x6",
  "4x4",
  "5x5",
  "6x6",
  "7x7",
  "13x4",
  "13x6",
  "360",
  "Full Lace",
];

const laceTypes = [
  "HD Lace",
  "Transparent Lace",
  "Swiss Lace",
  "Regular Lace",
];


// ==========================================================
// STYLES
// ==========================================================

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

const sectionStyle = {
  marginTop:
    "25px",

  paddingTop:
    "23px",

  borderTop:
    "1px solid #eee7f2",
};

const headingStyle = {
  margin:
    "0 0 15px",

  color:
    "#4B1678",

  fontSize:
    "19px",
};

const thStyle = {
  textAlign:
    "left" as const,

  padding:
    "10px",

  color:
    "#4B1678",

  fontSize:
    "11px",
};

const tdStyle = {
  padding:
    "8px",

  color:
    "#35263e",

  fontSize:
    "12px",
};


// ==========================================================
// SMALL COMPONENTS
// ==========================================================

function toggleValue(
  current:
    string[],
  value:
    string,
) {
  return current.includes(
    value,
  )
    ? current.filter(
        (
          item,
        ) =>
          item !==
          value,
      )
    : [
        ...current,
        value,
      ];
}

function ChoiceButton({
  label,
  selected,
  onClick,
}: {
  label:
    string;
  selected:
    boolean;
  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      style={{
        border:
          selected
            ? "2px solid #4B1678"
            : "1px solid #d8cce0",

        background:
          selected
            ? "#f7f0fb"
            : "#ffffff",

        color:
          "#4B1678",

        borderRadius:
          "9px",

        padding:
          "9px 12px",

        fontWeight:
          "800",

        fontSize:
          "12px",

        cursor:
          "pointer",
      }}
    >
      {selected
        ? "✓ "
        : ""}
      {label}
    </button>
  );
}


// ==========================================================
// PAGE
// ==========================================================

export default function SellerAddProductPage() {
  const {
    seller,
  } =
    useLoaderData<
      typeof loader
    >();

  useEffect(
    () => {
      if (
        !seller.offersLocalPickup
      ) {
        setLocalPickupAvailable(
          false,
        );
      }

      if (
        !seller.offersLocalDelivery
      ) {
        setLocalDeliveryAvailable(
          false,
        );
      }
    },
    [
      seller.offersLocalPickup,
      seller.offersLocalDelivery,
    ],
  );

  const actionData =
    useActionData<
      typeof action
    >();

  const saveFetcher =
    useFetcher<
      typeof action
    >();

  const csvImportFetcher =
    useFetcher<
      typeof action
    >();

  const saving =
    saveFetcher.state !==
    "idle";

  const saveResult =
    saveFetcher.data ||
    actionData;

  useEffect(
    () => {
      if (
        saveResult?.success &&
        saveResult?.draftSaved &&
        saveResult?.sellerProductId
      ) {
        window.location.href =
          `/seller/edit-product/${saveResult.sellerProductId}`;
      }
    },
    [
      saveResult?.success,
      saveResult?.draftSaved,
      saveResult?.sellerProductId,
    ],
  );

  const [
    reviewing,
    setReviewing,
  ] =
    useState(
      false,
    );

  const [
    title,
    setTitle,
  ] =
    useState("");

  const [
    description,
    setDescription,
  ] =
    useState("");

  const [aiWriting, setAiWriting] = useState(false);
  const [aiMessage, setAiMessage] = useState("");

  const [
    productType,
    setProductType,
  ] =
    useState<ProductType | null>(
      null,
    );

  const [
    selectedOptions,
    setSelectedOptions,
  ] =
    useState<string[]>(
      [],
    );

  const [
    optionsAreVariants,
    setOptionsAreVariants,
  ] =
    useState(
      false,
    );

  const [
    searchClassifications,
    setSearchClassifications,
  ] =
    useState<string[]>(
      [],
    );

  const [
    installationMethods,
    setInstallationMethods,
  ] =
    useState<string[]>(
      [],
    );

  const [
    locType,
    setLocType,
  ] =
    useState("");

  const [
    csvFileName,
    setCsvFileName,
  ] =
    useState("");

  type CsvImportedVariant = {
    key: string;
    price: string;
    inventory: string;
    sku: string;
    sourceOptionValues: string[];
  };

  type CsvImportedProduct = {
    key: string;
    title: string;
    description: string;
    rows: number;
    status: string;
    skuCount: number;
    variantCount: number;
    imageUrls: string[];
    sourceOptionNames: string[];
    variants: CsvImportedVariant[];
    productType?: ProductType;
    material?: string;
    texture?: string;
    productOption?: string;
    classification?: string;
    installationMethod?: string;
    locType?: string;
    laceSize?: string;
    density?: string;
    laceType?: string;
    capSize?: string;
    bundleWeight?: string;
    excluded?: boolean;
    imported?: boolean;
    importError?: string;
  };

  const [
    csvPreview,
    setCsvPreview,
  ] = useState<{
    rows: number;
    products: number;
    recognized: string[];
    ready: number;
    needsDetails: number;
    items: CsvImportedProduct[];
  } | null>(null);

  const [csvReviewOpen, setCsvReviewOpen] = useState(false);
  const [csvSelectedKeys, setCsvSelectedKeys] = useState<string[]>([]);
  const [csvBulkProductType, setCsvBulkProductType] = useState<ProductType | "">("");
  const [csvBulkMaterial, setCsvBulkMaterial] = useState("");
  const [csvBulkTexture, setCsvBulkTexture] = useState("");
  const [csvEditingKey, setCsvEditingKey] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportProgress, setCsvImportProgress] = useState("");
  const [csvImportSummary, setCsvImportSummary] = useState<{
    imported: number;
    failed: number;
    failures: string[];
  } | null>(null);

  // HairGrab keeps this dumb easy:
  // selecting 2+ product options automatically turns those
  // options into separate variants. No hidden checkbox needed.
  useEffect(
    () => {
      setOptionsAreVariants(
        productType === "BUNDLE" &&
        selectedOptions.includes(
          "BUNDLE_DEAL",
        )
          ? false
          : selectedOptions.length > 1,
      );
    },
    [
      productType,
      selectedOptions,
    ],
  );


  useEffect(() => {
    if (!searchClassifications.includes("LOCS")) {
      setLocType("");
    }
  }, [searchClassifications]);

  const [
    material,
    setMaterial,
  ] =
    useState("");

  const [
    customMaterial,
    setCustomMaterial,
  ] =
    useState("");

  const [
    color,
    setColor,
  ] =
    useState(
      "Natural / 1B",
    );

  const [
    customColor,
    setCustomColor,
  ] =
    useState("");

  const [
    selectedColors,
    setSelectedColors,
  ] =
    useState<string[]>(
      [
        "Natural / 1B",
      ],
    );

  const [
    texture,
    setTexture,
  ] =
    useState("");

  const [
    selectedLengths,
    setSelectedLengths,
  ] =
    useState<string[]>(
      [],
    );

  const [
    customLength,
    setCustomLength,
  ] =
    useState("");

  const [
    customLengths,
    setCustomLengths,
  ] =
    useState<string[]>(
      [],
    );

  const [
    density,
    setDensity,
  ] =
    useState("");

  const [
    laceSize,
    setLaceSize,
  ] =
    useState("");

  const [
    laceType,
    setLaceType,
  ] =
    useState("");

  const [
    capSize,
    setCapSize,
  ] =
    useState("");

  const [
    bundleWeight,
    setBundleWeight,
  ] =
    useState(
      "100g",
    );

  const [
    shippingMethod,
    setShippingMethod,
  ] =
    useState(
      "Free Shipping",
    );

  const [
    flatRateShipping,
    setFlatRateShipping,
  ] =
    useState("");

  const [
    localPickupAvailable,
    setLocalPickupAvailable,
  ] =
    useState(false);

  const [
    localDeliveryAvailable,
    setLocalDeliveryAvailable,
  ] =
    useState(false);

  const [
    shipsWithin,
    setShipsWithin,
  ] =
    useState(
      "48 Hours",
    );

  const [
    returnPolicy,
    setReturnPolicy,
  ] =
    useState(
      "14-Day Returns",
    );

  const [
    showOnMap,
    setShowOnMap,
  ] =
    useState(
      "Yes",
    );

  const [
    startingPrice,
    setStartingPrice,
  ] =
    useState("");

  const [
    priceIncrease,
    setPriceIncrease,
  ] =
    useState("");

  const [
    quickPrice,
    setQuickPrice,
  ] =
    useState("");

  const [
    onSale,
    setOnSale,
  ] =
    useState(false);

  const [
    quickInventory,
    setQuickInventory,
  ] =
    useState("");

  const [
    variantValues,
    setVariantValues,
  ] =
    useState<
      Record<
        string,
        VariantData
      >
    >({});

  const [
    images,
    setImages,
  ] =
    useState<File[]>(
      [],
    );

  const [
    videos,
    setVideos,
  ] =
    useState<File[]>(
      [],
    );

  const isHair =
    productType !==
      null &&
    productType !==
      "HAIR_ESSENTIAL";

  const currentOptions =
    productType
      ? productOptions[
          productType
        ]
      : [];

  const currentClassifications =
    productType
      ? productClassifications[
          productType
        ] || []
      : [];

  const optionLabel =
    (
      value:
        string,
    ) =>
      currentOptions.find(
        (
          item,
        ) =>
          item.value ===
          value,
      )?.label ||
      value;

  const resolvedMaterial =
    material ===
    "Other"
      ? customMaterial.trim()
      : material;

  const resolvedColor =
    color ===
    "Other / Custom"
      ? customColor.trim()
      : color;

  const allLengths =
    useMemo(
      () => [
        ...standardLengths,
        ...customLengths,
      ],
      [
        customLengths,
      ],
    );

  const isBundleDeal =
    productType ===
      "BUNDLE" &&
    selectedOptions.includes(
      "BUNDLE_DEAL",
    );

  const variantRows =
    useMemo<
      VariantRow[]
    >(
      () => {
        if (
          !productType
        ) {
          return [];
        }

        if (
          productType ===
          "HAIR_ESSENTIAL"
        ) {
          return [
            {
              key:
                "DEFAULT",

              label:
                "Standard",

              length:
                "",

              option:
                "",

              color:
                selectedColors[0] ||
                "Natural / 1B",
            },
          ];
        }

        if (
          isBundleDeal
        ) {
          if (
            selectedLengths.length ===
            0
          ) {
            return [];
          }

          return [
            {
              key:
                `BUNDLE_DEAL__${selectedLengths.join(
                  "_",
                )}`,
              label:
                 `Bundle Deal — ${selectedLengths
                  .map(
                    (length) =>
                      `${length}"`,
                  )
                  .join(
                    " + ",
                  )}`,
              length: "",
              option:
                "BUNDLE_DEAL",
              color:
                selectedColors[0] ||
                "Natural / 1B",
            },
          ];
        }

        if (
          selectedLengths.length ===
          0
        ) {
          return [];
        }

        const optionVariants =
          optionsAreVariants &&
          selectedOptions.length >
            0
            ? selectedOptions
            : [""];

        const colorVariants =
          selectedColors.length >
            0
            ? selectedColors
            : ["Natural / 1B"];

        const rows:
          VariantRow[] =
          [];

        for (
          const length of
          selectedLengths
        ) {
          for (
            const option of
            optionVariants
          ) {
            for (
              const colorValue of
              colorVariants
            ) {
              const showColorInLabel =
                colorVariants.length >
                1;

              const labelParts =
                [
                  `${length}"`,
                  option
                    ? optionLabel(
                        option,
                      )
                    : "",
                  showColorInLabel
                    ? colorValue
                    : "",
                ].filter(
                  Boolean,
                );

              rows.push({
                key:
                  `${length}__${
                    option ||
                    "NO_OPTION"
                  }__${colorValue}`,

                length,

                option,

                color:
                  colorValue,

                label:
                  labelParts.join(
                    " / ",
                  ),
              });
            }
          }
        }

        return rows;
      },
      [
        productType,
        isBundleDeal,
        selectedLengths,
        optionsAreVariants,
        selectedOptions,
        selectedColors,
        currentOptions,
      ],
    );

  function setVariantField(
    key:
      string,
    field:
      | "price"
      | "salePrice"
      | "inventory"
      | "sku",
    value:
      string,
  ) {
    setVariantValues(
      (
        current,
      ) => ({
        ...current,

        [key]: {
          price:
            current[
              key
            ]?.price ||
            "",

          salePrice:
            current[
              key
            ]?.salePrice ||
            "",

          inventory:
            current[
              key
            ]
              ?.inventory ||
            "",

          sku:
            current[
              key
            ]?.sku ||
            "",

          [field]:
            value,
        },
      }),
    );
  }

  function addSelectedColor() {
    const resolved =
      color ===
      "Other / Custom"
        ? customColor.trim()
        : color;

    if (!resolved) {
      return;
    }

    if (
      !selectedColors.includes(
        resolved,
      )
    ) {
      setSelectedColors(
        (
          current,
        ) => [
          ...current,
          resolved,
        ],
      );
    }

    if (
      color ===
      "Other / Custom"
    ) {
      setCustomColor(
        "",
      );
    }
  }

  function removeSelectedColor(
    colorValue: string,
  ) {
    setSelectedColors(
      (
        current,
      ) =>
        current.length <=
        1
          ? current
          : current.filter(
              (item) =>
                item !==
                colorValue,
            ),
    );
  }

  function addCustomLength() {
    const clean =
      customLength
        .replace(
          /[^0-9.]/g,
          "",
        )
        .trim();

    if (!clean) {
      return;
    }

    if (
      !customLengths.includes(
        clean,
      )
    ) {
      setCustomLengths(
        (
          current,
        ) => [
          ...current,
          clean,
        ],
      );
    }

    if (
      !selectedLengths.includes(
        clean,
      )
    ) {
      setSelectedLengths(
        (
          current,
        ) => [
          ...current,
          clean,
        ],
      );
    }

    setCustomLength(
      "",
    );
  }

  function autoPriceByLength() {
    const base =
      Number(
        startingPrice,
      );

    const increase =
      Number(
        priceIncrease ||
          "0",
      );

    if (
      !Number.isFinite(
        base,
      )
    ) {
      return;
    }

    const lengths =
      Array.from(
        new Set(
          variantRows.map(
            (
              row,
            ) =>
              row.length,
          ),
        ),
      ).sort(
        (
          a,
          b,
        ) =>
          Number(a) -
          Number(b),
      );

    setVariantValues(
      (
        current,
      ) => {
        const next = {
          ...current,
        };

        for (
          const row of
          variantRows
        ) {
          const position =
            lengths.indexOf(
              row.length,
            );

          next[row.key] = {
            price:
              (
                base +
                Math.max(
                  0,
                  position,
                ) *
                  increase
              ).toFixed(
                2,
              ),

            salePrice:
              next[
                row.key
              ]?.salePrice ||
              "",

            inventory:
              next[
                row.key
              ]
                ?.inventory ||
              "",

            sku:
              next[
                row.key
              ]?.sku ||
              "",
          };
        }

        return next;
      },
    );
  }

  function fillAllPrices() {
    if (
      !quickPrice
    ) {
      return;
    }

    setVariantValues(
      (
        current,
      ) => {
        const next = {
          ...current,
        };

        for (
          const row of
          variantRows
        ) {
          next[row.key] = {
            price:
              quickPrice,

            salePrice:
              next[
                row.key
              ]?.salePrice ||
              "",

            inventory:
              next[
                row.key
              ]
                ?.inventory ||
              "",

            sku:
              next[
                row.key
              ]?.sku ||
              "",
          };
        }

        return next;
      },
    );
  }

  function fillAllInventory() {
    if (
      !quickInventory
    ) {
      return;
    }

    setVariantValues(
      (
        current,
      ) => {
        const next = {
          ...current,
        };

        for (
          const row of
          variantRows
        ) {
          next[row.key] = {
            price:
              next[
                row.key
              ]?.price ||
              "",

            salePrice:
              next[
                row.key
              ]?.salePrice ||
              "",

            inventory:
              quickInventory,

            sku:
              next[
                row.key
              ]?.sku ||
              "",
          };
        }

        return next;
      },
    );
  }

  function handleImages(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const files =
      Array.from(
        event.target
          .files ||
          [],
      );

    const remaining =
      10 -
      images.length;

    setImages(
      (
        current,
      ) => [
        ...current,
        ...files.slice(
          0,
          remaining,
        ),
      ],
    );

    event.target.value =
      "";
  }

  function handleVideos(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const files =
      Array.from(
        event.target
          .files ||
          [],
      );

    const remaining =
      3 -
      videos.length;

    setVideos(
      (
        current,
      ) => [
        ...current,
        ...files.slice(
          0,
          remaining,
        ),
      ],
    );

    event.target.value =
      "";
  }

  async function generateHairGrabDescription() {
    if (!productType) {
      setAiMessage("Choose a Product Type first so HairGrab AI can write an accurate description.");
      return;
    }

    setAiWriting(true);
    setAiMessage("");

    try {
      const response = await fetch("/seller/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "write",
          details: {
            title,
            productType,
            material: resolvedMaterial,
            colors: selectedColors,
            texture,
            lengths: [...selectedLengths, ...customLengths],
            density,
            laceSize,
            laceType,
            capSize,
            bundleWeight,
            classifications: searchClassifications,
            options: selectedOptions,
          },
        }),
      });

      const result = await response.json();
      if (!response.ok || !result?.text) {
        throw new Error(result?.message || "HairGrab AI is unavailable right now.");
      }

      setDescription(String(result.text).trim());
      setAiMessage("HairGrab AI created a description from the product details above. Review it before saving.");
    } catch (error) {
      setAiMessage(
        error instanceof Error
          ? error.message
          : "HairGrab AI is unavailable right now.",
      );
    } finally {
      setAiWriting(false);
    }
  }

  const hasPrices =
    variantRows.length >
      0 &&
    variantRows.every(
      (
        row,
      ) => {
        const regularPrice =
          Number(
            variantValues[
              row.key
            ]?.price ||
            "",
          );

        if (
          !Number.isFinite(
            regularPrice,
          ) ||
          regularPrice < 0
        ) {
          return false;
        }

        if (!onSale) {
          return true;
        }

        const salePrice =
          Number(
            variantValues[
              row.key
            ]?.salePrice ||
            "",
          );

        return (
          Number.isFinite(
            salePrice,
          ) &&
          salePrice >= 0 &&
          salePrice <
            regularPrice
        );
      },
    );

  const flatRateIsValid =
    shippingMethod !==
      "Flat Rate Shipping" ||
    Number(
      flatRateShipping,
    ) > 0;

  const ready =
    title.trim()
      .length >
      0 &&
    description
      .trim()
      .length >
      0 &&
    productType !==
      null &&
    resolvedMaterial
      .length >
      0 &&
    selectedColors
      .length >
      0 &&
    shippingMethod
      .length >
      0 &&
    flatRateIsValid &&
    shipsWithin
      .length >
      0 &&
    returnPolicy
      .length >
      0 &&
    showOnMap
      .length >
      0 &&
    hasPrices;

  function parseCsvText(text: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < text.length; index++) {
      const char = text[index];

      if (char === '"') {
        if (quoted && text[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = !quoted;
        }
        continue;
      }

      if (char === "," && !quoted) {
        row.push(cell.trim());
        cell = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index++;
        row.push(cell.trim());
        cell = "";
        if (row.some((value) => value.length > 0)) rows.push(row);
        row = [];
        continue;
      }

      cell += char;
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
    }

    return rows;
  }

  function normalizeCsvHeader(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function inferHairGrabDetails(title: string): Partial<CsvImportedProduct> {
    const text = title.toLowerCase();
    let productType: ProductType | undefined;
    let productOption: string | undefined;
    let texture: string | undefined;
    let material: string | undefined;
    let laceSize: string | undefined;

    if (/wig/.test(text)) productType = "WIG";
    else if (/closure|frontal/.test(text)) productType = "CLOSURE_FRONTAL";
    else if (/bundle|weft/.test(text)) productType = "BUNDLE";
    else if (/clip[ -]?in|tape[ -]?in|i[ -]?tip|micro.?link|ponytail|halo/.test(text)) productType = "EXTENSION";
    else if (/braid|loc|marley|boho/.test(text)) productType = "BRAIDING_HAIR";

    if (/human hair|virgin|raw hair|remy/.test(text)) material = "Human Hair";
    if (/synthetic/.test(text)) material = "Synthetic Hair";

    if (/body wave/.test(text)) texture = "Body Wave";
    else if (/loose wave/.test(text)) texture = "Loose Wave";
    else if (/deep wave/.test(text)) texture = "Deep Wave";
    else if (/water wave/.test(text)) texture = "Water Wave";
    else if (/deep curl/.test(text)) texture = "Deep Curly";
    else if (/kinky curl/.test(text)) texture = "Kinky Curly";
    else if (/kinky straight/.test(text)) texture = "Kinky Straight";
    else if (/curly|curl/.test(text)) texture = "Curly";
    else if (/straight/.test(text)) texture = "Straight";

    if (productType === "WIG") {
      if (/glueless/.test(text)) productOption = "GLUELESS";
      else if (/closure/.test(text)) productOption = "CLOSURE_WIG";
      else if (/frontal/.test(text)) productOption = "FRONTAL_WIG";
      else if (/full lace/.test(text)) productOption = "FULL_LACE";
      else if (/headband/.test(text)) productOption = "HEADBAND";
    } else if (productType === "CLOSURE_FRONTAL") {
      if (/360/.test(text)) productOption = "360_FRONTAL";
      else if (/frontal/.test(text)) productOption = "FRONTAL";
      else if (/closure/.test(text)) productOption = "CLOSURE";
    } else if (productType === "EXTENSION") {
      if (/clip[ -]?in/.test(text)) productOption = "CLIP_IN";
      else if (/tape[ -]?in/.test(text)) productOption = "TAPE_IN";
      else if (/i[ -]?tip|micro.?link/.test(text)) productOption = "I_TIP";
      else if (/ponytail/.test(text)) productOption = "PONYTAIL";
      else if (/halo/.test(text)) productOption = "HALO";
    }

    for (const size of laceSizes) {
      if (text.includes(size.toLowerCase())) { laceSize = size; break; }
    }

    return { productType, productOption, texture, material, laceSize };
  }

  async function handleCsvFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      setCsvFileName("");
      setCsvPreview(null);
      setCsvReviewOpen(false);
      return;
    }

    setCsvFileName(file.name);
    setCsvImportSummary(null);
    setCsvImportProgress("");

    const text = await file.text();
    const csvRows = parseCsvText(text);

    if (csvRows.length < 2) {
      setCsvPreview({ rows: 0, products: 0, recognized: [], ready: 0, needsDetails: 0, items: [] });
      setCsvReviewOpen(true);
      return;
    }

    const headers = csvRows[0];
    const normalized = headers.map(normalizeCsvHeader);

    const commonColumns: Array<[string, string[]]> = [
      ["Title", ["title", "name", "productname"]],
      ["Description", ["bodyhtml", "description", "body"]],
      ["SKU", ["variantsku", "sku"]],
      ["Price", ["variantprice", "price"]],
      ["Inventory", ["variantinventoryqty", "inventory", "quantity", "stock", "available"]],
      ["Handle / Product ID", ["handle", "productid", "parentid"]],
      ["Status", ["status", "published"]],
      ["Image", ["imagesrc", "imageurl", "image", "src"]],
      ["Option / Variant", ["option1value", "variant", "variation"]],
    ];

    const recognized = commonColumns
      .filter(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))
      .map(([label]) => label);

    const findColumn = (aliases: string[]) =>
      normalized.findIndex((header) => aliases.includes(header));

    const handleIndex = findColumn(["handle", "productid", "parentid"]);
    const titleIndex = findColumn(["title", "name", "productname"]);
    const descriptionIndex = findColumn(["bodyhtml", "description", "body"]);
    const statusIndex = findColumn(["status", "published"]);
    const skuIndex = findColumn(["variantsku", "sku"]);
    const priceIndex = findColumn(["variantprice", "price"]);
    const inventoryIndex = findColumn(["variantinventoryqty", "inventory", "quantity", "stock", "available"]);
    const imageIndex = findColumn(["imagesrc", "imageurl", "image", "src"]);

    const optionNameIndexes = [
      findColumn(["option1name"]),
      findColumn(["option2name"]),
      findColumn(["option3name"]),
    ];
    const optionValueIndexes = [
      findColumn(["option1value", "variant", "variation"]),
      findColumn(["option2value"]),
      findColumn(["option3value"]),
    ];

    type Group = {
      key: string;
      title: string;
      description: string;
      rows: number;
      status: string;
      imageUrls: Set<string>;
      sourceOptionNames: string[];
      variants: CsvImportedVariant[];
    };

    const grouped = new Map<string, Group>();
    let lastParentKey = "";

    for (let index = 1; index < csvRows.length; index++) {
      const row = csvRows[index];
      const rawHandle = handleIndex >= 0 ? String(row[handleIndex] || "").trim() : "";
      const rawTitle = titleIndex >= 0 ? String(row[titleIndex] || "").trim() : "";

      // Shopify variant/image continuation rows commonly repeat the handle while
      // leaving the title blank. If a source omits both, keep it with the most
      // recent parent rather than silently turning the row into a new product.
      const key = rawHandle || rawTitle || lastParentKey || `row-${index}`;
      lastParentKey = key;

      const current = grouped.get(key) || {
        key,
        title: rawTitle || key,
        description: "",
        rows: 0,
        status: statusIndex >= 0 ? String(row[statusIndex] || "Unknown") : "Unknown",
        imageUrls: new Set<string>(),
        sourceOptionNames: [],
        variants: [],
      };

      current.rows += 1;
      if (rawTitle) current.title = rawTitle;
      if (descriptionIndex >= 0 && row[descriptionIndex] && !current.description) {
        current.description = String(row[descriptionIndex]).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
      if (statusIndex >= 0 && row[statusIndex]) current.status = String(row[statusIndex]);
      if (imageIndex >= 0 && /^https?:\/\//i.test(String(row[imageIndex] || "").trim())) {
        current.imageUrls.add(String(row[imageIndex]).trim());
      }

      const optionNames = optionNameIndexes.map((columnIndex, optionIndex) => {
        const supplied = columnIndex >= 0 ? String(row[columnIndex] || "").trim() : "";
        if (supplied) return supplied;
        const hasValue = optionValueIndexes[optionIndex] >= 0 && String(row[optionValueIndexes[optionIndex]] || "").trim();
        return hasValue ? `Option ${optionIndex + 1}` : "";
      });

      optionNames.forEach((name, optionIndex) => {
        if (name && !current.sourceOptionNames[optionIndex]) current.sourceOptionNames[optionIndex] = name;
      });

      const sourceOptionValues = optionValueIndexes.map((columnIndex) =>
        columnIndex >= 0 ? String(row[columnIndex] || "").trim() : "",
      );
      const sku = skuIndex >= 0 ? String(row[skuIndex] || "").trim() : "";
      const price = priceIndex >= 0 ? String(row[priceIndex] || "").replace(/[$,]/g, "").trim() : "";
      const inventory = inventoryIndex >= 0 ? String(row[inventoryIndex] || "").replace(/,/g, "").trim() : "";

      const hasVariantData = Boolean(
        sku || price || inventory || sourceOptionValues.some(Boolean),
      );

      if (hasVariantData) {
        current.variants.push({
          key: `${key}::${index}`,
          price,
          inventory,
          sku,
          sourceOptionValues,
        });
      }

      grouped.set(key, current);
    }

    const items: CsvImportedProduct[] = Array.from(grouped.values())
      .filter((item) => {
        const status = item.status.toLowerCase().trim();
        return status !== "draft" && status !== "archived";
      })
      .map((item) => {
        const variants = item.variants.length > 0
          ? item.variants
          : [{ key: `${item.key}::standard`, price: "", inventory: "", sku: "", sourceOptionValues: [] }];
        const skus = new Set(variants.map((variant) => variant.sku).filter(Boolean));
        return {
          key: item.key,
          title: item.title || "Untitled product",
          description: item.description,
          rows: item.rows,
          status: item.status || "Unknown",
          skuCount: skus.size,
          variantCount: variants.length,
          imageUrls: Array.from(item.imageUrls).slice(0, 10),
          sourceOptionNames: item.sourceOptionNames.filter(Boolean),
          variants,
          ...inferHairGrabDetails(item.title || ""),
        };
      });

    const counts = refreshCsvCounts(items);

    setCsvPreview({
      rows: Math.max(0, csvRows.length - 1),
      products: items.length,
      recognized,
      ...counts,
      items,
    });
    setCsvSelectedKeys([]);
    setCsvBulkProductType("");
    setCsvBulkMaterial("");
    setCsvBulkTexture("");
    setCsvEditingKey(null);
    setCsvReviewOpen(true);
    event.target.value = "";
  }

  function csvMissingDetails(item: CsvImportedProduct) {
    const missing: string[] = [];
    if (item.excluded) return missing;
    if (!item.title.trim()) missing.push("product name");
    if (!item.productType) missing.push("product type");
    if (item.productType && item.productType !== "HAIR_ESSENTIAL") {
      if (!item.material) missing.push("hair material");
      if (!item.texture) missing.push("texture");
    }
    if (item.classification === "LOCS" && !item.locType) {
      missing.push("loc type");
    }
    return missing;
  }

  function csvWarnings(item: CsvImportedProduct) {
    const warnings: string[] = [];
    if (item.excluded) return warnings;
    if (!item.description.trim()) warnings.push("no description in source CSV");
    if (item.imageUrls.length === 0) warnings.push("no product images in source CSV");
    const missingPriceCount = item.variants.filter((variant) => String(variant.price || "").trim() === "").length;
    if (missingPriceCount > 0) warnings.push("price not included in source CSV — HairGrab will save a draft with a $0 placeholder until price is synced or updated");
    if (item.status.toLowerCase() === "unknown") warnings.push("source status not provided");
    return warnings;
  }

  function csvItemReady(item: CsvImportedProduct) {
    return !item.imported && !item.excluded && csvMissingDetails(item).length === 0;
  }

  function refreshCsvCounts(items: CsvImportedProduct[]) {
    const active = items.filter((item) => !item.imported && !item.excluded);
    const ready = active.filter(csvItemReady).length;
    const needsDetails = active.filter((item) => !csvItemReady(item)).length;
    return { ready, needsDetails };
  }

  function applyCsvBulkDetails() {
    if (!csvPreview || csvSelectedKeys.length === 0) return;

    const selected = new Set(csvSelectedKeys);
    const items = csvPreview.items.map((item) => {
      if (!selected.has(item.key) || item.imported) return item;
      const next = { ...item, importError: undefined };
      if (csvBulkProductType) {
        next.productType = csvBulkProductType;
        next.productOption = undefined;
        next.classification = undefined;
        next.installationMethod = undefined;
        next.locType = undefined;
        next.laceSize = undefined;
      }
      if (csvBulkMaterial) next.material = csvBulkMaterial;
      if (csvBulkTexture) next.texture = csvBulkTexture;
      return next;
    });
    const counts = refreshCsvCounts(items);
    setCsvPreview({ ...csvPreview, items, ...counts });
  }

  function toggleCsvProduct(key: string) {
    setCsvSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  function toggleCsvExclude(key: string) {
    if (!csvPreview) return;
    const items = csvPreview.items.map((item) =>
      item.key === key
        ? { ...item, excluded: !item.excluded, importError: undefined }
        : item,
    );
    setCsvSelectedKeys((current) => current.filter((itemKey) => itemKey !== key));
    setCsvPreview({ ...csvPreview, items, ...refreshCsvCounts(items) });
  }

  function clearCsvImport() {
    setCsvFileName("");
    setCsvPreview(null);
    setCsvReviewOpen(false);
    setCsvSelectedKeys([]);
    setCsvEditingKey(null);
    setCsvImportSummary(null);
    setCsvImportProgress("");
  }

  function updateCsvProduct(key: string, changes: Partial<CsvImportedProduct>) {
    if (!csvPreview) return;
    const items = csvPreview.items.map((item) =>
      item.key === key ? { ...item, ...changes, importError: undefined } : item,
    );
    setCsvPreview({ ...csvPreview, items, ...refreshCsvCounts(items) });
  }

  function updateCsvVariant(productKey: string, variantKey: string, field: "price" | "inventory" | "sku", value: string) {
    if (!csvPreview) return;
    const items = csvPreview.items.map((item) => {
      if (item.key !== productKey) return item;
      return {
        ...item,
        importError: undefined,
        variants: item.variants.map((variant) =>
          variant.key === variantKey ? { ...variant, [field]: value } : variant,
        ),
      };
    });
    setCsvPreview({ ...csvPreview, items, ...refreshCsvCounts(items) });
  }

  function csvProductPayload(item: CsvImportedProduct): ProductPayload {
    const colorOptionIndex = item.sourceOptionNames.findIndex((name) => /color|colour/i.test(name));
    const lengthOptionIndex = item.sourceOptionNames.findIndex((name) => /length|size/i.test(name));
    const colors = colorOptionIndex >= 0
      ? Array.from(new Set(item.variants.map((variant) => variant.sourceOptionValues[colorOptionIndex]).filter(Boolean)))
      : ["Natural / 1B"];

    return {
      title: item.title.trim(),
      description: item.description.trim() || `${item.title.trim()} — imported from the seller's existing catalog. Review this description before publishing.`,
      productType: item.productType as ProductType,
      material: item.productType === "HAIR_ESSENTIAL" ? "Not Applicable" : String(item.material || ""),
      colors: colors.length > 0 ? colors : ["Natural / 1B"],
      texture: item.productType === "HAIR_ESSENTIAL" ? "Not Applicable" : String(item.texture || ""),
      selectedOptions: item.productOption ? [item.productOption] : [],
      optionsAreVariants: false,
      searchClassifications: item.classification ? [item.classification] : [],
      installationMethods: item.installationMethod ? [item.installationMethod] : [],
      locType: item.locType || "",
      density: item.density || "",
      laceSize: item.laceSize || "",
      laceType: item.laceType || "",
      capSize: item.capSize || "",
      bundleWeight: item.bundleWeight || "100g",
      shippingMethod: "Free Shipping",
      flatRateShipping: "",
      localPickupAvailable: false,
      localDeliveryAvailable: false,
      shipsWithin: "48 Hours",
      returnPolicy: "14-Day Returns",
      showOnMap: "Yes",
      imageUrls: item.imageUrls,
      sourceOptionNames: item.sourceOptionNames,
      variants: item.variants.map((variant, index) => {
        const rawLength = lengthOptionIndex >= 0 ? variant.sourceOptionValues[lengthOptionIndex] || "" : "";
        const numericLength = rawLength.match(/\d+(?:\.\d+)?/)?.[0] || "";
        return {
          label: variant.sourceOptionValues.filter(Boolean).join(" / ") || `Variant ${index + 1}`,
          length: numericLength,
          option: "",
          color: colorOptionIndex >= 0 ? variant.sourceOptionValues[colorOptionIndex] || colors[0] || "Natural / 1B" : colors[0] || "Natural / 1B",
          price: String(variant.price || "").trim() || "0",
          inventory: variant.inventory,
          sku: variant.sku,
          sourceOptionValues: variant.sourceOptionValues,
        };
      }),
    };
  }

  function importReadyCsvProducts() {
    if (!csvPreview || csvImporting) return;
    const readyItems = csvPreview.items.filter(csvItemReady);
    if (readyItems.length === 0) return;

    const payloads = readyItems.map((item) => ({
      ...csvProductPayload(item),
      csvSourceKey: item.key,
    }));

    const formData = new FormData();
    formData.append("csvBatchPayload", JSON.stringify(payloads));
    setCsvImporting(true);
    setCsvImportSummary(null);
    setCsvImportProgress(`Adding ${readyItems.length} ready product${readyItems.length === 1 ? "" : "s"} to My Products...`);
    csvImportFetcher.submit(formData, { method: "post" });
  }

  useEffect(() => {
    const result = csvImportFetcher.data as any;
    if (!result?.csvBatch || !csvPreview) return;

    const resultByKey = new Map<string, any>(
      Array.isArray(result.results)
        ? result.results.map((entry: any) => [String(entry.key || ""), entry])
        : [],
    );

    const items = csvPreview.items.map((item) => {
      const entry = resultByKey.get(item.key);
      if (!entry) return item;
      return entry.success
        ? { ...item, imported: true, importError: undefined }
        : { ...item, importError: String(entry.message || "Add failed") };
    });

    const failures = Array.isArray(result.results)
      ? result.results
          .filter((entry: any) => !entry.success)
          .map((entry: any) => `${entry.title}: ${entry.message}`)
      : [];

    setCsvPreview({ ...csvPreview, items, ...refreshCsvCounts(items) });
    setCsvImportSummary({
      imported: Number(result.imported || 0),
      failed: Number(result.failed || failures.length || 0),
      failures,
    });
    setCsvSelectedKeys((current) =>
      current.filter((key) => !items.find((item) => item.key === key)?.imported),
    );
    setCsvImportProgress("");
    setCsvImporting(false);
  // We intentionally react only when the batch fetcher receives a new result.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvImportFetcher.data]);


  function saveProduct(
    saveAsDraft = false,
  ) {
    if (
      !productType ||
      !title.trim() ||
      (!saveAsDraft &&
        !ready)
    ) {
      return;
    }

    const payload:
      ProductPayload =
      {
        title:
          title.trim(),

        description:
          description.trim(),

        productType,

        material:
          resolvedMaterial,

        colors:
          selectedColors,

        texture,

        selectedOptions,

        optionsAreVariants,

        searchClassifications,

        installationMethods,

        locType,

        density,

        laceSize,

        laceType,

        capSize,

        bundleWeight,

        shippingMethod,

        flatRateShipping:
          shippingMethod ===
            "Flat Rate Shipping"
            ? flatRateShipping
            : "",

        localPickupAvailable:
          seller.offersLocalPickup &&
          localPickupAvailable,

        localDeliveryAvailable:
          seller.offersLocalDelivery &&
          localDeliveryAvailable,

        shipsWithin,

        returnPolicy,

        showOnMap,

        variants:
          (variantRows.length > 0
            ? variantRows
            : saveAsDraft
              ? [
                  {
                    key: "DRAFT",
                    label: "Draft",
                    length: "",
                    option: "",
                    color:
                      selectedColors[0] ||
                      "Natural / 1B",
                  },
                ]
              : []
          ).map(
            (
              row,
            ) => ({
              label:
                row.label,

              length:
                row.length,

              option:
                row.option,

              color:
                row.color,

              price:
                variantValues[
                  row.key
                ]?.price ||
                (saveAsDraft
                  ? "0"
                  : ""),

              salePrice:
                onSale
                  ? variantValues[
                      row.key
                    ]?.salePrice ||
                    ""
                  : "",

              inventory:
                variantValues[
                  row.key
                ]
                  ?.inventory ||
                "",

              sku:
                variantValues[
                  row.key
                ]?.sku ||
                "",
            }),
          ),
      };

    const formData =
      new FormData();

    formData.append(
      "productPayload",
      JSON.stringify(
        payload,
      ),
    );

    formData.append(
      "saveAsDraft",
      saveAsDraft
        ? "true"
        : "false",
    );

    for (
      const image of
      images
    ) {
      formData.append(
        "images",
        image,
      );
    }

    for (
      const video of
      videos
    ) {
      formData.append(
        "videos",
        video,
      );
    }

    saveFetcher.submit(
      formData,
      {
        method:
          "post",

        encType:
          "multipart/form-data",
      },
    );
  }

  // ========================================================
  // REVIEW SCREEN
  // ========================================================

  if (
    reviewing
  ) {
    return (
      <PageShell>
        <div
          style={{
            color:
              "#7b3fa0",

            fontWeight:
              "800",

            fontSize:
              "11px",
          }}
        >
          HAIRGRAB PRODUCT REVIEW
        </div>

        <h1
          style={{
            color:
              "#4B1678",

            margin:
              "6px 0",
          }}
        >
          Review Product
        </h1>

        <p>
          Seller:{" "}
          <strong>
            {
              seller.businessName
            }
          </strong>
        </p>

        {onSale && (
          <div
            style={{
              margin:
                "12px 0 16px",

              padding:
                "11px 12px",

              border:
                "1px solid #edd8a6",

              borderRadius:
                "9px",

              background:
                "#fff8e8",

              color:
                "#6f5516",

              fontSize:
                "11px",

              fontWeight:
                "800",
            }}
          >
            SALE PRODUCT — each variant will use the Sale Price as the shopper price and the Regular Price as the crossed-out compare-at price.
          </div>
        )}

        {saveResult?.message && (
          <div
            style={{
              padding:
                "14px",

              borderRadius:
                "10px",

              margin:
                "16px 0",

              background:
                saveResult.success
                  ? "#eef8f0"
                  : "#fff1f1",

              color:
                saveResult.success
                  ? "#2f6b3c"
                  : "#922f2f",

              fontWeight:
                "800",

              fontSize:
                "12px",
            }}
          >
            {
              saveResult.message
            }

            {saveResult.success && (
              <div
                style={{
                  marginTop:
                    "6px",

                  fontWeight:
                    "600",
                }}
              >
                {
                  saveResult.variantCount
                }{" "}
                variant(s) saved
                ·{" "}
                {
                  saveResult.mediaCount
                }{" "}
                media file(s)

                {" · "}

                {
                  saveResult.metafieldsSaved ||
                  0
                }{" "}
                metafield(s) filled

                {Boolean(
                  saveResult.metafieldsSkipped,
                ) && (
                  <>
                    {" · "}
                    {
                      saveResult.metafieldsSkipped
                    }{" "}
                    incompatible field(s) skipped
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            {title}
          </h2>

          <p
            style={{
              whiteSpace:
                "pre-wrap",
            }}
          >
            {description}
          </p>
        </div>

        <div
          style={
            sectionStyle
          }
        >
          <ReviewGrid>
            <ReviewValue
              label="Type"
              value={
                productTypes.find(
                  (
                    type,
                  ) =>
                    type.value ===
                    productType,
                )?.label ||
                ""
              }
            />

            <ReviewValue
              label="Material"
              value={
                resolvedMaterial
              }
            />

            <ReviewValue
              label="Color"
              value={
                selectedColors.join(
                  ", ",
                )
              }
            />

            <ReviewValue
              label="Texture"
              value={
                texture ||
                "—"
              }
            />

            {productType ===
              "BRAIDING_HAIR" && (
              <ReviewValue
                label="Installation"
                value={
                  installationMethods.length >
                  0
                    ? installationMethodChoices
                        .filter((choice) =>
                          installationMethods.includes(
                            choice.value,
                          ),
                        )
                        .map(
                          (choice) =>
                            choice.label,
                        )
                        .join(", ")
                    : "—"
                }
              />
            )}

            <ReviewValue
              label="Photos"
              value={`${images.length}/10`}
            />

            <ReviewValue
              label="Videos"
              value={`${videos.length}/3`}
            />

            <ReviewValue
              label="Shipping"
              value={
                shippingMethod
              }
            />

            <ReviewValue
              label="Ships Within"
              value={
                shipsWithin
              }
            />

            <ReviewValue
              label="Return Policy"
              value={
                returnPolicy
              }
            />

            <ReviewValue
              label="Show on HairGrab Map"
              value={
                showOnMap
              }
            />
          </ReviewGrid>

          {(images.length > 0 ||
            videos.length > 0) && (
            <div
              style={{
                marginTop:
                  "18px",

                paddingTop:
                  "16px",

                borderTop:
                  "1px solid #eee7f2",
              }}
            >
              <div
                style={{
                  color:
                    "#4B1678",

                  fontSize:
                    "13px",

                  fontWeight:
                    "800",

                  marginBottom:
                    "8px",
                }}
              >
                Media Preview
              </div>

              <ReviewMediaPreview
                images={
                  images
                }
                videos={
                  videos
                }
              />
            </div>
          )}
        </div>

        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            Variants & Pricing
          </h2>

          <div
            style={{
              overflowX:
                "auto",
            }}
          >
            <table
              style={{
                width:
                  "100%",

                borderCollapse:
                  "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    background:
                      "#f7f0fb",
                  }}
                >
                  <th
                    style={
                      thStyle
                    }
                  >
                    Variant
                  </th>

                  <th
                    style={
                      thStyle
                    }
                  >
                    {onSale
                      ? "Regular Price"
                      : "Price"}
                  </th>

                  {onSale && (
                    <th style={thStyle}>
                      Sale Price
                    </th>
                  )}

                  <th
                    style={
                      thStyle
                    }
                  >
                    Inventory
                  </th>

                  <th
                    style={
                      thStyle
                    }
                  >
                    SKU
                  </th>
                </tr>
              </thead>

              <tbody>
                {variantRows.map(
                  (
                    row,
                  ) => (
                    <tr
                      key={
                        row.key
                      }
                    >
                      <td
                        style={
                          tdStyle
                        }
                      >
                        {
                          row.label
                        }
                      </td>

                      <td
                        style={
                          tdStyle
                        }
                      >
                        $
                        {
                          variantValues[
                            row.key
                          ]?.price
                        }
                      </td>

                      {onSale && (
                        <td style={tdStyle}>
                          $
                          {
                            variantValues[
                              row.key
                            ]?.salePrice ||
                            "—"
                          }
                        </td>
                      )}

                      <td
                        style={
                          tdStyle
                        }
                      >
                        {
                          variantValues[
                            row.key
                          ]
                            ?.inventory ||
                          "—"
                        }
                      </td>

                      <td
                        style={
                          tdStyle
                        }
                      >
                        {
                          variantValues[
                            row.key
                          ]?.sku ||
                          "—"
                        }
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            ...sectionStyle,

            display:
              "flex",

            gap:
              "10px",

            flexWrap:
              "wrap",
          }}
        >
          <button
            type="button"
            disabled={
              saving
            }
            onClick={() =>
              setReviewing(
                false,
              )
            }
            style={
              secondaryButton
            }
          >
            ← Back to Edit
          </button>

          <button
            type="button"
            disabled={
              saving ||
              Boolean(
                saveResult?.success,
              )
            }
            onClick={() =>
              saveProduct(false)
            }
            style={
              primaryButton
            }
          >
            {saving
              ? "Saving Product..."
              : saveResult?.success
                ? "✓ Product Saved"
                : "Save Product"}
          </button>

          {saveResult?.success && (
            <>
              <a
                href="/seller/add-product"
                style={{
                  ...primaryButton,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                + Add Another Product
              </a>

              <a
                href="/seller/products"
                style={{
                  ...secondaryButton,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                View My Products
              </a>
            </>
          )}
        </div>

        <div
          style={{
            marginTop:
              "10px",

            textAlign:
              "center",

            color:
              "#817787",

            fontSize:
              "10px",
          }}
        >
          Once you save your product, HairGrab receives it for review. Approved products will be published to the marketplace.
        </div>
      </PageShell>
    );
  }

  // ========================================================
  // EDIT SCREEN
  // ========================================================

  return (
    <PageShell>
      <div
        style={{
          display:
            "flex",

          justifyContent:
            "space-between",

          alignItems:
            "center",

          gap:
            "12px",

          flexWrap:
            "wrap",
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
            HairGrab Quick Add
          </div>

          <h1
            style={{
              margin:
                "5px 0",

              color:
                "#4B1678",
            }}
          >
            Add a Product
          </h1>

          <div
            style={{
              fontSize:
                "12px",

              color:
                "#776e7b",
            }}
          >
            Paste the basics.
            HairGrab handles
            the repetitive work.
          </div>
        </div>

        <div
          style={{
            background:
              "#eef8f0",

            color:
              "#347143",

            borderRadius:
              "20px",

            padding:
              "8px 12px",

            fontWeight:
              "800",

            fontSize:
              "11px",
          }}
        >
          Goal: under 2 minutes
        </div>
      </div>

      <div
        style={{
          marginTop:
            "18px",

          padding:
            "13px 14px",

          background:
            "#f7f0fb",

          border:
            "1px solid #e2d1ef",

          borderRadius:
            "11px",

          color:
            "#4B1678",

          fontSize:
            "11px",

          lineHeight:
            1.55,
        }}
      >
        <strong>
          Help shoppers find your product.
        </strong>{" "}
        HairGrab uses the details you enter below for search, filters and product matching. Complete every field that applies to your product. Leaving an applicable field blank may keep the product from appearing in some shopper searches or filters.
      </div>


      <div
        style={{
          marginTop: "18px",
          padding: "16px",
          border: "1px solid #e3d6ea",
          borderRadius: "14px",
          background: "#fbf8fd",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#4B1678", fontSize: "15px", fontWeight: 900 }}>Bulk Product Import</div>
            <div style={{ marginTop: "4px", color: "#6f6475", fontSize: "11px", lineHeight: 1.5, maxWidth: "650px" }}>
              Bring in an existing product catalog, then finish HairGrab-specific details without rebuilding every listing. HairGrab keeps variants together, carries over source data, suggests classifications from product names, and saves approved products to My Products as Shopify drafts.
            </div>
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: "#4B1678", color: "#fff", padding: "10px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
            Import Catalog
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} style={{ display: "none" }} />
          </label>
        </div>

        {csvFileName && csvPreview && (
          <div style={{ marginTop: "12px", padding: "12px", borderRadius: "10px", background: "#fff", border: "1px solid #eee4f2", fontSize: "11px", color: "#4b3f50" }}>
            <strong>{csvFileName}</strong>
            <div style={{ marginTop: "5px", lineHeight: 1.6 }}>
              {csvPreview.products} product{csvPreview.products === 1 ? "" : "s"} found · {csvPreview.rows} CSV row{csvPreview.rows === 1 ? "" : "s"}
              <br />
              Recognized: {csvPreview.recognized.length > 0 ? csvPreview.recognized.join(", ") : "No common product columns recognized"}
            </div>

            {!csvPreview.recognized.includes("Price") && (
              <div style={{ marginTop: "10px", padding: "10px", borderRadius: "9px", background: "#fff4e5", color: "#7a4d00", lineHeight: 1.5 }}>
                <strong>This looks like an inventory-only CSV.</strong> HairGrab can still save these products to <strong>My Products</strong> as incomplete Shopify drafts without making you type prices or quantities here. Missing prices are stored as a temporary $0 draft value and nothing can go live until the product is completed. For a hands-off import of price, description, images, and inventory, use a full product export or the Shopify connection when enabled.
              </div>
            )}

            <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ padding: "5px 9px", borderRadius: "999px", background: "#eef8f0", color: "#276236", fontWeight: 800 }}>
                {csvPreview.ready} ready to add
              </span>
              <span style={{ padding: "5px 9px", borderRadius: "999px", background: "#fff5df", color: "#7a5410", fontWeight: 800 }}>
                {csvPreview.needsDetails} need information
              </span>
              <span style={{ padding: "5px 9px", borderRadius: "999px", background: "#f3eef6", color: "#4B1678", fontWeight: 800 }}>
                {csvPreview.items.filter((item) => item.imported).length} imported
              </span>
            </div>

            <button type="button" onClick={() => setCsvReviewOpen((current) => !current)} style={{ marginTop: "10px", border: 0, borderRadius: "9px", background: "#4B1678", color: "white", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>
              {csvReviewOpen ? "Hide Product Review" : "Review & Complete Products"}
            </button>
            <button type="button" onClick={clearCsvImport} style={{ marginLeft: "8px", border: "1px solid #d8cce0", background: "white", color: "#4B1678", borderRadius: "8px", padding: "8px 10px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}>
              Exit CSV Import
            </button>
          </div>
        )}

        {csvPreview && csvReviewOpen && (
          <div style={{ marginTop: "12px", background: "white", border: "1px solid #e8deec", borderRadius: "12px", padding: "12px" }}>
            <div style={{ color: "#4B1678", fontWeight: 900, fontSize: "14px" }}>1. Review source data → 2. Add HairGrab details → 3. Save to My Products</div>
            <div style={{ marginTop: "4px", fontSize: "11px", color: "#6f6475", lineHeight: 1.5 }}>
              “Ready to save” means HairGrab has the product name and required HairGrab classification. Source price, quantity, SKU, images, and description are carried over when present. Missing commerce details no longer block saving because the product is created as an incomplete draft, never live.
            </div>

            <div style={{ marginTop: "12px", padding: "12px", borderRadius: "11px", background: "#faf7fb", border: "1px solid #eee4f2" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <strong style={{ color: "#4B1678", fontSize: "12px" }}>Bulk Complete Similar Products</strong>
                <button
                  type="button"
                  onClick={() => {
                    const available = csvPreview.items.filter((item) => !item.imported && !item.excluded).map((item) => item.key);
                    setCsvSelectedKeys(csvSelectedKeys.length === available.length ? [] : available);
                  }}
                  style={{ border: "1px solid #d8cce0", background: "white", color: "#4B1678", borderRadius: "8px", padding: "7px 10px", fontWeight: 800, cursor: "pointer", fontSize: "11px" }}
                >
                  {csvSelectedKeys.length === csvPreview.items.filter((item) => !item.imported && !item.excluded).length ? "Clear All" : "Select All"}
                </button>
              </div>
              <div style={{ marginTop: "8px", fontSize: "10px", color: "#766b79" }}>{csvSelectedKeys.length} selected. Optional shortcut: use this only for products that truly share the same details. You can classify every product individually below.</div>

              <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#4B1678" }}>Product Type
                  <select value={csvBulkProductType} onChange={(event) => setCsvBulkProductType(event.target.value as ProductType | "")} style={{ ...fieldStyle, marginTop: "5px" }}>
                    <option value="">Leave unchanged</option>
                    {productTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#4B1678" }}>Hair Material
                  <select value={csvBulkMaterial} onChange={(event) => setCsvBulkMaterial(event.target.value)} style={{ ...fieldStyle, marginTop: "5px" }}>
                    <option value="">Leave unchanged</option>
                    {materials.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "#4B1678" }}>Texture
                  <select value={csvBulkTexture} onChange={(event) => setCsvBulkTexture(event.target.value)} style={{ ...fieldStyle, marginTop: "5px" }}>
                    <option value="">Leave unchanged</option>
                    {textures.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </div>
              <button type="button" disabled={csvSelectedKeys.length === 0 || (!csvBulkProductType && !csvBulkMaterial && !csvBulkTexture)} onClick={applyCsvBulkDetails} style={{ marginTop: "11px", border: 0, borderRadius: "9px", background: "#4B1678", color: "white", padding: "10px 13px", fontWeight: 850, cursor: "pointer", opacity: csvSelectedKeys.length === 0 || (!csvBulkProductType && !csvBulkMaterial && !csvBulkTexture) ? 0.5 : 1 }}>
                Apply to {csvSelectedKeys.length || 0} Selected
              </button>
            </div>

            <div style={{ marginTop: "10px", display: "grid", gap: "8px", maxHeight: "540px", overflowY: "auto" }}>
              {csvPreview.items.map((item) => {
                const missing = csvMissingDetails(item);
                const warnings = csvWarnings(item);
                const readyToImport = csvItemReady(item);
                const priced = item.variants.filter((variant) => String(variant.price).trim() !== "" && Number.isFinite(Number(variant.price))).length;
                const editing = csvEditingKey === item.key;
                const itemOptions = item.productType ? productOptions[item.productType] || [] : [];
                const itemClassifications = item.productType ? productClassifications[item.productType] || [] : [];
                const isLocs = item.classification === "LOCS";
                const showLaceSize = item.productType === "WIG" || item.productType === "CLOSURE_FRONTAL";

                return (
                  <div key={item.key} style={{ border: item.importError ? "1px solid #e9b9b9" : item.excluded ? "1px solid #e2dce5" : "1px solid #eee4f2", borderRadius: "10px", padding: "11px", background: item.imported ? "#f5fbf6" : item.excluded ? "#fafafa" : "white", opacity: item.excluded ? 0.72 : 1 }}>
                    <div style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}>
                      <input type="checkbox" disabled={Boolean(item.imported) || Boolean(item.excluded)} checked={csvSelectedKeys.includes(item.key)} onChange={() => toggleCsvProduct(item.key)} style={{ marginTop: "4px" }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: 850, color: "#2e2432" }}>{item.title}</div>
                            <div style={{ marginTop: "3px", fontSize: "10px", color: "#766b79", lineHeight: 1.45 }}>
                              {item.variantCount} variant{item.variantCount === 1 ? "" : "s"} · {priced}/{item.variantCount} priced · {item.skuCount} SKU{item.skuCount === 1 ? "" : "s"} · {item.imageUrls.length} image{item.imageUrls.length === 1 ? "" : "s"} · Source: {item.status}
                            </div>
                          </div>
                          <span style={{ whiteSpace: "nowrap", padding: "5px 8px", borderRadius: "999px", background: item.imported ? "#e7f5ea" : item.excluded ? "#f0edf2" : readyToImport ? "#eef8f0" : "#fff5df", color: item.imported ? "#276236" : item.excluded ? "#6c6370" : readyToImport ? "#276236" : "#7a5410", fontSize: "10px", fontWeight: 850 }}>
                            {item.imported ? "✓ Imported" : item.excluded ? "Excluded" : readyToImport ? "✓ Ready to add" : "Needs information"}
                          </span>
                        </div>

                        {!item.imported && !item.excluded && (
                          <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: "7px" }}>
                            <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Product Type *
                              <select value={item.productType || ""} onChange={(event) => updateCsvProduct(item.key, { productType: (event.target.value || undefined) as ProductType | undefined, productOption: undefined, classification: undefined, installationMethod: undefined, locType: undefined, laceSize: undefined })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Select</option>
                                {productTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                              </select>
                            </label>

                            {item.productType && item.productType !== "HAIR_ESSENTIAL" && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Hair Material *
                              <select value={item.material || ""} onChange={(event) => updateCsvProduct(item.key, { material: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Select</option>
                                {materials.filter((value) => value !== "Not Applicable").map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {item.productType && item.productType !== "HAIR_ESSENTIAL" && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Texture *
                              <select value={item.texture || ""} onChange={(event) => updateCsvProduct(item.key, { texture: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Select</option>
                                {textures.map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {itemOptions.length > 0 && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Type / Style
                              <select value={item.productOption || ""} onChange={(event) => updateCsvProduct(item.key, { productOption: event.target.value || undefined })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {itemOptions.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                              </select>
                            </label>}

                            {itemClassifications.length > 0 && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Classification
                              <select value={item.classification || ""} onChange={(event) => updateCsvProduct(item.key, { classification: event.target.value || undefined, locType: undefined, installationMethod: undefined })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {itemClassifications.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                              </select>
                            </label>}

                            {isLocs && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Loc Type *
                              <select value={item.locType || ""} onChange={(event) => updateCsvProduct(item.key, { locType: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Select</option>
                                {locTypeChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                              </select>
                            </label>}

                            {(item.productType === "BRAIDING_HAIR" || isLocs) && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Installation
                              <select value={item.installationMethod || ""} onChange={(event) => updateCsvProduct(item.key, { installationMethod: event.target.value || undefined })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {installationMethodChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                              </select>
                            </label>}

                            {showLaceSize && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Lace Size
                              <select value={item.laceSize || ""} onChange={(event) => updateCsvProduct(item.key, { laceSize: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {laceSizes.map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {item.productType === "WIG" && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Density
                              <select value={item.density || ""} onChange={(event) => updateCsvProduct(item.key, { density: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {densities.map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {showLaceSize && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Lace Type
                              <select value={item.laceType || ""} onChange={(event) => updateCsvProduct(item.key, { laceType: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {laceTypes.map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {item.productType === "WIG" && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Cap Size
                              <select value={item.capSize || ""} onChange={(event) => updateCsvProduct(item.key, { capSize: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                <option value="">Optional</option>
                                {["Small", "Medium", "Large", "Adjustable"].map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}

                            {item.productType === "BUNDLE" && <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Bundle Weight
                              <select value={item.bundleWeight || "100g"} onChange={(event) => updateCsvProduct(item.key, { bundleWeight: event.target.value })} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }}>
                                {["50g", "100g", "120g", "150g", "200g+"].map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>}
                          </div>
                        )}

                        {false && !item.imported && !item.excluded && (
                          <div style={{ marginTop: "10px", padding: "10px", borderRadius: "9px", background: "#faf7fb", border: "1px solid #eee4f2" }}>
                            <div style={{ fontSize: "10px", fontWeight: 850, color: "#4B1678" }}>
                              {item.variantCount === 1 ? "Price & inventory" : `Variant prices & inventory (${item.variantCount})`}
                            </div>
                            {item.variantCount === 1 ? (
                              <div style={{ marginTop: "6px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(95px, 1fr))", gap: "6px" }}>
                                <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Price *
                                  <input aria-label="Price" placeholder="$0.00" inputMode="decimal" value={item.variants[0]?.price || ""} onChange={(event) => item.variants[0] && updateCsvVariant(item.key, item.variants[0].key, "price", event.target.value.replace(/[^0-9.]/g, ""))} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }} />
                                </label>
                                <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>Inventory
                                  <input aria-label="Inventory" placeholder="Qty" inputMode="numeric" value={item.variants[0]?.inventory || ""} onChange={(event) => item.variants[0] && updateCsvVariant(item.key, item.variants[0].key, "inventory", event.target.value.replace(/[^0-9-]/g, ""))} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }} />
                                </label>
                                <label style={{ fontSize: "9px", fontWeight: 800, color: "#4B1678" }}>SKU
                                  <input aria-label="SKU" placeholder="Optional" value={item.variants[0]?.sku || ""} onChange={(event) => item.variants[0] && updateCsvVariant(item.key, item.variants[0].key, "sku", event.target.value)} style={{ ...fieldStyle, marginTop: "4px", padding: "8px" }} />
                                </label>
                              </div>
                            ) : (
                              <div style={{ marginTop: "7px", display: "grid", gap: "6px" }}>
                                {item.variants.map((variant, variantIndex) => (
                                  <div key={variant.key} style={{ display: "grid", gridTemplateColumns: "minmax(95px, 1.25fr) repeat(3, minmax(72px, 1fr))", gap: "6px", alignItems: "center", fontSize: "10px" }}>
                                    <div style={{ color: "#5f5364", fontWeight: 700 }}>{variant.sourceOptionValues.filter(Boolean).join(" / ") || `Variant ${variantIndex + 1}`}</div>
                                    <input aria-label="Price" placeholder="$ Price *" inputMode="decimal" value={variant.price} onChange={(event) => updateCsvVariant(item.key, variant.key, "price", event.target.value.replace(/[^0-9.]/g, ""))} style={{ ...fieldStyle, padding: "8px" }} />
                                    <input aria-label="Inventory" placeholder="Qty" inputMode="numeric" value={variant.inventory} onChange={(event) => updateCsvVariant(item.key, variant.key, "inventory", event.target.value.replace(/[^0-9-]/g, ""))} style={{ ...fieldStyle, padding: "8px" }} />
                                    <input aria-label="SKU" placeholder="SKU" value={variant.sku} onChange={(event) => updateCsvVariant(item.key, variant.key, "sku", event.target.value)} style={{ ...fieldStyle, padding: "8px" }} />
                                  </div>
                                ))}
                              </div>
                            )}
                            {missing.some((value) => value.includes("price")) && (
                              <div style={{ marginTop: "6px", fontSize: "9px", color: "#8a5d09" }}>Enter the missing price{item.variantCount === 1 ? "" : "s"} here. You do not need to open another screen.</div>
                            )}
                          </div>
                        )}

                        {!item.excluded && missing.length > 0 && <div style={{ marginTop: "6px", fontSize: "10px", color: "#8a5d09" }}>Still needed before this can be added: {missing.join(", ")}</div>}
                        {!item.excluded && warnings.length > 0 && <div style={{ marginTop: "3px", fontSize: "10px", color: "#7d7480" }}>Review warning: {warnings.join(" · ")}</div>}
                        {item.importError && <div style={{ marginTop: "4px", fontSize: "10px", color: "#a22727" }}>Could not add to My Products: {item.importError}</div>}

                        {!item.imported && !item.excluded && (
                          <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            <button type="button" onClick={() => setCsvEditingKey(editing ? null : item.key)} style={{ border: "1px solid #d8cce0", background: "white", color: "#4B1678", borderRadius: "7px", padding: "6px 8px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}>
                              {editing ? "Close Extra Details" : "Edit Name / Description"}
                            </button>
                            <button type="button" onClick={() => toggleCsvExclude(item.key)} style={{ border: "1px solid #d8cce0", background: "white", color: "#6c6370", borderRadius: "7px", padding: "6px 8px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}>
                              Exclude from Import
                            </button>
                          </div>
                        )}
                        {!item.imported && item.excluded && (
                          <button type="button" onClick={() => toggleCsvExclude(item.key)} style={{ marginTop: "8px", border: "1px solid #d8cce0", background: "white", color: "#4B1678", borderRadius: "7px", padding: "6px 8px", fontSize: "10px", fontWeight: 800, cursor: "pointer" }}>
                            Include Again
                          </button>
                        )}
                      </div>
                    </div>

                    {editing && !item.imported && !item.excluded && (
                      <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #eee4f2" }}>
                        <label style={{ fontSize: "10px", fontWeight: 800, color: "#4B1678" }}>Product Name
                          <input value={item.title} onChange={(event) => updateCsvProduct(item.key, { title: event.target.value })} style={{ ...fieldStyle, marginTop: "4px" }} />
                        </label>
                        <label style={{ display: "block", marginTop: "8px", fontSize: "10px", fontWeight: 800, color: "#4B1678" }}>Description
                          <textarea rows={3} value={item.description} onChange={(event) => updateCsvProduct(item.key, { description: event.target.value })} placeholder="Optional during import. This product stays a Shopify draft until you publish it." style={{ ...fieldStyle, marginTop: "4px" }} />
                        </label>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "12px", padding: "12px", borderRadius: "10px", background: "#faf7fb", border: "1px solid #eee4f2" }}>
              <div style={{ fontSize: "11px", color: "#5f5364", lineHeight: 1.5 }}>
                <strong style={{ color: "#4B1678" }}>Ready to save:</strong> {csvPreview.ready} ready · {csvPreview.needsDetails} still need HairGrab classification · {csvPreview.items.filter((item) => item.excluded).length} excluded. Price and quantity are <strong>not required</strong> to save an imported product to My Products. Missing commerce details stay draft-only until completed or synced.
              </div>

              <button
                type="button"
                disabled={csvImporting || csvPreview.ready === 0}
                onClick={() => void importReadyCsvProducts()}
                style={{ marginTop: "10px", width: "100%", border: 0, borderRadius: "10px", background: "#4B1678", color: "white", padding: "12px 14px", fontWeight: 900, cursor: csvImporting || csvPreview.ready === 0 ? "not-allowed" : "pointer", opacity: csvImporting || csvPreview.ready === 0 ? 0.55 : 1 }}
              >
                {csvImporting ? "Adding Products..." : `Save ${csvPreview.ready} Product${csvPreview.ready === 1 ? "" : "s"} to My Products`}
              </button>

              {csvImportProgress && <div style={{ marginTop: "8px", fontSize: "10px", color: "#4B1678" }}>{csvImportProgress}</div>}

              {csvImportSummary && (
                <div style={{ marginTop: "10px", padding: "10px", borderRadius: "9px", background: csvImportSummary.failed === 0 ? "#eef8f0" : "#fff4e5", color: csvImportSummary.failed === 0 ? "#276236" : "#7a4d00", fontSize: "11px", lineHeight: 1.5 }}>
                  <strong>{csvImportSummary.imported} product{csvImportSummary.imported === 1 ? "" : "s"} added to My Products successfully.</strong>
                  {csvImportSummary.failed > 0 && <> {csvImportSummary.failed} failed and remain available to fix/retry.</>}
                  {csvImportSummary.failures.length > 0 && (
                    <div style={{ marginTop: "6px" }}>{csvImportSummary.failures.slice(0, 5).map((failure) => <div key={failure}>• {failure}</div>)}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!csvPreview && (<>
      {/* PRODUCT INFO */}

      <div
        style={
          sectionStyle
        }
      >
        <h2
          style={
            headingStyle
          }
        >
          Product Information
        </h2>

        <label
          style={
            labelStyle
          }
        >
          Product Name *
        </label>

        <input
          value={
            title
          }
          onChange={(
            event,
          ) =>
            setTitle(
              event.target
                .value,
            )
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
          Description *
        </label>

        <textarea
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          style={fieldStyle}
        />

        <button
          type="button"
          disabled={aiWriting}
          onClick={() => void generateHairGrabDescription()}
          style={{
            marginTop: "10px",
            border: "none",
            borderRadius: "10px",
            background: "#4B1678",
            color: "white",
            padding: "10px 14px",
            fontSize: "12px",
            fontWeight: "800",
            cursor: aiWriting ? "wait" : "pointer",
            opacity: aiWriting ? 0.7 : 1,
          }}
        >
          {aiWriting ? "✨ HairGrab AI is writing..." : "✨ Generate with HairGrab AI"}
        </button>

        {aiMessage ? (
          <div
            style={{
              marginTop: "8px",
              color: "#6c5a74",
              fontSize: "12px",
              lineHeight: 1.45,
            }}
          >
            {aiMessage}
          </div>
        ) : null}
      </div>

      {/* TYPE */}

      <div
        style={
          sectionStyle
        }
      >
        <h2
          style={
            headingStyle
          }
        >
          Product Type
        </h2>

        <div
          style={{
            color:
              "#7d7480",

            fontSize:
              "10px",

            lineHeight:
              1.5,

            marginTop:
              "-7px",

            marginBottom:
              "12px",
          }}
        >
          Choose the closest main category. HairGrab uses it to show the right product fields and connect the item to the right shopper filters.
        </div>

        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(200px, 1fr))",

            gap:
              "10px",
          }}
        >
          {productTypes.map(
            (
              item,
            ) => (
              <button
                key={
                  item.value
                }
                type="button"
                onClick={() => {
                  setProductType(
                    item.value,
                  );

                  setSelectedOptions(
                    [],
                  );

                  setSearchClassifications(
                    [],
                  );

                  setInstallationMethods(
                    [],
                  );

                  setLocType(
                    "",
                  );

                  setOptionsAreVariants(
                    false,
                  );

                  setVariantValues(
                    {},
                  );
                }}
                style={{
                  textAlign:
                    "left",

                  padding:
                    "13px",

                  borderRadius:
                    "11px",

                  cursor:
                    "pointer",

                  border:
                    productType ===
                    item.value
                      ? "2px solid #4B1678"
                      : "1px solid #ded3e5",

                  background:
                    productType ===
                    item.value
                      ? "#f7f0fb"
                      : "#ffffff",
                }}
              >
                <strong
                  style={{
                    color:
                      "#4B1678",
                  }}
                >
                  {
                    item.label
                  }
                </strong>

                <div
                  style={{
                    marginTop:
                      "4px",

                    fontSize:
                      "10px",

                    color:
                      "#7d7480",
                  }}
                >
                  {
                    item.description
                  }
                </div>
              </button>
            ),
          )}
        </div>
      </div>

      {productType && (
        <>
          {/* MATERIAL + COLOR */}

          <div
            style={
              sectionStyle
            }
          >
            <h2
              style={
                headingStyle
              }
            >
              Material & Color
            </h2>

            <div
              style={
                gridTwo
              }
            >
              <div>
                <label
                  style={
                    labelStyle
                  }
                >
                  Material *
                </label>

                <select
                  value={
                    material
                  }
                  onChange={(
                    event,
                  ) =>
                    setMaterial(
                      event
                        .target
                        .value,
                    )
                  }
                  style={
                    fieldStyle
                  }
                >
                  <option value="">
                    Select material
                  </option>

                  {materials.map(
                    (
                      item,
                    ) => (
                      <option
                        key={
                          item
                        }
                      >
                        {item}
                      </option>
                    ),
                  )}
                </select>

                {material ===
                  "Other" && (
                  <input
                    value={
                      customMaterial
                    }
                    onChange={(
                      event,
                    ) =>
                      setCustomMaterial(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Type material"
                    style={{
                      ...fieldStyle,
                      marginTop:
                        "8px",
                    }}
                  />
                )}
              </div>

              <div>
                <label
                  style={
                    labelStyle
                  }
                >
                  Color *
                </label>

                <div
                  style={{
                    display:
                      "flex",

                    gap:
                      "7px",

                    alignItems:
                      "flex-start",
                  }}
                >
                  <select
                    value={
                      color
                    }
                    onChange={(
                      event,
                    ) =>
                      setColor(
                        event
                          .target
                          .value,
                      )
                    }
                    style={
                      fieldStyle
                    }
                  >
                    {colors.map(
                      (
                        item,
                      ) => (
                        <option
                          key={
                            item
                          }
                        >
                          {item}
                        </option>
                      ),
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={
                      addSelectedColor
                    }
                    style={{
                      ...secondaryButton,

                      whiteSpace:
                        "nowrap",
                    }}
                  >
                    + Add Color
                  </button>
                </div>

                {color ===
                  "Other / Custom" && (
                  <input
                    value={
                      customColor
                    }
                    onChange={(
                      event,
                    ) =>
                      setCustomColor(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Example: Champagne Blonde"
                    style={{
                      ...fieldStyle,
                      marginTop:
                        "8px",
                    }}
                  />
                )}

                <div
                  style={{
                    display:
                      "flex",

                    gap:
                      "7px",

                    flexWrap:
                      "wrap",

                    marginTop:
                      "9px",
                  }}
                >
                  {selectedColors.map(
                    (
                      colorValue,
                    ) => (
                      <button
                        key={
                          colorValue
                        }
                        type="button"
                        onClick={() =>
                          removeSelectedColor(
                            colorValue,
                          )
                        }
                        title={
                          selectedColors.length >
                          1
                            ? "Remove color"
                            : "At least one color is required"
                        }
                        style={{
                          border:
                            "1px solid #4B1678",

                          background:
                            "#f7f0fb",

                          color:
                            "#4B1678",

                          borderRadius:
                            "20px",

                          padding:
                            "6px 9px",

                          fontWeight:
                            "800",

                          fontSize:
                            "11px",

                          cursor:
                            selectedColors.length >
                            1
                              ? "pointer"
                              : "default",
                        }}
                      >
                        ✓ {colorValue}
                        {selectedColors.length >
                        1
                          ? " ×"
                          : ""}
                      </button>
                    ),
                  )}
                </div>

                {selectedColors.length >
                  1 && (
                  <div
                    style={{
                      marginTop:
                        "6px",

                      color:
                        "#817787",

                      fontSize:
                        "10px",
                    }}
                  >
                    Multiple colors will create separate Shopify variants.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* OPTIONS */}

          <div
            style={
              sectionStyle
            }
          >
            <h2
              style={
                headingStyle
              }
            >
              Product Options
            </h2>

            <div
              style={{
                color:
                  "#7d7480",

                fontSize:
                  "10px",

                lineHeight:
                  1.5,

                marginTop:
                  "-7px",

                marginBottom:
                  "12px",
              }}
            >
              Select every option that applies. These details help HairGrab categorize the product and improve matching in shopper search and filters.
            </div>

            <div
              style={{
                display:
                  "flex",

                flexWrap:
                  "wrap",

                gap:
                  "8px",
              }}
            >
              {currentOptions.map(
                (
                  item,
                ) => (
                  <ChoiceButton
                    key={
                      item.value
                    }
                    label={
                      item.label
                    }
                    selected={
                      selectedOptions.includes(
                        item.value,
                      )
                    }
                    onClick={() =>
                      setSelectedOptions(
                        (current) => {
                          if (
                            productType ===
                              "BUNDLE" &&
                            item.value ===
                              "BUNDLE_DEAL"
                          ) {
                            return current.includes(
                              "BUNDLE_DEAL",
                            )
                              ? []
                              : [
                                  "BUNDLE_DEAL",
                                ];
                          }

                          if (
                            productType ===
                              "BUNDLE" &&
                            current.includes(
                              "BUNDLE_DEAL",
                            )
                          ) {
                            return [
                              item.value,
                            ];
                          }

                          return toggleValue(
                            current,
                            item.value,
                          );
                        },
                      )
                    }
                  />
                ),
              )}
            </div>

            {currentClassifications.length >
              0 && (
              <div
                style={{
                  marginTop:
                    "18px",

                  paddingTop:
                    "16px",

                  borderTop:
                    "1px solid #eee7f2",
                }}
              >
                <div
                  style={{
                    color:
                      "#4B1678",

                    fontSize:
                      "13px",

                    fontWeight:
                      "800",

                    marginBottom:
                      "5px",
                  }}
                >
                  Search & Product Classification
                </div>

                <div
                  style={{
                    color:
                      "#7d7480",

                    fontSize:
                      "10px",

                    lineHeight:
                      1.5,

                    marginBottom:
                      "10px",
                  }}
                >
                  Optional. Choose Locs only when this product is a loc product. It stays one product and does not create extra variants.
                </div>

                <div
                  style={{
                    display:
                      "flex",

                    flexWrap:
                      "wrap",

                    gap:
                      "8px",
                  }}
                >
                  {currentClassifications.map(
                    (
                      item,
                    ) => (
                      <ChoiceButton
                        key={
                          item.value
                        }
                        label={
                          item.label
                        }
                        selected={
                          searchClassifications.includes(
                            item.value,
                          )
                        }
                        onClick={() =>
                          setSearchClassifications(
                            (
                              current,
                            ) =>
                              toggleValue(
                                current,
                                item.value,
                              ),
                          )
                        }
                      />
                    ),
                  )}
                </div>
              </div>
            )}


            {productType === "BRAIDING_HAIR" &&
              searchClassifications.includes("LOCS") && (
              <div
                style={{
                  marginTop: "18px",
                  paddingTop: "16px",
                  borderTop: "1px solid #eee7f2",
                }}
              >
                <div
                  style={{
                    color: "#4B1678",
                    fontSize: "13px",
                    fontWeight: "800",
                    marginBottom: "5px",
                  }}
                >
                  Loc Type
                </div>

                <div
                  style={{
                    color: "#7d7480",
                    fontSize: "10px",
                    lineHeight: 1.5,
                    marginBottom: "10px",
                  }}
                >
                  Tap the closest style. One tap only — this helps shoppers search for the exact loc style without creating another product or variant.
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  {locTypeChoices.map((item) => (
                    <ChoiceButton
                      key={item.value}
                      label={item.label}
                      selected={locType === item.value}
                      onClick={() =>
                        setLocType(
                          locType === item.value
                            ? ""
                            : item.value,
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            )}


            {productType ===
              "BRAIDING_HAIR" && (
              <div
                style={{
                  marginTop:
                    "18px",

                  paddingTop:
                    "16px",

                  borderTop:
                    "1px solid #eee7f2",
                }}
              >
                <div
                  style={{
                    color:
                      "#4B1678",

                    fontSize:
                      "13px",

                    fontWeight:
                      "800",

                    marginBottom:
                      "5px",
                  }}
                >
                  Installation
                </div>

                <div
                  style={{
                    color:
                      "#7d7480",

                    fontSize:
                      "10px",

                    lineHeight:
                      1.5,

                    marginBottom:
                      "10px",
                  }}
                >
                  Optional. Tap Crochet or Pre-Looped only when it applies. These help shoppers find the product and never create extra variants.
                </div>

                <div
                  style={{
                    display:
                      "flex",

                    flexWrap:
                      "wrap",

                    gap:
                      "8px",
                  }}
                >
                  {installationMethodChoices.map(
                    (item) => (
                      <ChoiceButton
                        key={
                          item.value
                        }
                        label={
                          item.label
                        }
                        selected={
                          installationMethods.includes(
                            item.value,
                          )
                        }
                        onClick={() =>
                          setInstallationMethods(
                            (current) =>
                              toggleValue(
                                current,
                                item.value,
                              ),
                          )
                        }
                      />
                    ),
                  )}
                </div>
              </div>
            )}


            {selectedOptions.length >
              1 && (
              <div
                style={{
                  display:
                    "block",

                  marginTop:
                    "15px",

                  padding:
                    "12px",

                  background:
                    "#f2eafa",

                  border:
                    "1px solid #e2d1ef",

                  borderRadius:
                    "10px",

                  color:
                    "#4B1678",

                  fontSize:
                    "12px",

                  fontWeight:
                    "800",
                }}
              >
                ✓ Separate variant pricing is on for the options you selected.
              </div>
            )}
          </div>
        </>
      )}

      {/* HAIR DETAILS */}

      {isHair && (
        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            Hair Details
          </h2>

          <div
            style={{
              color:
                "#7d7480",

              fontSize:
                "10px",

              lineHeight:
                1.5,

              marginTop:
                "-7px",

              marginBottom:
                "13px",
            }}
          >
            Complete every detail that applies. Texture, length, lace, density and other attributes help your product appear when shoppers narrow or search the HairGrab catalog.
          </div>

          <label
            style={
              labelStyle
            }
          >
            Texture
          </label>

          <select
            value={
              texture
            }
            onChange={(
              event,
            ) =>
              setTexture(
                event.target
                  .value,
              )
            }
            style={{
              ...fieldStyle,
              maxWidth:
                "420px",
            }}
          >
            <option value="">
              Select texture
            </option>

            {textures.map(
              (
                item,
              ) => (
                <option
                  key={
                    item
                  }
                >
                  {item}
                </option>
              ),
            )}
          </select>

          <div
            style={{
              marginTop:
                "18px",
            }}
          >
            <label
              style={
                labelStyle
              }
            >
              Available Lengths
            </label>

            <div
              style={{
                display:
                  "flex",

                gap:
                  "7px",

                flexWrap:
                  "wrap",
              }}
            >
              {allLengths.map(
                (
                  length,
                ) => (
                  <button
                    key={
                      length
                    }
                    type="button"
                    onClick={() =>
                      setSelectedLengths(
                        (
                          current,
                        ) =>
                          toggleValue(
                            current,
                            length,
                          ),
                      )
                    }
                    style={{
                      padding:
                        "8px 10px",

                      borderRadius:
                        "8px",

                      fontWeight:
                        "800",

                      cursor:
                        "pointer",

                      color:
                        "#4B1678",

                      border:
                        selectedLengths.includes(
                          length,
                        )
                          ? "2px solid #4B1678"
                          : "1px solid #d8cce0",

                      background:
                        selectedLengths.includes(
                          length,
                        )
                          ? "#f7f0fb"
                          : "#fff",
                    }}
                  >
                    {length}"
                  </button>
                ),
              )}
            </div>

            <div
              style={{
                display:
                  "flex",

                gap:
                  "8px",

                marginTop:
                  "10px",

                flexWrap:
                  "wrap",
              }}
            >
              <input
                value={
                  customLength
                }
                onChange={(
                  event,
                ) =>
                  setCustomLength(
                    event.target
                      .value,
                  )
                }
                placeholder="Other length, e.g. 42"
                style={{
                  ...fieldStyle,
                  maxWidth:
                    "220px",
                }}
              />

              <button
                type="button"
                onClick={
                  addCustomLength
                }
                style={
                  secondaryButton
                }
              >
                + Add Other Length
              </button>
            </div>
          </div>

          {productType ===
            "WIG" && (
            <details
              style={{
                marginTop:
                  "18px",
              }}
            >
              <summary
                style={{
                  color:
                    "#4B1678",

                  fontWeight:
                    "800",

                  cursor:
                    "pointer",
                }}
              >
                Additional wig details — recommended
              </summary>

              <div
                style={{
                  marginTop:
                    "9px",

                  color:
                    "#7d7480",

                  fontSize:
                    "10px",

                  lineHeight:
                    1.5,
                }}
              >
                Fill in everything that applies to maximize search and filter visibility. Leave a field blank only when it truly does not apply to this wig.
              </div>

              <div
                style={{
                  ...gridTwo,
                  marginTop:
                    "14px",
                }}
              >
                <SimpleSelect
                  label="Density"
                  value={
                    density
                  }
                  values={
                    densities
                  }
                  onChange={
                    setDensity
                  }
                />

                <SimpleSelect
                  label="Lace Size"
                  value={
                    laceSize
                  }
                  values={
                    laceSizes
                  }
                  onChange={
                    setLaceSize
                  }
                />

                <SimpleSelect
                  label="Lace Type"
                  value={
                    laceType
                  }
                  values={
                    laceTypes
                  }
                  onChange={
                    setLaceType
                  }
                />

                <SimpleSelect
                  label="Cap Size"
                  value={
                    capSize
                  }
                  values={[
                    "Small",
                    "Medium",
                    "Large",
                    "Adjustable",
                  ]}
                  onChange={
                    setCapSize
                  }
                />
              </div>
            </details>
          )}

          {productType ===
            "BUNDLE" && (
            <div
              style={{
                marginTop:
                  "18px",

                maxWidth:
                  "300px",
              }}
            >
              <SimpleSelect
                label="Bundle Weight"
                value={
                  bundleWeight
                }
                values={[
                  "50g",
                  "100g",
                  "120g",
                  "150g",
                  "200g+",
                ]}
                onChange={
                  setBundleWeight
                }
              />
            </div>
          )}
        </div>
      )}

      {/* VARIANTS */}

      {productType && (
        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            Price & Inventory
          </h2>

          {isHair &&
            selectedLengths.length ===
              0 && (
              <div
                style={{
                  padding:
                    "11px",

                  background:
                    "#fff9e9",

                  borderRadius:
                    "9px",

                  color:
                    "#755f1d",

                  fontSize:
                    "11px",
                }}
              >
                Select at least
                one length above.
              </div>
            )}

          {isBundleDeal &&
            selectedLengths.length > 0 && (
              <div
                style={{
                  marginBottom: "12px",
                  padding: "12px",
                  border: "1px solid #e2d1ef",
                  borderRadius: "10px",
                  background: "#f7f0fb",
                  color: "#4B1678",
                  fontSize: "11px",
                  lineHeight: 1.5,
                  fontWeight: 700,
                }}
              >
                Bundle Deal pricing is one price for the complete set: {selectedLengths.map((length) => `${length}"`).join(" + ")}. Enter the full deal price below.
              </div>
            )}

          {variantRows.length >
            0 && (
            <>
              <div
                style={{
                  marginBottom:
                    "14px",

                  padding:
                    "13px",

                  border:
                    "1px solid #e2d5eb",

                  borderRadius:
                    "10px",

                  background:
                    onSale
                      ? "#fff8e8"
                      : "#fcf9fe",
                }}
              >
                <label
                  style={{
                    display:
                      "flex",

                    gap:
                      "9px",

                    alignItems:
                      "flex-start",

                    cursor:
                      "pointer",

                    color:
                      "#4B1678",

                    fontWeight:
                      "800",

                    fontSize:
                      "12px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      onSale
                    }
                    onChange={(
                      event,
                    ) =>
                      setOnSale(
                        event.target
                          .checked,
                      )
                    }
                    style={{
                      width:
                        "17px",

                      height:
                        "17px",

                      accentColor:
                        "#4B1678",
                    }}
                  />

                  <span>
                    This product is on sale
                    <span
                      style={{
                        display:
                          "block",

                        marginTop:
                          "3px",

                        color:
                          "#756b79",

                        fontSize:
                          "10px",

                        fontWeight:
                          "400",

                        lineHeight:
                          1.45,
                      }}
                    >
                      Turn this on to enter a Sale Price for each variant. HairGrab will send the regular price and sale price to Shopify so the product can appear automatically in On Sale.
                    </span>
                  </span>
                </label>
              </div>

              <div
                style={{
                  overflowX:
                    "auto",
                }}
              >
                <table
                  style={{
                    width:
                      "100%",

                    minWidth:
                      onSale
                        ? "760px"
                        : "620px",

                    borderCollapse:
                      "collapse",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background:
                          "#f7f0fb",
                      }}
                    >
                      <th
                        style={
                          thStyle
                        }
                      >
                        Variant
                      </th>

                      <th
                        style={
                          thStyle
                        }
                      >
                        {onSale
                          ? "Regular Price *"
                          : "Price *"}
                      </th>

                      {onSale && (
                        <th
                          style={
                            thStyle
                          }
                        >
                          Sale Price *
                        </th>
                      )}

                      <th
                        style={
                          thStyle
                        }
                      >
                        Inventory
                      </th>

                      <th
                        style={
                          thStyle
                        }
                      >
                        SKU
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {variantRows.map(
                      (
                        row,
                      ) => {
                        const data =
                          variantValues[
                            row.key
                          ] || {
                            price:
                              "",

                            salePrice:
                              "",

                            inventory:
                              "",

                            sku:
                              "",
                          };

                        return (
                          <tr
                            key={
                              row.key
                            }
                          >
                            <td
                              style={
                                tdStyle
                              }
                            >
                              {
                                row.label
                              }
                            </td>

                            <td
                              style={
                                tdStyle
                              }
                            >
                              <input
                                type="number"
                                step="0.01"
                                value={
                                  data.price
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setVariantField(
                                    row.key,
                                    "price",
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                style={
                                  fieldStyle
                                }
                              />
                            </td>

                            {onSale && (
                              <td
                                style={
                                  tdStyle
                                }
                              >
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={
                                    data.salePrice
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    setVariantField(
                                      row.key,
                                      "salePrice",
                                      event
                                        .target
                                        .value,
                                    )
                                  }
                                  placeholder="Sale price"
                                  style={
                                    fieldStyle
                                  }
                                />
                              </td>
                            )}

                            <td
                              style={
                                tdStyle
                              }
                            >
                              <input
                                type="number"
                                value={
                                  data.inventory
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setVariantField(
                                    row.key,
                                    "inventory",
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                style={
                                  fieldStyle
                                }
                              />
                            </td>

                            <td
                              style={
                                tdStyle
                              }
                            >
                              <input
                                value={
                                  data.sku
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setVariantField(
                                    row.key,
                                    "sku",
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                placeholder="Optional"
                                style={
                                  fieldStyle
                                }
                              />
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* SHIPPING & FULFILLMENT */}

      {productType && (
        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            Shipping & Fulfillment
          </h2>

          <p
            style={{
              margin:
                "-5px 0 16px",

              color:
                "#776e7b",

              fontSize:
                "11px",

              lineHeight:
                "1.5",
            }}
          >
            Tell shoppers what they will pay for standard shipping and how quickly you normally hand the order to the carrier. HairGrab fills your seller city and state automatically.
          </p>

          <div
            style={{
              padding:
                "14px",

              border:
                "1px solid #e2d5eb",

              borderRadius:
                "11px",

              background:
                "#fcf9fe",

              marginBottom:
                "16px",
            }}
          >
            <div
              style={{
                fontWeight:
                  "800",

                color:
                  "#4B1678",

                fontSize:
                  "13px",

                marginBottom:
                  "10px",
              }}
            >
              Customer Shipping Charge *
            </div>

            <select
              value={
                shippingMethod
              }
              onChange={(
                event,
              ) => {
                const value =
                  event.target
                    .value;

                setShippingMethod(
                  value,
                );

                if (
                  value !==
                  "Flat Rate Shipping"
                ) {
                  setFlatRateShipping(
                    "",
                  );
                }
              }}
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

            {shippingMethod ===
              "Free Shipping" && (
              <div
                style={{
                  marginTop:
                    "8px",

                  color:
                    "#6f6675",

                  fontSize:
                    "10px",

                  lineHeight:
                    "1.45",
                }}
              >
                The shopper pays $0 for standard shipping. You are responsible for the cost of the shipping label.
              </div>
            )}

            {shippingMethod ===
              "Flat Rate Shipping" && (
              <div
                style={{
                  marginTop:
                    "12px",

                  maxWidth:
                    "280px",
                }}
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  Customer Shipping Charge *
                </label>

                <div
                  style={{
                    display:
                      "flex",

                    alignItems:
                      "center",

                    gap:
                      "7px",
                  }}
                >
                  <span
                    style={{
                      fontWeight:
                        "800",

                      color:
                        "#4B1678",
                    }}
                  >
                    $
                  </span>

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={
                      flatRateShipping
                    }
                    onChange={(
                      event,
                    ) =>
                      setFlatRateShipping(
                        event.target
                          .value,
                      )
                    }
                    placeholder="7.99"
                    style={
                      fieldStyle
                    }
                  />
                </div>

                <div
                  style={{
                    marginTop:
                      "7px",

                    color:
                      "#6f6675",

                    fontSize:
                      "10px",

                    lineHeight:
                      "1.45",
                  }}
                >
                  The shopper will be charged this amount for standard shipping. If the actual label costs more, you are responsible for the difference.
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(210px, 1fr))",

              gap:
                "14px",
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
                value={
                  shipsWithin
                }
                onChange={(
                  event,
                ) =>
                  setShipsWithin(
                    event.target
                      .value,
                  )
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

              <div
                style={{
                  marginTop:
                    "6px",

                  color:
                    "#817787",

                  fontSize:
                    "10px",

                  lineHeight:
                    "1.4",
                }}
              >
                This is your normal processing time before the package is handed to the carrier. Same-day courier delivery is a separate HairGrab feature.
              </div>
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
                value={
                  returnPolicy
                }
                onChange={(
                  event,
                ) =>
                  setReturnPolicy(
                    event.target
                      .value,
                  )
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

              <div
                style={{
                  marginTop:
                    "6px",

                  color:
                    "#817787",

                  fontSize:
                    "10px",

                  lineHeight:
                    "1.4",
                }}
              >
                Return policy is saved with the product, but it will not be shown on the HairGrab product card.
              </div>
            </div>

            <div>
              <label
                style={
                  labelStyle
                }
              >
                Show on HairGrab Map *
              </label>

              <select
                value={
                  showOnMap
                }
                onChange={(
                  event,
                ) =>
                  setShowOnMap(
                    event.target
                      .value,
                  )
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

              <div
                style={{
                  marginTop:
                    "6px",

                  color:
                    "#817787",

                  fontSize:
                    "10px",

                  lineHeight:
                    "1.4",
                }}
              >
                Yes makes this product eligible for HairGrab local/map discovery.
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop:
                "18px",

              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(240px, 1fr))",

              gap:
                "12px",
            }}
          >
            {seller.offersLocalPickup ? (
              <div
                style={{
                  border:
                    "1px solid #e2d5eb",

                  borderRadius:
                    "11px",

                  padding:
                    "13px",

                  background:
                    "#ffffff",
                }}
              >
                <label
                  style={{
                    ...labelStyle,
                    marginBottom:
                      "8px",
                  }}
                >
                  Local Pickup
                </label>

                <select
                  value={
                    localPickupAvailable
                      ? "Yes"
                      : "No"
                  }
                  onChange={(
                    event,
                  ) =>
                    setLocalPickupAvailable(
                      event.target
                        .value ===
                        "Yes",
                    )
                  }
                  style={
                    fieldStyle
                  }
                >
                  <option value="No">
                    Not Available for This Product
                  </option>

                  <option value="Yes">
                    Local Pickup Available
                  </option>
                </select>

                <div
                  style={{
                    marginTop:
                      "6px",

                    color:
                      "#817787",

                    fontSize:
                      "10px",

                    lineHeight:
                      "1.4",
                  }}
                >
                  Local pickup is enabled in your HairGrab store settings.
                </div>
              </div>
            ) : (
              <div
                style={{
                  border:
                    "1px dashed #d8cce0",

                  borderRadius:
                    "11px",

                  padding:
                    "13px",

                  background:
                    "#faf8fb",
                }}
              >
                <div
                  style={{
                    fontWeight:
                      "800",

                    color:
                      "#6f6675",

                    fontSize:
                      "12px",
                  }}
                >
                  Local Pickup
                </div>

                <div
                  style={{
                    marginTop:
                      "5px",

                    color:
                      "#8b828f",

                    fontSize:
                      "10px",

                    lineHeight:
                      "1.4",
                  }}
                >
                  Not enabled for your store. You can turn on Local Pickup in Store Settings before offering it on products.
                </div>
              </div>
            )}

            {seller.offersLocalDelivery && (
              <div
                style={{
                  border:
                    "1px solid #e2d5eb",

                  borderRadius:
                    "11px",

                  padding:
                    "13px",

                  background:
                    "#ffffff",
                }}
              >
                <label
                  style={{
                    ...labelStyle,
                    marginBottom:
                      "8px",
                  }}
                >
                  Seller-Managed Local Delivery
                </label>

                <select
                  value={
                    localDeliveryAvailable
                      ? "Yes"
                      : "No"
                  }
                  onChange={(
                    event,
                  ) =>
                    setLocalDeliveryAvailable(
                      event.target
                        .value ===
                        "Yes",
                    )
                  }
                  style={
                    fieldStyle
                  }
                >
                  <option value="No">
                    Not Available for This Product
                  </option>

                  <option value="Yes">
                    Local Delivery Available
                  </option>
                </select>

                <div
                  style={{
                    marginTop:
                      "6px",

                    color:
                      "#817787",

                    fontSize:
                      "10px",

                    lineHeight:
                      "1.4",
                  }}
                >
                  This is delivery you arrange yourself. It is separate from HairGrab Same-Day Delivery.
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              marginTop:
                "18px",

              padding:
                "16px",

              border:
                "1px solid #d7bfe8",

              borderRadius:
                "12px",

              background:
                "#f7f0fb",
            }}
          >
            <div
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                gap:
                  "8px",

                fontWeight:
                  "900",

                color:
                  "#4B1678",

                fontSize:
                  "14px",
              }}
            >
              <span
                aria-hidden="true"
              >
                ⚡
              </span>
              HairGrab Same-Day Delivery — Coming Soon
            </div>

            <div
              style={{
                marginTop:
                  "8px",

                color:
                  "#5f5367",

                fontSize:
                  "11px",

                lineHeight:
                  "1.55",
              }}
            >
              HairGrab is working to bring DoorDash-style same-day delivery to participating areas. When available, a local delivery driver can pick up eligible orders from the seller and deliver them directly to nearby HairGrab shoppers.
            </div>

            <div
              style={{
                marginTop:
                  "7px",

                color:
                  "#4B1678",

                fontSize:
                  "10px",

                fontWeight:
                  "700",

                lineHeight:
                  "1.45",
              }}
            >
              No action is needed right now. Availability will vary by location, and HairGrab will notify eligible sellers when Same-Day Delivery becomes available in their area.
            </div>
          </div>
        </div>
      )}

      {/* MEDIA */}

      {productType && (
        <div
          style={
            sectionStyle
          }
        >
          <h2
            style={
              headingStyle
            }
          >
            Photos & Videos
          </h2>

          <div
            style={{
              color:
                "#7d7480",
              fontSize:
                "10px",
              lineHeight:
                1.5,
              marginTop:
                "-7px",
              marginBottom:
                "12px",
            }}
          >
            Add your photos once, then arrange them visually. The first image becomes the HairGrab product-card image and the saved order is sent to Shopify.
          </div>

          <div
            style={
              gridTwo
            }
          >
            <UploadBox
              title="Product Photos"
              count={
                images.length
              }
              max={10}
              accept="image/*"
              onChange={
                handleImages
              }
            />

            <UploadBox
              title="Product Videos"
              count={
                videos.length
              }
              max={3}
              accept="video/*"
              onChange={
                handleVideos
              }
            />
          </div>

          {images.length >
            0 && (
            <ImageFileGrid
              files={
                images
              }
              onRemove={(
                index,
              ) =>
                setImages(
                  (current) =>
                    current.filter(
                      (_, i) =>
                        i !==
                        index,
                    ),
                )
              }
              onMove={(
                fromIndex,
                toIndex,
              ) =>
                setImages(
                  (current) => {
                    if (
                      fromIndex ===
                        toIndex ||
                      fromIndex < 0 ||
                      toIndex < 0 ||
                      fromIndex >=
                        current.length ||
                      toIndex >=
                        current.length
                    ) {
                      return current;
                    }

                    const next =
                      [...current];

                    const [moved] =
                      next.splice(
                        fromIndex,
                        1,
                      );

                    next.splice(
                      toIndex,
                      0,
                      moved,
                    );

                    return next;
                  },
                )
              }
            />
          )}

          {videos.length >
            0 && (
            <FileList
              title="Videos"
              files={
                videos
              }
              onRemove={(
                index,
              ) =>
                setVideos(
                  (
                    current,
                  ) =>
                    current.filter(
                      (
                        _,
                        i,
                      ) =>
                        i !==
                        index,
                    ),
                )
              }
            />
          )}
        </div>
      )}

      <div
        style={
          sectionStyle
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, .65fr) minmax(0, 1fr)",
            gap: "10px",
          }}
        >
          <button
            type="button"
            disabled={
              saving ||
              !productType ||
              !title.trim()
            }
            onClick={() =>
              saveProduct(true)
            }
            style={{
              ...secondaryButton,
              opacity:
                !productType ||
                !title.trim()
                  ? 0.45
                  : 1,
              cursor:
                !productType ||
                !title.trim()
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {saving
              ? "Saving..."
              : "Save Draft"}
          </button>

          <button
          type="button"
          disabled={
            !ready
          }
          onClick={() =>
            setReviewing(
              true,
            )
          }
          style={{
            ...primaryButton,

            width:
              "100%",

            opacity:
              ready
                ? 1
                : 0.45,

            cursor:
              ready
                ? "pointer"
                : "not-allowed",
          }}
        >
          Review Product
        </button>
        </div>
      </div>
      </>)}
    </PageShell>
  );
}


// ==========================================================
// UI HELPERS
// ==========================================================

const gridTwo = {
  display:
    "grid",

  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",

  gap:
    "14px",
};

const primaryButton = {
  border:
    "none",

  background:
    "#4B1678",

  color:
    "#ffffff",

  borderRadius:
    "9px",

  padding:
    "11px 15px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

const secondaryButton = {
  border:
    "1px solid #4B1678",

  background:
    "#ffffff",

  color:
    "#4B1678",

  borderRadius:
    "9px",

  padding:
    "11px 15px",

  fontWeight:
    "800",

  cursor:
    "pointer",
};

function PageShell({
  children,
}: {
  children:
    React.ReactNode;
}) {
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
        <div
          style={{
            marginBottom:
              "12px",
          }}
        >
          <a
            href="/seller"
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
            ← Back to Dashboard
          </a>
        </div>

        <div
          style={{
            textAlign:
              "center",

            marginBottom:
              "18px",
          }}
        >
          <img
            src="/hairgrab-logo.png"
            alt="HairGrab"
            style={{
              width:
                "235px",

              maxWidth:
                "70%",
            }}
          />
        </div>

        <div
          style={{
            background:
              "#ffffff",

            border:
              "1px solid #e6d9ef",

            borderRadius:
              "18px",

            padding:
              "26px",

            boxShadow:
              "0 4px 18px rgba(75,22,120,.07)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SimpleSelect({
  label,
  value,
  values,
  onChange,
}: {
  label:
    string;

  value:
    string;

  values:
    string[];

  onChange:
    (
      value:
        string,
    ) => void;
}) {
  return (
    <div>
      <label
        style={
          labelStyle
        }
      >
        {label}
      </label>

      <select
        value={
          value
        }
        onChange={(
          event,
        ) =>
          onChange(
            event.target
              .value,
          )
        }
        style={
          fieldStyle
        }
      >
        <option value="">
          Select
        </option>

        {values.map(
          (
            item,
          ) => (
            <option
              key={
                item
              }
            >
              {item}
            </option>
          ),
        )}
      </select>
    </div>
  );
}

function QuickFill({
  label,
  value,
  onChange,
  onFill,
}: {
  label:
    string;

  value:
    string;

  onChange:
    (
      value:
        string,
    ) => void;

  onFill:
    () => void;
}) {
  return (
    <div>
      <label
        style={
          labelStyle
        }
      >
        {label}
      </label>

      <div
        style={{
          display:
            "flex",

          gap:
            "6px",
        }}
      >
        <input
          type="number"
          value={
            value
          }
          onChange={(
            event,
          ) =>
            onChange(
              event.target
                .value,
            )
          }
          style={
            fieldStyle
          }
        />

        <button
          type="button"
          onClick={
            onFill
          }
          style={
            secondaryButton
          }
        >
          Fill All
        </button>
      </div>
    </div>
  );
}

function UploadBox({
  title,
  count,
  max,
  accept,
  onChange,
}: {
  title:
    string;

  count:
    number;

  max:
    number;

  accept:
    string;

  onChange:
    (
      event:
        ChangeEvent<HTMLInputElement>,
    ) => void;
}) {
  return (
    <div
      style={{
        border:
          "1px solid #ded3e5",

        borderRadius:
          "12px",

        padding:
          "15px",
      }}
    >
      <div
        style={{
          display:
            "flex",

          justifyContent:
            "space-between",

          marginBottom:
            "10px",
        }}
      >
        <strong
          style={{
            color:
              "#4B1678",
          }}
        >
          {title}
        </strong>

        <span>
          {count}/{max}
        </span>
      </div>

      <label
        style={{
          display:
            "block",

          border:
            "1px dashed #bdaac9",

          borderRadius:
            "9px",

          padding:
            "13px",

          textAlign:
            "center",

          color:
            "#4B1678",

          fontWeight:
            "800",

          cursor:
            "pointer",
        }}
      >
        + Add Files

        <input
          type="file"
          multiple
          accept={
            accept
          }
          onChange={
            onChange
          }
          style={{
            display:
              "none",
          }}
        />
      </label>
    </div>
  );
}

function ImageFileGrid({
  files,
  onRemove,
  onMove,
}: {
  files:
    File[];

  onRemove:
    (
      index:
        number,
    ) => void;

  onMove:
    (
      fromIndex:
        number,
      toIndex:
        number,
    ) => void;
}) {
  const [
    draggingIndex,
    setDraggingIndex,
  ] =
    useState<number | null>(
      null,
    );

  const previewUrls =
    useMemo(
      () =>
        files.map(
          (file) =>
            URL.createObjectURL(
              file,
            ),
        ),
      [files],
    );

  useEffect(
    () => () => {
      for (
        const url of
        previewUrls
      ) {
        URL.revokeObjectURL(
          url,
        );
      }
    },
    [previewUrls],
  );

  return (
    <div
      style={{
        marginTop:
          "14px",
      }}
    >
      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          gap:
            "12px",
          alignItems:
            "baseline",
          flexWrap:
            "wrap",
          marginBottom:
            "9px",
        }}
      >
        <strong
          style={{
            color:
              "#4B1678",
          }}
        >
          Product Photos
        </strong>

        <span
          style={{
            color:
              "#7d7480",
            fontSize:
              "10px",
          }}
        >
          First photo = product card image. Drag to reorder or use the arrows.
        </span>
      </div>

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fill, minmax(125px, 1fr))",
          gap:
            "10px",
        }}
      >
        {files.map(
          (
            file,
            index,
          ) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              draggable
              onDragStart={() =>
                setDraggingIndex(
                  index,
                )
              }
              onDragOver={(event) =>
                event.preventDefault()
              }
              onDrop={() => {
                if (
                  draggingIndex !==
                    null
                ) {
                  onMove(
                    draggingIndex,
                    index,
                  );
                }

                setDraggingIndex(
                  null,
                );
              }}
              onDragEnd={() =>
                setDraggingIndex(
                  null,
                )
              }
              style={{
                border:
                  index === 0
                    ? "2px solid #4B1678"
                    : "1px solid #ded3e5",
                borderRadius:
                  "11px",
                overflow:
                  "hidden",
                background:
                  "#ffffff",
                boxShadow:
                  "0 2px 8px rgba(75,22,120,0.06)",
              }}
            >
              <div
                style={{
                  position:
                    "relative",
                  aspectRatio:
                    "1 / 1",
                  background:
                    "#faf7fc",
                }}
              >
                <img
                  src={
                    previewUrls[index]
                  }
                  alt={
                    file.name
                  }
                  style={{
                    width:
                      "100%",
                    height:
                      "100%",
                    objectFit:
                      "cover",
                    display:
                      "block",
                  }}
                />

                {index ===
                  0 && (
                  <div
                    style={{
                      position:
                        "absolute",
                      left:
                        "7px",
                      top:
                        "7px",
                      background:
                        "#4B1678",
                      color:
                        "#ffffff",
                      borderRadius:
                        "999px",
                      padding:
                        "4px 7px",
                      fontSize:
                        "9px",
                      fontWeight:
                        "800",
                    }}
                  >
                    Primary
                  </div>
                )}
              </div>

              <div
                style={{
                  padding:
                    "8px",
                }}
              >
                <div
                  title={
                    file.name
                  }
                  style={{
                    overflow:
                      "hidden",
                    textOverflow:
                      "ellipsis",
                    whiteSpace:
                      "nowrap",
                    color:
                      "#35263e",
                    fontSize:
                      "10px",
                    marginBottom:
                      "7px",
                  }}
                >
                  {file.name}
                </div>

                {index > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onMove(
                        index,
                        0,
                      )
                    }
                    style={{
                      width:
                        "100%",
                      border:
                        "1px solid #d8cce0",
                      background:
                        "#f7f0fb",
                      color:
                        "#4B1678",
                      borderRadius:
                        "7px",
                      padding:
                        "6px",
                      fontSize:
                        "10px",
                      fontWeight:
                        "800",
                      cursor:
                        "pointer",
                      marginBottom:
                        "6px",
                    }}
                  >
                    Make Primary
                  </button>
                )}

                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "1fr 1fr 1fr",
                    gap:
                      "5px",
                  }}
                >
                  <button
                    type="button"
                    disabled={
                      index === 0
                    }
                    onClick={() =>
                      onMove(
                        index,
                        index - 1,
                      )
                    }
                    aria-label="Move photo left"
                    style={{
                      border:
                        "1px solid #ded3e5",
                      background:
                        "#ffffff",
                      borderRadius:
                        "7px",
                      padding:
                        "6px",
                      cursor:
                        index === 0
                          ? "default"
                          : "pointer",
                      opacity:
                        index === 0
                          ? 0.4
                          : 1,
                    }}
                  >
                    ←
                  </button>

                  <button
                    type="button"
                    disabled={
                      index ===
                      files.length -
                        1
                    }
                    onClick={() =>
                      onMove(
                        index,
                        index + 1,
                      )
                    }
                    aria-label="Move photo right"
                    style={{
                      border:
                        "1px solid #ded3e5",
                      background:
                        "#ffffff",
                      borderRadius:
                        "7px",
                      padding:
                        "6px",
                      cursor:
                        index ===
                        files.length -
                          1
                          ? "default"
                          : "pointer",
                      opacity:
                        index ===
                        files.length -
                          1
                          ? 0.4
                          : 1,
                    }}
                  >
                    →
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onRemove(
                        index,
                      )
                    }
                    aria-label="Remove photo"
                    style={{
                      border:
                        "1px solid #ead9e0",
                      background:
                        "#ffffff",
                      borderRadius:
                        "7px",
                      padding:
                        "6px",
                      cursor:
                        "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function FileList({
  title,
  files,
  onRemove,
}: {
  title:
    string;

  files:
    File[];

  onRemove:
    (
      index:
        number,
    ) => void;
}) {
  const previewUrls =
    useMemo(
      () =>
        files.map(
          (file) =>
            URL.createObjectURL(
              file,
            ),
        ),
      [files],
    );

  useEffect(
    () => () => {
      for (
        const url of
        previewUrls
      ) {
        URL.revokeObjectURL(
          url,
        );
      }
    },
    [previewUrls],
  );

  return (
    <div
      style={{
        marginTop:
          "14px",
      }}
    >
      <strong
        style={{
          color:
            "#4B1678",
        }}
      >
        {title}
      </strong>

      <div
        style={{
          display:
            "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",

          gap:
            "10px",

          marginTop:
            "8px",
        }}
      >
        {files.map(
          (
            file,
            index,
          ) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              style={{
                border:
                  "1px solid #e4d8eb",

                borderRadius:
                  "10px",

                overflow:
                  "hidden",

                background:
                  "#faf7fc",
              }}
            >
              <video
                src={
                  previewUrls[index]
                }
                controls
                preload="metadata"
                playsInline
                style={{
                  display:
                    "block",

                  width:
                    "100%",

                  aspectRatio:
                    "16 / 9",

                  objectFit:
                    "contain",

                  background:
                    "#140c18",
                }}
              />

              <div
                style={{
                  display:
                    "flex",

                  justifyContent:
                    "space-between",

                  alignItems:
                    "center",

                  gap:
                    "8px",

                  padding:
                    "9px",
                }}
              >
                <div
                  style={{
                    minWidth:
                      0,
                  }}
                >
                  <div
                    style={{
                      color:
                        "#4B1678",

                      fontSize:
                        "10px",

                      fontWeight:
                        "800",

                      overflow:
                        "hidden",

                      textOverflow:
                        "ellipsis",

                      whiteSpace:
                        "nowrap",
                    }}
                    title={
                      file.name
                    }
                  >
                    {file.name}
                  </div>

                  <div
                    style={{
                      marginTop:
                        "2px",

                      color:
                        "#7d7480",

                      fontSize:
                        "9px",
                    }}
                  >
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                    {" · "}
                    Ready to upload
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onRemove(
                      index,
                    )
                  }
                  aria-label={`Remove ${file.name}`}
                  style={{
                    border:
                      "1px solid #dacbe2",

                    background:
                      "#ffffff",

                    color:
                      "#4B1678",

                    borderRadius:
                      "7px",

                    padding:
                      "6px 9px",

                    fontWeight:
                      "800",

                    cursor:
                      "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <div
        style={{
          marginTop:
            "7px",

          color:
            "#6f6575",

          fontSize:
            "9px",

          lineHeight:
            1.45,
        }}
      >
        If the video plays here, HairGrab has the file selected and it will be included when you save the product.
      </div>
    </div>
  );
}


function ReviewMediaPreview({
  images,
  videos,
}: {
  images:
    File[];
  videos:
    File[];
}) {
  const imageUrls =
    useMemo(
      () =>
        images.map(
          (file) =>
            URL.createObjectURL(
              file,
            ),
        ),
      [images],
    );

  const videoUrls =
    useMemo(
      () =>
        videos.map(
          (file) =>
            URL.createObjectURL(
              file,
            ),
        ),
      [videos],
    );

  useEffect(
    () => () => {
      for (
        const url of
        [
          ...imageUrls,
          ...videoUrls,
        ]
      ) {
        URL.revokeObjectURL(
          url,
        );
      }
    },
    [
      imageUrls,
      videoUrls,
    ],
  );

  return (
    <div>
      {images.length > 0 && (
        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(110px, 1fr))",

            gap:
              "8px",
          }}
        >
          {images.map(
            (
              file,
              index,
            ) => (
              <div
                key={`review-image-${file.name}-${index}`}
                style={{
                  border:
                    "1px solid #eadff0",

                  borderRadius:
                    "9px",

                  overflow:
                    "hidden",

                  background:
                    "#faf7fc",
                }}
              >
                <img
                  src={
                    imageUrls[index]
                  }
                  alt={
                    file.name
                  }
                  style={{
                    display:
                      "block",

                    width:
                      "100%",

                    aspectRatio:
                      "1 / 1",

                    objectFit:
                      "cover",
                  }}
                />
              </div>
            ),
          )}
        </div>
      )}

      {videos.length > 0 && (
        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",

            gap:
              "10px",

            marginTop:
              images.length > 0
                ? "12px"
                : "0",
          }}
        >
          {videos.map(
            (
              file,
              index,
            ) => (
              <div
                key={`review-video-${file.name}-${index}`}
                style={{
                  border:
                    "1px solid #eadff0",

                  borderRadius:
                    "9px",

                  overflow:
                    "hidden",

                  background:
                    "#faf7fc",
                }}
              >
                <video
                  src={
                    videoUrls[index]
                  }
                  controls
                  preload="metadata"
                  playsInline
                  style={{
                    display:
                      "block",

                    width:
                      "100%",

                    aspectRatio:
                      "16 / 9",

                    objectFit:
                      "contain",

                    background:
                      "#140c18",
                  }}
                />

                <div
                  style={{
                    padding:
                      "7px 9px",

                    color:
                      "#4B1678",

                    fontSize:
                      "9px",

                    fontWeight:
                      "800",

                    overflow:
                      "hidden",

                    textOverflow:
                      "ellipsis",

                    whiteSpace:
                      "nowrap",
                  }}
                  title={
                    file.name
                  }
                >
                  {file.name}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ReviewGrid({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <div
      style={{
        display:
          "grid",

        gridTemplateColumns:
          "repeat(auto-fit, minmax(160px, 1fr))",

        gap:
          "14px",
      }}
    >
      {children}
    </div>
  );
}

function ReviewValue({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div>
      <div
        style={{
          color:
            "#817787",

          fontSize:
            "10px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontWeight:
            "800",

          marginTop:
            "3px",
        }}
      >
        {value}
      </div>
    </div>
  );
}