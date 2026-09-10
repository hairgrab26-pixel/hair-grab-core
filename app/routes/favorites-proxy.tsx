import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function getProxyIdentity(request: Request) {
  const url = new URL(request.url);

  return {
    shop: String(url.searchParams.get("shop") || "").trim(),
    customerId: String(url.searchParams.get("logged_in_customer_id") || "").trim(),
  };
}

function normalizeProductGid(value: string) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  if (raw.startsWith("gid://shopify/Product/")) {
    return raw;
  }

  if (/^\d+$/.test(raw)) {
    return `gid://shopify/Product/${raw}`;
  }

  return "";
}

type FavoriteRow = {
  shopifyProductId: string | null;
};

type ProductRow = {
  id: string;
  shopifyProductId: string | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const { shop, customerId } = getProxyIdentity(request);
  const url = new URL(request.url);

  if (!customerId) {
    return json({
      authenticated: false,
      favoriteProductGids: [],
    });
  }

  const requested = String(url.searchParams.get("product_gids") || "")
    .split(",")
    .map(normalizeProductGid)
    .filter(Boolean)
    .slice(0, 100);

  if (requested.length === 0) {
    return json({
      authenticated: true,
      favoriteProductGids: [],
    });
  }

  const allFavorites = await db.$queryRaw<FavoriteRow[]>`
    SELECT sp."shopifyProductId"
    FROM "CustomerFavorite" cf
    INNER JOIN "SellerProduct" sp
      ON sp."id" = cf."sellerProductId"
    WHERE cf."shop" = ${shop}
      AND cf."shopifyCustomerId" = ${customerId}
  `;

  const requestedSet = new Set(requested);

  return json({
    authenticated: true,
    favoriteProductGids: allFavorites
      .map((favorite) => favorite.shopifyProductId)
      .filter((value): value is string => Boolean(value && requestedSet.has(value))),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const { shop, customerId } = getProxyIdentity(request);

  if (!customerId) {
    return json(
      {
        success: false,
        authenticated: false,
        message: "Sign in to save favorites.",
      },
      401,
    );
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "toggle").toLowerCase();
  const productGid = normalizeProductGid(String(formData.get("product_gid") || ""));

  if (!productGid) {
    return json(
      {
        success: false,
        authenticated: true,
        message: "Product was not provided.",
      },
      400,
    );
  }

  const products = await db.$queryRaw<ProductRow[]>`
    SELECT "id", "shopifyProductId"
    FROM "SellerProduct"
    WHERE "shopifyProductId" = ${productGid}
      AND "status" = 'ACTIVE'
    LIMIT 1
  `;

  const sellerProduct = products[0];

  if (!sellerProduct) {
    return json(
      {
        success: false,
        authenticated: true,
        message: "This product is not available to favorite.",
      },
      404,
    );
  }

  const existing = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "CustomerFavorite"
    WHERE "shop" = ${shop}
      AND "shopifyCustomerId" = ${customerId}
      AND "sellerProductId" = ${sellerProduct.id}
    LIMIT 1
  `;

  const shouldSave =
    intent === "add" ||
    (intent === "toggle" && existing.length === 0);

  if (shouldSave) {
    if (existing.length === 0) {
      await db.$executeRaw`
        INSERT INTO "CustomerFavorite"
          ("id", "shop", "shopifyCustomerId", "sellerProductId", "createdAt")
        VALUES
          (
            ${crypto.randomUUID()},
            ${shop},
            ${customerId},
            ${sellerProduct.id},
            CURRENT_TIMESTAMP
          )
        ON CONFLICT
          ("shop", "shopifyCustomerId", "sellerProductId")
        DO NOTHING
      `;
    }

    return json({
      success: true,
      authenticated: true,
      favorite: true,
      productGid,
    });
  }

  if (existing.length > 0) {
    await db.$executeRaw`
      DELETE FROM "CustomerFavorite"
      WHERE "shop" = ${shop}
        AND "shopifyCustomerId" = ${customerId}
        AND "sellerProductId" = ${sellerProduct.id}
    `;
  }

  return json({
    success: true,
    authenticated: true,
    favorite: false,
    productGid,
  });
};
