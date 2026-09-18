import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  redirect,
  useLoaderData,
} from "react-router";

import { useState } from "react";
import crypto from "node:crypto";

import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { syncHairGrabShippingProfile } from "../hairgrab-shipping.server";
import { extensionTypeFromOptions, EXTENSION_TYPE_METAFIELD, productTypeToCategoryLabel } from "../product-categories";
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
  pieceCount: string;

  shippingMethod: string;
  flatRateShipping: string;
  localPickupAvailable: boolean;
  localDeliveryAvailable: boolean;
  sameDayDelivery: boolean;
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
      offersLocalPickup: seller.offersLocalPickup,
      offersLocalDelivery: seller.offersLocalDelivery,
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

function findMetafieldDefinition(
  definitions: ShopifyMetafieldDefinition[],
  names: string[]
) {
  const normalizedNames = names.map(normalizeMetafieldName);

  const matches = definitions.filter((definition) =>
    normalizedNames.includes(normalizeMetafieldName(definition.name))
  );

  if (matches.length === 0) {
    return undefined;
  }

  const ranked = [...matches].sort((a, b) => {
    const score = (definition: ShopifyMetafieldDefinition) => {
      let points = 0;
      if (definition.namespace === "custom") points += 20;
      if (!definition.constraints) points += 10;
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

  const definition = findMetafieldDefinition(definitions, names);

  if (!definition) {
    if (fallback && typeof value === "string" && value.trim()) {
      output.push({ ...fallback, value: value.trim() });
    }
    return;
  }

  const preparedValue = prepareMetafieldValue(definition, value);

  if (preparedValue === null) {
    console.warn(
      `[HairGrab Core] Skipping metafield "${definition.name}" because "${String(
        value
      )}" is not one of its allowed Shopify choices.`
    );
    return;
  }

  output.push({
    namespace: definition.namespace,
    key: definition.key,
    type: definition.type.name,
    value: preparedValue,
  });
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

      if (errors.length > 0) {
        skipped.push(`${metafield.namespace}.${metafield.key}`);
        console.warn(
          `[HairGrab Core] Skipping incompatible Shopify metafield ${metafield.namespace}.${metafield.key}:`,
          errors.map((e: { message?: string }) => e.message).join(" | ")
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

    const payloadRaw = String(formData.get("productPayload") || "");
    if (!payloadRaw) {
      return { success: false, message: "Product information was not received." };
    }

    const payload = JSON.parse(payloadRaw) as ProductPayload;
    const saveAsDraft = String(formData.get("saveAsDraft") || "") === "true";

    const imageFiles = formData
      .getAll("images")
      .filter((v): v is File => v instanceof File && v.size > 0)
      .slice(0, 10);

    const videoFiles = formData
      .getAll("videos")
      .filter((v): v is File => v instanceof File && v.size > 0)
      .slice(0, 3);

    const { admin } = await getShopifyAdmin();
    const locationId = await getPrimaryLocationId(admin);

    const uploadedImages = await stageFiles(admin, imageFiles, "PRODUCT_IMAGE");
    const uploadedVideos = await stageFiles(admin, videoFiles, "VIDEO");
    const productFiles = [...uploadedImages, ...uploadedVideos];

    const definitions = await getProductMetafieldDefinitions(admin);
    const metafields: Array<{
      namespace: string;
      key: string;
      type: string;
      value: string;
    }> = [];

    // Core attribute metafield mappings
    addExistingMetafield({
      definitions,
      output: metafields,
      names: ["Material", "Hair Material", "Hair Type"],
      value: payload.material,
      fallback: { namespace: "custom", key: "material", type: "single_line_text_field" },
    });

    addExistingMetafield({
      definitions,
      output: metafields,
      names: ["Texture", "Hair Texture"],
      value: payload.texture,
      fallback: { namespace: "custom", key: "texture", type: "single_line_text_field" },
    });

    addExistingMetafield({
      definitions,
      output: metafields,
      names: ["Density", "Wig Density"],
      value: payload.density,
      fallback: { namespace: "custom", key: "density", type: "single_line_text_field" },
    });

    addExistingMetafield({
      definitions,
      output: metafields,
      names: ["Lace Size", "Frontal Size"],
      value: payload.laceSize,
      fallback: { namespace: "custom", key: "lace_size", type: "single_line_text_field" },
    });

    addExistingMetafield({
      definitions,
      output: metafields,
      names: ["Lace Type", "Lace Material"],
      value: payload.laceType,
      fallback: { namespace: "shopify", key: "lace-type", type: "single_line_text_field" },
    });

    addExistingMetafield({
      definitions,
      output: metafields,
      names: ["Cap Size"],
      value: payload.capSize,
      fallback: { namespace: "shopify", key: "cap-size", type: "single_line_text_field" },
    });

    // Explicitly add Same-Day Delivery Boolean Metafield
    metafields.push({
      namespace: "custom",
      key: "same_day_delivery",
      type: "boolean",
      value: payload.sameDayDelivery ? "true" : "false",
    });

    // Construct Product GraphQL Payload
    const productCreateResponse = await admin.graphql(
      `#graphql
      mutation HairGrabCreateProduct($input: ProductInput!, $media: [CreateMediaInput!]) {
        productCreate(input: $input, media: $media) {
          product {
            id
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
          input: {
            title: payload.title,
            descriptionHtml: payload.description,
            vendor: seller.shopifyVendor || seller.businessName,
            productType: productTypeToCategoryLabel(payload.productType),
            status: saveAsDraft ? "DRAFT" : "ACTIVE",
          },
          media: productFiles,
        },
      }
    );

    const productJson = await productCreateResponse.json();
    const createdProduct = productJson?.data?.productCreate?.product;

    if (!createdProduct?.id) {
      return {
        success: false,
        message: "Failed to create Shopify product.",
      };
    }

    // Apply Metafields to created product
    await setProductMetafieldsSafely({
      admin,
      productId: createdProduct.id,
      metafields,
    });

    // Sync shipping profile
    await syncHairGrabShippingProfile({
      admin,
      productId: createdProduct.id,
      flatRate: payload.flatRateShipping,
    });

    return {
      success: true,
      message: saveAsDraft
        ? "Product saved as draft successfully!"
        : "Product published successfully to Shopify!",
      productId: createdProduct.id,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || "An error occurred while saving the product.",
    };
  }
};

// ==========================================================
// CLIENT COMPONENT
// ==========================================================

export default function AddProductRoute() {
  const { seller } = useLoaderData<typeof loader>();
  const [formData, setFormData] = useState<Partial<ProductPayload>>({
    shippingMethod: "Free Shipping",
    sameDayDelivery: false,
    localPickupAvailable: seller.offersLocalPickup,
    localDeliveryAvailable: seller.offersLocalDelivery,
  });

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8 bg-slate-50 min-h-screen">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900">Add New Product</h1>
        <p className="text-slate-500 text-sm">
          Create product listings that automatically map attributes to Shopify and your HairGrab store.
        </p>
      </div>

      <ProductBuilder
        seller={seller}
        formData={formData}
        setFormData={setFormData}
      />

      {/* Shipping Card with Same-Day Delivery Switch */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Shipping & Express Delivery</h2>

        <div className="flex items-center justify-between p-4 border rounded-lg bg-red-50/50 border-red-100">
          <div>
            <p className="font-semibold text-slate-900">⚡ Same-Day Delivery Available</p>
            <p className="text-sm text-slate-500">
              Enable if this product is in stock locally for immediate dispatch or local pickup.
            </p>
          </div>
          <input
            type="checkbox"
            name="sameDayDelivery"
            checked={formData.sameDayDelivery || false}
            onChange={(e) => setFormData((prev) => ({ ...prev, sameDayDelivery: e.target.checked }))}
            className="w-5 h-5 accent-red-600 rounded cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}