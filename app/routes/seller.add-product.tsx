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

  variants: Array<{
    label: string;
    length: string;
    option: string;
    color: string;
    price: string;
    inventory: string;
    sku: string;
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
      filename: string;
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

      filename:
        file.name,

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
  }: ActionFunctionArgs) => {
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
        return {
          success: false,
          message:
            "At least one product variant is required.",
        };
      }

      for (
        const variant of
        payload.variants
      ) {
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
          imageFiles,
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

      if (
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

          values: [
            {
              name:
                "Standard",
            },
          ],
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

            if (
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
                  "Standard",
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
                  variant.price,
                ),

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
        productTypes.find(
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
          "Product saved successfully as a Shopify draft.",

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
        "CROCHET_HAIR",
      label:
        "Crochet Hair",
    },

    {
      value:
        "LOCS_LOCKS",
      label:
        "Locs / Locks",
    },
  ],
};


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

  const saving =
    saveFetcher.state !==
    "idle";

  const saveResult =
    saveFetcher.data ||
    actionData;

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

  // HairGrab keeps this dumb easy:
  // selecting 2+ product options automatically turns those
  // options into separate variants. No hidden checkbox needed.
  useEffect(
    () => {
      setOptionsAreVariants(
        selectedOptions.length > 1,
      );
    },
    [
      selectedOptions.length,
    ],
  );

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

  const hasPrices =
    variantRows.length >
      0 &&
    variantRows.every(
      (
        row,
      ) =>
        Boolean(
          variantValues[
            row.key
          ]?.price,
        ),
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

  function saveProduct() {
    if (
      !ready ||
      !productType
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
          variantRows.map(
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
                "",

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
                    Price
                  </th>

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
            onClick={
              saveProduct
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
          Products are saved
          to Shopify as DRAFT
          during testing.
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
          value={
            description
          }
          onChange={(
            event,
          ) =>
            setDescription(
              event.target
                .value,
            )
          }
          style={
            fieldStyle
          }
        />
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
                  Select every classification that applies. These are discovery labels, not separate price variants, and help shoppers find specialized products more easily.
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

          {variantRows.length >
            0 && (
            <>
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
                      "620px",

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
                        Price *
                      </th>

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
            <FileList
              title="Photos"
              files={
                images
              }
              onRemove={(
                index,
              ) =>
                setImages(
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

      {files.map(
        (
          file,
          index,
        ) => (
          <div
            key={`${file.name}-${index}`}
            style={{
              display:
                "flex",

              justifyContent:
                "space-between",

              padding:
                "7px 9px",

              marginTop:
                "5px",

              background:
                "#faf7fc",

              borderRadius:
                "7px",
            }}
          >
            <span>
              {index ===
                0 &&
              title ===
                "Photos"
                ? "Primary · "
                : ""}
              {file.name}
            </span>

            <button
              type="button"
              onClick={() =>
                onRemove(
                  index,
                )
              }
              style={{
                border:
                  "none",

                background:
                  "transparent",

                cursor:
                  "pointer",
              }}
            >
              ×
            </button>
          </div>
        ),
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