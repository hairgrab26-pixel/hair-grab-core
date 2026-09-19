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
import { extensionTypeFromOptions, EXTENSION_TYPE_METAFIELD, productTypeToCategoryLabel } from "../product-categories";
import ProductBuilder from "../components/ProductBuilder";
import { productOptions, productClassifications, installationMethodChoices, locTypeChoices } from "../components/ProductBuilder";
import { sellerProductAttributeTags } from "../seller-product-attributes";
import { parseCapTypeValues, parseDensityValues, parseLaceSizeValues, parseLaceTypeValues, parseListMetafield, parseShipsWithinValues } from "../product-attribute-tags";
import { customMetafieldType, ensureRequiredCustomProductMetafieldDefinitions } from "../product-metafield-definitions.server";

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

  density: string | string[];
  laceSize: string | string[];
  laceType: string | string[];
  capSize: string;
  capType: string | string[];
  origin: string;
  weftType: string;
  shipsFromCity: string;
  shipsFromState: string;
  shippingTerritory: string;
  bundleWeight: string;
  pieceCount: string;

  shippingMethod: string;
  flatRateShipping: string;
  localPickupAvailable: boolean;
  localDeliveryAvailable: boolean;
  sameDayDelivery: boolean;
  shipsWithin: string | string[];
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

const SELLER_SESSION_COOKIE = "hairgrab_seller_session";

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
    throw new Error("Seller session secret is not configured.");
  }

  return secret;
}

function signValue(value: string) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function safeEqual(first: string, second: string) {
  try {
    const a = Buffer.from(first, "utf8");
    const b = Buffer.from(second, "utf8");

    if (a.length !== b.length) {
      return false;
    }

    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [cookieName, ...rest] = cookie.trim().split("=");

    if (cookieName === name) {
      return rest.join("=") || null;
    }
  }

  return null;
}

