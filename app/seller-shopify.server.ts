import crypto from "node:crypto";

const SHOPIFY_SCOPES = [
  "read_products",
  "read_inventory",
];

const SHOPIFY_API_VERSION = "2026-07";
const CALLBACK_URL =
  "https://seller.hairgrab.com/seller/shopify/callback";

type StatePayload = {
  sellerId: string;
  shopDomain: string;
  expiresAt: number;
};

function requiredEnv(name: string) {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is not configured.`,
    );
  }

  return value;
}

export function getSellerShopifyCredentials() {
  return {
    clientId:
      requiredEnv(
        "HAIRGRAB_SELLER_SHOPIFY_CLIENT_ID",
      ),

    clientSecret:
      requiredEnv(
        "HAIRGRAB_SELLER_SHOPIFY_CLIENT_SECRET",
      ),
  };
}

function getEncryptionKey() {
  const value =
    requiredEnv(
      "HAIRGRAB_SELLER_SHOPIFY_ENCRYPTION_KEY",
    );

  let key: Buffer;

  if (/^[a-f0-9]{64}$/i.test(value)) {
    key =
      Buffer.from(
        value,
        "hex",
      );
  } else {
    key =
      Buffer.from(
        value,
        "base64",
      );
  }

  if (key.length !== 32) {
    throw new Error(
      "HAIRGRAB_SELLER_SHOPIFY_ENCRYPTION_KEY must decode to exactly 32 bytes.",
    );
  }

  return key;
}

export function normalizeShopDomain(
  rawValue: string,
) {
  let value =
    String(
      rawValue || "",
    )
      .trim()
      .toLowerCase();

  value =
    value.replace(
      /^https?:\/\//,
      "",
    );

  value =
    value.replace(
      /\/.*$/,
      "",
    );

  if (
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(
      value,
    )
  ) {
    throw new Error(
      "Enter the Shopify store address ending in .myshopify.com.",
    );
  }

  return value;
}

function timingSafeEqualText(
  first: string,
  second: string,
) {
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

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    a,
    b,
  );
}

export function makeShopifyState(
  sellerId: string,
  shopDomain: string,
) {
  const {
    clientSecret,
  } =
    getSellerShopifyCredentials();

  const payload: StatePayload = {
    sellerId,
    shopDomain,
    expiresAt:
      Date.now() +
      10 * 60 * 1000,
  };

  const encoded =
    Buffer.from(
      JSON.stringify(
        payload,
      ),
      "utf8",
    ).toString(
      "base64url",
    );

  const signature =
    crypto
      .createHmac(
        "sha256",
        clientSecret,
      )
      .update(encoded)
      .digest(
        "base64url",
      );

  return `${encoded}.${signature}`;
}

export function verifyShopifyState(
  value: string,
) {
  const {
    clientSecret,
  } =
    getSellerShopifyCredentials();

  const [
    encoded,
    signature,
  ] =
    String(
      value || "",
    ).split(".");

  if (
    !encoded ||
    !signature
  ) {
    throw new Error(
      "Shopify authorization state is invalid.",
    );
  }

  const expected =
    crypto
      .createHmac(
        "sha256",
        clientSecret,
      )
      .update(encoded)
      .digest(
        "base64url",
      );

  if (
    !timingSafeEqualText(
      signature,
      expected,
    )
  ) {
    throw new Error(
      "Shopify authorization state could not be verified.",
    );
  }

  const payload =
    JSON.parse(
      Buffer.from(
        encoded,
        "base64url",
      ).toString(
        "utf8",
      ),
    ) as StatePayload;

  if (
    !payload.sellerId ||
    !payload.shopDomain ||
    !payload.expiresAt ||
    payload.expiresAt <
      Date.now()
  ) {
    throw new Error(
      "Shopify authorization state expired or is incomplete.",
    );
  }

  return payload;
}

export function buildShopifyAuthorizeUrl(
  sellerId: string,
  shopDomain: string,
) {
  const {
    clientId,
  } =
    getSellerShopifyCredentials();

  const normalized =
    normalizeShopDomain(
      shopDomain,
    );

  const state =
    makeShopifyState(
      sellerId,
      normalized,
    );

  const url =
    new URL(
      `https://${normalized}/admin/oauth/authorize`,
    );

  url.searchParams.set(
    "client_id",
    clientId,
  );

  url.searchParams.set(
    "scope",
    SHOPIFY_SCOPES.join(","),
  );

  url.searchParams.set(
    "redirect_uri",
    CALLBACK_URL,
  );

  url.searchParams.set(
    "state",
    state,
  );

  return url.toString();
}

