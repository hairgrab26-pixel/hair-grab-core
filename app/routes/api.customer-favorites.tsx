import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

type FavoriteRow = {
  shopifyProductId: string | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeCustomerId(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  if (raw.startsWith("gid://shopify/Customer/")) {
    return raw.replace("gid://shopify/Customer/", "");
  }

  return raw;
}

function normalizeShop(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return new URL(raw).hostname;
    }
  } catch {
    return "";
  }

  return raw;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors, sessionToken } =
    await authenticate.public.customerAccount(request);

  const customerId = normalizeCustomerId(sessionToken.sub);
  const shop = normalizeShop(sessionToken.dest);

  if (!customerId || !shop) {
    return cors(
      json(
        {
          authenticated: false,
          favoriteProductGids: [],
        },
        401,
      ),
    );
  }

  const favorites = await db.$queryRaw<FavoriteRow[]>`
    SELECT sp."shopifyProductId"
    FROM "CustomerFavorite" cf
    INNER JOIN "SellerProduct" sp
      ON sp."id" = cf."sellerProductId"
    WHERE cf."shop" = ${shop}
      AND cf."shopifyCustomerId" = ${customerId}
      AND sp."status" = 'ACTIVE'
    ORDER BY cf."createdAt" DESC
  `;

  return cors(
    json({
      authenticated: true,
      favoriteProductGids: favorites
        .map((favorite) => favorite.shopifyProductId)
        .filter((value): value is string => Boolean(value)),
    }),
  );
};