function readSellerSession(request: Request): SellerSessionPayload | null {
  const sessionValue = getCookie(request, SELLER_SESSION_COOKIE);

  if (!sessionValue) {
    return null;
  }

  const parts = sessionValue.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = signValue(encodedPayload);

  if (!safeEqual(suppliedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as SellerSessionPayload;

    if (
      !payload.sellerId ||
      !payload.portalAccountId ||
      !payload.expiresAt ||
      payload.expiresAt < Date.now()
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

async function getSellerFromRequest(request: Request) {
  const session = readSellerSession(request);

  if (!session) {
    return null;
  }

  const portalAccount = await db.sellerPortalAccount.findUnique({
    where: {
      id: session.portalAccountId,
    },
  });

  if (
    !portalAccount ||
    portalAccount.sellerId !== session.sellerId ||
    portalAccount.status !== "ACTIVE"
  ) {
    return null;
  }

  const seller = await db.seller.findUnique({
    where: {
      id: session.sellerId,
    },
    include: {
      approvedApplication: true,
    },
  });

  if (!seller) {
    return null;
  }

  if (
    seller.status === "SUSPENDED" ||
    seller.status === "INACTIVE" ||
    seller.status === "CLOSED"
  ) {
    return null;
  }

  return seller;
}

// ==========================================================
// LOADER
// ==========================================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const seller = await getSellerFromRequest(request);

  if (!seller) {
    return redirect("/seller/login");
  }

  return {
    seller: {
      id: seller.id,
      sellerCode: seller.sellerCode,
      businessName: seller.businessName,
      shopifyVendor: seller.shopifyVendor,
      sellsNationwide: seller.sellsNationwide,
      city: seller.city || seller.approvedApplication?.city || "",
      state: seller.state || seller.approvedApplication?.state || "",
      offersLocalPickup: seller.offersLocalPickup,
      offersLocalDelivery: seller.offersLocalDelivery,
      storeSlug: seller.storeSlug,
      storefrontPublished: seller.storefrontPublished,
    },
  };
};

// ==========================================================
// SHOPIFY HELPERS
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
  constraints: {
    key: string | null;
  } | null;
};

function normalizeMetafieldName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

async function getProductMetafieldDefinitions(admin: any) {
  const response = await admin.graphql(
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
    `
  );

  const json = await response.json();

  if (json?.errors && json.errors.length > 0) {
    throw new Error(
      json.errors
        .map(
          (error: { message?: string }) =>
            error.message ||
            "Unable to read Shopify metafield definitions."
        )
        .join(" | ")
    );
  }

  return (json?.data?.metafieldDefinitions?.nodes || []) as ShopifyMetafieldDefinition[];
}

function definitionIsConstrained(definition: ShopifyMetafieldDefinition) {
  // Category/taxonomy constraints cause metafieldsSet to fail with
  // "Owner subtype does not match the metafield definition's constraints".
  return Boolean(definition.constraints?.key);
}

function findMetafieldDefinition(
  definitions: ShopifyMetafieldDefinition[],
  names: string[]
) {
  const normalizedNames = names.map(normalizeMetafieldName);

  const matches = definitions.filter((definition) =>
    normalizedNames.includes(normalizeMetafieldName(definition.name))
  );

  // Skip category/subtype-constrained definitions so HairGrab does not
  // write a metafield Shopify will reject with
  // "Owner subtype does not match the metafield definition's constraints".
  const unconstrained = matches.filter(
    (definition) => !definitionIsConstrained(definition)
  );

  if (unconstrained.length === 0) {
    return undefined;
  }

  const ranked = [...unconstrained].sort((a, b) => {
    const score = (definition: ShopifyMetafieldDefinition) => {
      let points = 0;
      if (definition.namespace === "custom") points += 20;
      if (!definition.constraints) points += 10;
      if (String(definition.type?.name || "").startsWith("list.")) points += 30;
      return points;
    };
    return score(b) - score(a);
  });

  return ranked[0];
}

function getDefinitionChoices(definition: ShopifyMetafieldDefinition) {
  const choiceValidation = definition.validations.find(
    (validation) => normalizeMetafieldName(validation.name) === "choices"
  );

  if (!choiceValidation?.value) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(choiceValidation.value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const METAFIELD_VALUE_ALIASES: Record<string, string[]> = {
  wig: ["wigs"],
  closurefrontal: ["closuresandfrontals", "closuresfrontals"],
  humanhair: ["100humanhair"],
  humansyntheticblend: ["humanhairblend"],
  freeshipping: ["free", "freeshippingavailable"],
  calculatedatcheckout: ["calculatedshipping", "calculated"],
  localpickup: ["localpickupavailable"],
  localdelivery: ["localdeliveryavailable"],
  true: ["yes"],
  false: ["no"],
  sameday: ["samedaydeliverypickup", "samedaydelivery", "samedaypickup"],
};

function resolveChoiceValue(value: string, choices: string[]) {
  if (choices.length === 0) return value;

  const normalizedValue = normalizeMetafieldName(value);
  const exact = choices.find(
    (choice) => normalizeMetafieldName(choice) === normalizedValue
  );

  if (exact) return exact;

  const aliases = METAFIELD_VALUE_ALIASES[normalizedValue] || [];
  for (const alias of aliases) {
    const matched = choices.find(
      (choice) => normalizeMetafieldName(choice) === alias
    );
    if (matched) return matched;
  }

  const singularPluralMatch = choices.find((choice) => {
    const normalizedChoice = normalizeMetafieldName(choice);
    return (
      normalizedChoice === `${normalizedValue}s` ||
      `${normalizedChoice}s` === normalizedValue
    );
  });

  return singularPluralMatch || null;
}

function prepareMetafieldValue(
  definition: ShopifyMetafieldDefinition,
  value: string | string[] | boolean
) {
  const type = definition.type.name;
  const choices = getDefinitionChoices(definition);

  const rawValues = Array.isArray(value)
    ? value.map(String)
    : [typeof value === "boolean" ? (value ? "true" : "false") : String(value)];

  const resolvedValues = rawValues
    .map((item) => resolveChoiceValue(item, choices))
    .filter((item): item is string => Boolean(item));

  if (choices.length > 0 && resolvedValues.length === 0) {
    return null;
  }

  if (type.startsWith("list.")) {
    return JSON.stringify(resolvedValues);
  }

  if (type === "boolean") {
    return String(Boolean(value));
  }

  if (type.includes("integer") || type.includes("decimal")) {
    return String(resolvedValues[0] ?? rawValues[0]);
  }

  if (Array.isArray(value)) {
    return resolvedValues.join(", ");
  }

  return resolvedValues[0] ?? rawValues[0];
}

function addExistingMetafield({
  definitions,
  output,
  names,
  value,
  fallback,
}: {
  definitions: ShopifyMetafieldDefinition[];
  output: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;
  names: string[];
  value: string | string[] | boolean | null | undefined;
  fallback?: {
    namespace: string;
    key: string;
    type: string;
  };
}) {
  if (value === null || value === undefined) return;
  if (typeof value === "string" && !value.trim()) return;
  if (Array.isArray(value) && value.length === 0) return;

  const seen = new Set<string>();
  let wrote = false;
  for (const name of names) {
    const definition = findMetafieldDefinition(definitions, [name]);
    if (!definition) continue;
    const identity = `${definition.namespace}:${definition.key}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (Array.isArray(value) && !String(definition.type.name || "").startsWith("list.")) {
      continue;
    }
    const preparedValue = prepareMetafieldValue(definition, value);
    if (preparedValue === null) {
      console.warn(
        `[HairGrab Core] Skipping metafield "${definition.name}" because "${String(
          value
        )}" is not one of its allowed Shopify choices.`
      );
      continue;
    }
    output.push({
      namespace: definition.namespace,
      key: definition.key,
      type: definition.type.name,
      value: preparedValue,
    });
    wrote = true;
  }

  if (!wrote && fallback && fallback.namespace !== "shopify") {
    if (typeof value === "boolean") {
      output.push({ ...fallback, value: value ? "true" : "false" });
    } else if (Array.isArray(value) && value.length) {
      output.push({
        ...fallback,
        type: fallback.type.startsWith("list.") ? fallback.type : "list.single_line_text_field",
        value: JSON.stringify(value.map((item) => String(item).trim()).filter(Boolean)),
      });
    } else if (typeof value === "string" && value.trim()) {
      if (fallback.type.startsWith("list.")) {
        output.push({
          ...fallback,
          value: JSON.stringify(parseListMetafield(value.trim())),
        });
      } else {
        output.push({ ...fallback, value: value.trim() });
      }
    }
  }
}

function ensureCustomMetafield(
  output: Array<{ namespace: string; key: string; type: string; value: string }>,
  key: string,
  value: string | null | undefined,
) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return;
  if (output.some((item) => item.namespace === "custom" && item.key === key && String(item.value || "").trim())) return;
  output.push({ namespace: "custom", key, type: "single_line_text_field", value: trimmed });
}

function ensureCustomListMetafield(
  output: Array<{ namespace: string; key: string; type: string; value: string }>,
  key: string,
  values: string | string[] | null | undefined,
  type = "list.single_line_text_field",
) {
  const items = [...new Set(parseListMetafield(values).map((item) => String(item).trim()).filter(Boolean))];
  if (!items.length) return;
  const listType = type.startsWith("list.") ? type : "list.single_line_text_field";
  const value = type.startsWith("list.") ? JSON.stringify(items) : items.join(", ");
  const existing = output.find((item) => item.namespace === "custom" && item.key === key);
  if (existing) {
    existing.type = type.startsWith("list.") ? listType : type;
    existing.value = value;
    return;
  }
  output.push({ namespace: "custom", key, type: type.startsWith("list.") ? listType : type, value });
}

function formatErrors(
  errors: Array<{ field?: string[]; message?: string }> | undefined
) {
  if (!errors || errors.length === 0) return "";
  return errors.map((error) => error.message || "Unknown Shopify error.").join(" | ");
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

  for (const metafield of metafields) {
    try {
      const response = await admin.graphql(
        `#graphql
        mutation HairGrabSetProductMetafield(
          $metafields: [MetafieldsSetInput!]!
        ) {
          metafieldsSet(metafields: $metafields) {
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
                ownerId: productId,
                namespace: metafield.namespace,
                key: metafield.key,
                type: metafield.type,
                value: metafield.value,
              },
            ],
          },
        }
      );

      const json = await response.json();
      const result = json?.data?.metafieldsSet;
      const errors = result?.userErrors || [];

      if (json?.errors?.length || errors.length > 0) {
        skipped.push(`${metafield.namespace}.${metafield.key}`);
        console.warn(
          `[HairGrab Core] Skipping incompatible Shopify metafield ${metafield.namespace}.${metafield.key}:`,
          [...(json.errors || []), ...errors].map((e: { message?: string }) => e.message).join(" | ")
        );
        continue;
      }

      saved.push(`${metafield.namespace}.${metafield.key}`);
    } catch (error) {
      skipped.push(`${metafield.namespace}.${metafield.key}`);
      console.warn(
        `[HairGrab Core] Could not write Shopify metafield ${metafield.namespace}.${metafield.key}:`,
        error
      );
    }
  }

  return { saved, skipped };
}

async function getShopifyAdmin() {
  const offlineSession = await db.session.findFirst({
    where: { isOnline: false },
  });

  if (!offlineSession) {
    throw new Error("HairGrab could not find the Shopify offline session.");
  }

  return unauthenticated.admin(offlineSession.shop);
}

async function getPrimaryLocationId(admin: any) {
  const response = await admin.graphql(`
    #graphql
    query HairGrabPrimaryLocation {
      location {
        id
        name
      }
    }
  `);

  const json = await response.json();
  const locationId = json?.data?.location?.id;

  if (!locationId) {
    throw new Error("Shopify primary inventory location could not be found.");
  }

  return String(locationId);
}

// ==========================================================
// STAGED MEDIA UPLOAD
// ==========================================================

type StagedTarget = {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
};

async function stageFiles(
  admin: any,
  files: File[],
  resource: "PRODUCT_IMAGE" | "VIDEO"
) {
  if (files.length === 0) return [];

  const input = files.map((file) => ({
    filename: file.name,
    mimeType:
      file.type ||
      (resource === "VIDEO" ? "video/mp4" : "image/jpeg"),
    httpMethod: "POST",
    resource,
    ...(resource === "VIDEO" ? { fileSize: String(file.size) } : {}),
  }));

  const response = await admin.graphql(
    `#graphql
    mutation HairGrabStageUploads($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
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
    { variables: { input } }
  );

  const json = await response.json();
  const result = json?.data?.stagedUploadsCreate;
  const errors = formatErrors(result?.userErrors);

  if (errors) {
    throw new Error(`Media staging failed: ${errors}`);
  }

  const targets = (result?.stagedTargets || []) as StagedTarget[];

  const uploaded: Array<{
    originalSource: string;
    contentType: "IMAGE" | "VIDEO";
    alt: string;
  }> = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const target = targets[index];
    const uploadForm = new FormData();

    for (const parameter of target.parameters) {
      uploadForm.append(parameter.name, parameter.value);
    }
    uploadForm.append("file", file, file.name);

    const uploadResponse = await fetch(target.url, {
      method: "POST",
      body: uploadForm,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed for ${file.name}.`);
    }

    uploaded.push({
      originalSource: target.resourceUrl,
      contentType: resource === "VIDEO" ? "VIDEO" : "IMAGE",
      alt: file.name,
    });
  }

  return uploaded;
}

// ==========================================================
// ACTION — SAVE PRODUCT
// ==========================================================

type SavedProductResult = {
  success: true;
  message: string;
  draftSaved: boolean;
  shopifyProductId: string;
  productHandle: string | null;
  sellerProductId: string;
  variantCount: number;
  mediaCount: number;
  metafieldsSaved: number;
  metafieldsSkipped: number;
};

function hairCategoryValue(payload: ProductPayload) {
  return productTypeToCategoryLabel(payload.productType);
}

function collectProductMetafields(
  definitions: ShopifyMetafieldDefinition[],
  payload: ProductPayload,
  seller: { city?: string | null; state?: string | null; sellsNationwide: boolean; approvedApplication?: { city?: string | null; state?: string | null } | null }
) {
  const metafields: Array<{ namespace: string; key: string; type: string; value: string }> = [];
  const selectedLengthValues = [...new Set(payload.variants.map((variant) => variant.length).filter(Boolean))];
  const shipsFromCity = payload.shipsFromCity || seller.city || seller.approvedApplication?.city || "";
  const shipsFromState = payload.shipsFromState || seller.state || seller.approvedApplication?.state || "";
  const shippingTerritory = payload.shippingTerritory || (seller.sellsNationwide ? "Nationwide" : "Local");
  const weftType = payload.weftType || (payload.selectedOptions.includes("NO_WEFT") ? "No Weft" : payload.selectedOptions.includes("WEFT") ? "Weft" : "");

  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Hair Category"],
    value: hairCategoryValue(payload),
    fallback: { namespace: "custom", key: "hair_category", type: "single_line_text_field" },
  });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Hair Type", "Material"],
    value: payload.material,
    fallback: { namespace: "custom", key: "hair_type", type: "single_line_text_field" },
  });
  if (payload.material) {
    addExistingMetafield({
      definitions,
      output: metafields,
      names: ["Material"],
      value: payload.material,
      fallback: { namespace: "custom", key: "material", type: "single_line_text_field" },
    });
  }
  addExistingMetafield({ definitions, output: metafields, names: ["Color"], value: payload.colors, fallback: { namespace: "custom", key: "color", type: "list.single_line_text_field" } });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Texture"],
    value: payload.texture,
    fallback: { namespace: "custom", key: "texture", type: "single_line_text_field" },
  });
  addExistingMetafield({ definitions, output: metafields, names: ["Length"], value: selectedLengthValues, fallback: { namespace: "custom", key: "length", type: "list.single_line_text_field" } });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Origin"],
    value: payload.origin,
    fallback: { namespace: "custom", key: "origin", type: "single_line_text_field" },
  });
  ensureCustomMetafield(metafields, "origin", payload.origin);
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Weft Type"],
    value: weftType,
    fallback: { namespace: "custom", key: "weft_type", type: "single_line_text_field" },
  });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Cap Size"],
    value: payload.capSize,
    fallback: { namespace: "custom", key: "cap_size", type: "single_line_text_field" },
  });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Cap Type"],
    value: parseCapTypeValues(payload.capType),
    fallback: { namespace: "custom", key: "cap_type", type: customMetafieldType(definitions, "cap_type", "list.single_line_text_field") },
  });
  ensureCustomListMetafield(
    metafields,
    "cap_type",
    parseCapTypeValues(payload.capType),
    customMetafieldType(definitions, "cap_type", "list.single_line_text_field"),
  );
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Density"],
    value: parseDensityValues(payload.density),
    fallback: { namespace: "custom", key: "density", type: customMetafieldType(definitions, "density", "list.single_line_text_field") },
  });
  ensureCustomListMetafield(
    metafields,
    "density",
    parseDensityValues(payload.density),
    customMetafieldType(definitions, "density", "list.single_line_text_field"),
  );
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Lace Size"],
    value: parseLaceSizeValues(payload.laceSize),
    fallback: { namespace: "custom", key: "lace_size", type: customMetafieldType(definitions, "lace_size", "list.single_line_text_field") },
  });
  ensureCustomListMetafield(
    metafields,
    "lace_size",
    parseLaceSizeValues(payload.laceSize),
    customMetafieldType(definitions, "lace_size", "list.single_line_text_field"),
  );
  const laceTypeValues = parseLaceTypeValues(payload.laceType);
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Lace Type"],
    value: laceTypeValues,
    fallback: { namespace: "custom", key: "lace_type", type: customMetafieldType(definitions, "lace_type", "list.single_line_text_field") },
  });
  ensureCustomListMetafield(
    metafields,
    "lace_type",
    laceTypeValues,
    customMetafieldType(definitions, "lace_type", "list.single_line_text_field"),
  );
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Same Day Delivery", "Same-Day Delivery"],
    value: Boolean(payload.sameDayDelivery) || parseShipsWithinValues(payload.shipsWithin).some((item) => item.toLowerCase() === "same day"),
    fallback: { namespace: "custom", key: "same_day_delivery", type: "boolean" },
  });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Ships From City"],
    value: shipsFromCity,
    fallback: { namespace: "custom", key: "ships_from_city", type: "single_line_text_field" },
  });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Ships From State"],
    value: shipsFromState,
    fallback: { namespace: "custom", key: "ships_from_state", type: "single_line_text_field" },
  });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Shipping Method / Shipping Options", "Shipping Method / Shipping", "Shipping Method", "Shipping Methods"],
    value: payload.shippingMethod,
    fallback: { namespace: "custom", key: "shipping_method", type: "single_line_text_field" },
  });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Shipping Territory"],
    value: shippingTerritory,
    fallback: { namespace: "custom", key: "shipping_territory", type: "single_line_text_field" },
  });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Show on HairGrab Map"],
    value: payload.showOnMap,
    fallback: { namespace: "custom", key: "show_on_hairgrab_map", type: "single_line_text_field" },
  });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Ships Within"],
    value: parseShipsWithinValues(payload.shipsWithin || (payload.sameDayDelivery ? "Same Day" : "")),
    fallback: { namespace: "custom", key: "ships_within", type: customMetafieldType(definitions, "ships_within", "list.single_line_text_field") },
  });
  ensureCustomListMetafield(
    metafields,
    "ships_within",
    parseShipsWithinValues(payload.shipsWithin || (payload.sameDayDelivery ? "Same Day" : "")),
    customMetafieldType(definitions, "ships_within", "list.single_line_text_field"),
  );
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Return Policy"],
    value: payload.returnPolicy,
    fallback: { namespace: "custom", key: "return_policy", type: "single_line_text_field" },
  });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Bundle Weight", "Weight"],
    value: payload.bundleWeight,
    fallback: { namespace: "hairgrab", key: "bundle_weight", type: "single_line_text_field" },
  });
  addExistingMetafield({
    definitions,
    output: metafields,
    names: ["Piece Count", "Number of Pieces"],
    value: payload.pieceCount,
    fallback: { namespace: "hairgrab", key: "piece_count", type: "number_integer" },
  });

  if (payload.productType === "EXTENSION") {
    addExistingMetafield({
      definitions,
      output: metafields,
      names: ["Extension Type"],
      value: extensionTypeFromOptions(payload.selectedOptions),
      fallback: EXTENSION_TYPE_METAFIELD,
    });
  }

  metafields.push(
    { namespace: "hairgrab", key: "shipping_charge_type", type: "single_line_text_field", value: payload.shippingMethod },
    { namespace: "hairgrab", key: "local_pickup_available", type: "boolean", value: String(Boolean(payload.localPickupAvailable)) },
    { namespace: "hairgrab", key: "local_delivery_available", type: "boolean", value: String(Boolean(payload.localDeliveryAvailable)) },
  );
  if (payload.shippingMethod === "Flat Rate Shipping" && Number(payload.flatRateShipping) > 0) {
    metafields.push({
      namespace: "hairgrab",
      key: "flat_rate_shipping",
      type: "number_decimal",
      value: Number(payload.flatRateShipping).toFixed(2),
    });
  }
  if (payload.installationMethods?.length) {
    metafields.push({
      namespace: "hairgrab",
      key: "installation_methods",
      type: "list.single_line_text_field",
      value: JSON.stringify(
        installationMethodChoices
          .filter((item) => payload.installationMethods.includes(item.value))
          .map((item) => item.label)
      ),
    });
  }
  if (payload.locType) {
    metafields.push({
      namespace: "hairgrab",
      key: "loc_type",
      type: "single_line_text_field",
      value: locTypeChoices.find((item) => item.value === payload.locType)?.label || payload.locType,
    });
  }

  return metafields;
}

async function createSellerProductFromPayload({
  seller,
  payload,
  imageFiles,
  videoFiles,
  saveAsDraft,
}: {
  seller: NonNullable<Awaited<ReturnType<typeof getSellerFromRequest>>>;
  payload: ProductPayload;
  imageFiles: File[];
  videoFiles: File[];
  saveAsDraft: boolean;
}): Promise<SavedProductResult> {
  if (!payload.title?.trim()) throw new Error("Product name is required.");
  if (!saveAsDraft && !payload.description?.trim()) throw new Error("Product description is required.");
  if (!payload.productType) throw new Error("Product type is required.");

  if (!Array.isArray(payload.variants) || payload.variants.length === 0) {
    if (!saveAsDraft) throw new Error("At least one product variant is required.");
    payload.variants = [{
      label: "Draft",
      length: "",
      option: "",
      color: payload.colors?.[0] || "Natural / 1B",
      price: "0",
      salePrice: "",
      inventory: "",
      sku: "",
    }];
  }

  for (const variant of payload.variants) {
    if (saveAsDraft && !String(variant.price || "").trim()) variant.price = "0";
    const price = Number(variant.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Enter a valid price for ${variant.label}.`);
    }
  }

  const { admin } = await getShopifyAdmin();
  const locationId = await getPrimaryLocationId(admin);
  const uploadedImages = await stageFiles(admin, imageFiles, "PRODUCT_IMAGE");
  const uploadedVideos = await stageFiles(admin, videoFiles, "VIDEO");
  const productFiles = [
    ...uploadedImages,
    ...uploadedVideos,
    ...(payload.imageUrls || []).filter(Boolean).map((url) => ({
      originalSource: url,
      contentType: "IMAGE" as const,
      alt: payload.title,
    })),
  ];

  const hairProduct = payload.productType !== "HAIR_ESSENTIAL";
  const uniqueLengths = [...new Set(payload.variants.map((variant) => variant.length).filter(Boolean))];
  const uniqueStyleOptions = [...new Set(payload.variants.map((variant) => variant.option).filter(Boolean))];
  const currentOptions = productOptions[payload.productType] || [];
  const styleLabel = (value: string) => currentOptions.find((option) => option.value === value)?.label || value;
  const productOptionsInput: Array<{ name: string; values: Array<{ name: string }> }> = [];

  if (hairProduct && uniqueLengths.length > 0) {
    productOptionsInput.push({ name: "Length", values: uniqueLengths.map((length) => ({ name: `${length}"` })) });
  }
  if (payload.optionsAreVariants && uniqueStyleOptions.length > 0) {
    productOptionsInput.push({ name: "Style", values: uniqueStyleOptions.map((option) => ({ name: styleLabel(option) })) });
  }
  if (Array.isArray(payload.colors) && payload.colors.length > 1) {
    productOptionsInput.push({ name: "Color", values: payload.colors.map((colorValue) => ({ name: colorValue })) });
  }
  if (productOptionsInput.length === 0) {
    productOptionsInput.push({ name: "Option", values: [{ name: "Standard" }] });
  }

  const variantsInput = payload.variants.map((variant, index) => {
    const optionValues: Array<{ optionName: string; name: string }> = [];
    if (hairProduct && variant.length) optionValues.push({ optionName: "Length", name: `${variant.length}"` });
    if (payload.optionsAreVariants && variant.option) optionValues.push({ optionName: "Style", name: styleLabel(variant.option) });
    if (Array.isArray(payload.colors) && payload.colors.length > 1 && variant.color) {
      optionValues.push({ optionName: "Color", name: variant.color });
    }
    if (optionValues.length === 0) optionValues.push({ optionName: "Option", name: "Standard" });
    const inventory = String(variant.inventory || "").trim();
    const hasInventory = inventory !== "" && Number.isFinite(Number(inventory));
    return {
      optionValues,
      price: Number(variant.price),
      ...(variant.sku?.trim() ? { sku: variant.sku.trim() } : {}),
      inventoryPolicy: "DENY",
      inventoryItem: { tracked: hasInventory },
      ...(hasInventory
        ? {
            inventoryQuantities: [{
              locationId,
              name: "available",
              quantity: Math.max(0, Math.floor(Number(inventory))),
            }],
          }
        : {}),
      position: index + 1,
    };
  });

  const definitions = await ensureRequiredCustomProductMetafieldDefinitions(admin);
  const metafields = collectProductMetafields(definitions, payload, seller);
  const productTypeDisplay = productTypeToCategoryLabel(payload.productType);
  const selectedOptionTags = payload.selectedOptions
    .map((value) => currentOptions.find((option) => option.value === value)?.label || "")
    .filter(Boolean);
  const classificationTags = (productClassifications[payload.productType] || [])
    .filter((choice) => payload.searchClassifications?.includes(choice.value))
    .map((choice) => choice.label);

  const productSetResponse = await admin.graphql(
    `#graphql
    mutation HairGrabCreateSellerProduct($productSet: ProductSetInput!, $synchronous: Boolean!) {
      productSet(input: $productSet, synchronous: $synchronous) {
        product {
          id
          handle
          variants(first: 250) { nodes { id } }
          media(first: 20) { nodes { id } }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        synchronous: true,
        productSet: {
          title: payload.title.trim(),
          descriptionHtml: `<p>${payload.description.trim().replace(/\n/g, "</p><p>")}</p>`,
          productType: productTypeDisplay,
          vendor: seller.shopifyVendor || seller.businessName,
          status: saveAsDraft ? "DRAFT" : "ACTIVE",
          tags: [...new Set([
            "HairGrab",
            `HairGrab Seller ${seller.sellerCode}`,
            productTypeDisplay,
            ...selectedOptionTags,
            ...classificationTags,
            ...sellerProductAttributeTags({
              ...payload,
              hairCategory: productTypeDisplay,
              lengths: uniqueLengths,
            }),
          ])],
          productOptions: productOptionsInput,
          variants: variantsInput,
          ...(productFiles.length > 0 ? { files: productFiles } : {}),
        },
      },
    }
  );

  const productSetJson = await productSetResponse.json();
  const productSetResult = productSetJson?.data?.productSet;
  const shopifyErrors = formatErrors(productSetResult?.userErrors);
  if (shopifyErrors) throw new Error(`Shopify rejected the product: ${shopifyErrors}`);
  const shopifyProduct = productSetResult?.product;
  if (!shopifyProduct?.id) throw new Error("Shopify did not return a product after saving.");

  const metafieldSaveResult = await setProductMetafieldsSafely({
    admin,
    productId: String(shopifyProduct.id),
    metafields,
  });

  const variantIds = (shopifyProduct.variants?.nodes || [])
    .map((node: { id?: string }) => String(node.id || ""))
    .filter(Boolean);

  try {
    if (variantIds.length) {
      await syncHairGrabShippingProfile({
        admin,
        locationId,
        variantIds,
        shippingMethod: payload.shippingMethod,
        flatRateShipping: payload.flatRateShipping,
      });
    }
  } catch (error) {
    console.warn("[HairGrab Core] Shipping profile sync skipped after product save:", error);
  }

  const firstSku = payload.variants.find((variant) => variant.sku?.trim())?.sku?.trim() || null;
  const coreProduct = await db.sellerProduct.create({
    data: {
      sellerId: seller.id,
      shopifyProductId: String(shopifyProduct.id),
      shopifyHandle: shopifyProduct.handle ? String(shopifyProduct.handle) : null,
      title: payload.title.trim(),
      status: saveAsDraft ? "DRAFT" : "ACTIVE",
      sellerSku: firstSku,
      publishedToShopify: !saveAsDraft,
    },
  });

  return {
    success: true,
    message: saveAsDraft
      ? "Draft saved. You can continue editing it from My Products."
      : "Product saved successfully. HairGrab received it for review.",
    draftSaved: saveAsDraft,
    shopifyProductId: String(shopifyProduct.id),
    productHandle: shopifyProduct.handle ? String(shopifyProduct.handle) : null,
    sellerProductId: coreProduct.id,
    variantCount: shopifyProduct?.variants?.nodes?.length || payload.variants.length,
    mediaCount: shopifyProduct?.media?.nodes?.length || productFiles.length,
    metafieldsSaved: metafieldSaveResult.saved.length,
    metafieldsSkipped: metafieldSaveResult.skipped.length,
  };
}

export const action = async ({ request }: ActionFunctionArgs): Promise<any> => {
  const seller = await getSellerFromRequest(request);

  if (!seller) {
    return {
      success: false,
      message: "Your seller session has expired. Please sign in again.",
    };
  }

  try {
    const formData = await request.formData();
    const csvRaw = String(formData.get("csvBatchPayload") || "");
    if (csvRaw) {
      const payloads = JSON.parse(csvRaw) as ProductPayload[];
      const results = [];
      for (const payload of payloads) {
        try {
          const saved = await createSellerProductFromPayload({
            seller,
            payload,
            imageFiles: [],
            videoFiles: [],
            saveAsDraft: true,
          });
          results.push({
            key: payload.csvSourceKey || "",
            success: true,
            title: payload.title,
            message: saved.message,
            sellerProductId: saved.sellerProductId,
          });
        } catch (error) {
          results.push({
            key: payload.csvSourceKey || "",
            success: false,
            title: payload.title,
            message: error instanceof Error ? error.message : "Add failed",
          });
        }
      }
      return { csvBatch: true, results };
    }

    const payloadRaw = String(formData.get("productPayload") || "");
    if (!payloadRaw) {
      return { success: false, message: "Product information was not received." };
    }

    const payload = JSON.parse(payloadRaw) as ProductPayload;
    const saveAsDraft = String(formData.get("saveAsDraft") || "") === "true";
    const imageFiles = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0)
      .slice(0, 10);
    const videoFiles = formData
      .getAll("videos")
      .filter((value): value is File => value instanceof File && value.size > 0)
      .slice(0, 3);

    return await createSellerProductFromPayload({
      seller,
      payload,
      imageFiles,
      videoFiles,
      saveAsDraft,
    });
  } catch (error: any) {
    console.error("[HairGrab Core] Product save error:", error);
    return {
      success: false,
      message: error?.message || "HairGrab could not save this product.",
    };
  }
};

// ==========================================================
// CLIENT COMPONENT
// ==========================================================

export default function AddProductRoute() {
  const { seller } = useLoaderData<typeof loader>();
  return <ProductBuilder seller={seller} />;
}