export function verifyShopifyCallbackHmac(
  url: URL,
) {
  const {
    clientSecret,
  } =
    getSellerShopifyCredentials();

  const suppliedHmac =
    url.searchParams.get(
      "hmac",
    );

  if (!suppliedHmac) {
    return false;
  }

  const params =
    Object.fromEntries(
      Array.from(
        url.searchParams.entries(),
      ).filter(
        ([key]) =>
          key !== "hmac",
      ),
    );

  const message =
    Object.entries(params)
      .sort(
        ([a], [b]) =>
          a.localeCompare(b),
      )
      .map(
        ([key, value]) =>
          `${key}=${value}`,
      )
      .join("&");

  const digest =
    crypto
      .createHmac(
        "sha256",
        clientSecret,
      )
      .update(message)
      .digest("hex");

  return timingSafeEqualText(
    digest,
    suppliedHmac,
  );
}

export async function exchangeShopifyCode(
  shopDomain: string,
  code: string,
) {
  const {
    clientId,
    clientSecret,
  } =
    getSellerShopifyCredentials();

  const normalized =
    normalizeShopDomain(
      shopDomain,
    );

  const response =
    await fetch(
      `https://${normalized}/admin/oauth/access_token`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
          "Accept":
            "application/json",
        },

        body:
          JSON.stringify({
            client_id:
              clientId,

            client_secret:
              clientSecret,

            code,
          }),
      },
    );

  const json =
    await response.json() as {
      access_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

  if (
    !response.ok ||
    !json.access_token
  ) {
    throw new Error(
      json.error_description ||
        json.error ||
        "Shopify did not return an access token.",
    );
  }

  return {
    accessToken:
      json.access_token,

    scope:
      json.scope ||
      "",
  };
}

export function encryptShopifyToken(
  token: string,
) {
  const key =
    getEncryptionKey();

  const iv =
    crypto.randomBytes(
      12,
    );

  const cipher =
    crypto.createCipheriv(
      "aes-256-gcm",
      key,
      iv,
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        token,
        "utf8",
      ),

      cipher.final(),
    ]);

  const authTag =
    cipher.getAuthTag();

  return [
    "v1",
    iv.toString(
      "base64url",
    ),
    authTag.toString(
      "base64url",
    ),
    encrypted.toString(
      "base64url",
    ),
  ].join(".");
}

export function decryptShopifyToken(
  encryptedValue: string,
) {
  const key =
    getEncryptionKey();

  const [
    version,
    ivValue,
    tagValue,
    cipherValue,
  ] =
    String(
      encryptedValue || "",
    ).split(".");

  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    !cipherValue
  ) {
    throw new Error(
      "Stored Shopify token is invalid.",
    );
  }

  const decipher =
    crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(
        ivValue,
        "base64url",
      ),
    );

  decipher.setAuthTag(
    Buffer.from(
      tagValue,
      "base64url",
    ),
  );

  const decrypted =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          cipherValue,
          "base64url",
        ),
      ),

      decipher.final(),
    ]);

  return decrypted.toString(
    "utf8",
  );
}

export async function sellerShopifyGraphql<T>(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables:
    Record<
      string,
      unknown
    > = {},
) {
  const normalized =
    normalizeShopDomain(
      shopDomain,
    );

  const response =
    await fetch(
      `https://${normalized}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "X-Shopify-Access-Token":
            accessToken,
        },

        body:
          JSON.stringify({
            query,
            variables,
          }),
      },
    );

  const json =
    await response.json() as {
      data?: T;
      errors?: Array<{
        message?: string;
      }>;
    };

  if (!response.ok) {
    throw new Error(
      `Shopify API request failed with status ${response.status}.`,
    );
  }

  if (
    json.errors &&
    json.errors.length >
      0
  ) {
    throw new Error(
      json.errors
        .map(
          (error) =>
            error.message ||
            "Unknown Shopify error.",
        )
        .join(
          " | ",
        ),
    );
  }

  if (!json.data) {
    throw new Error(
      "Shopify returned no data.",
    );
  }

  return json.data;
}

export {
  CALLBACK_URL,
  SHOPIFY_API_VERSION,
  SHOPIFY_SCOPES,
};
