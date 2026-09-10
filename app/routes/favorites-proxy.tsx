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

  const favorites = await db.customerFavorite.findMany({
    where: {
      shop,
      shopifyCustomerId: customerId,
      sellerProduct: {
        shopifyProductId: {
          in: requested,
        },
      },
    },
    select: {
      sellerProduct: {
        select: {
          shopifyProductId: true,
        },
      },
    },
  });

  return json({
    authenticated: true,
    favoriteProductGids: favorites
      .map((favorite) => favorite.sellerProduct.shopifyProductId)
      .filter(Boolean),
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

  const sellerProduct = await db.sellerProduct.findFirst({
    where: {
      shopifyProductId: productGid,
      status: "ACTIVE",
    },
    select: {
      id: true,
      shopifyProductId: true,
    },
  });

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

  const where = {
    shop_shopifyCustomerId_sellerProductId: {
      shop,
      shopifyCustomerId: customerId,
      sellerProductId: sellerProduct.id,
    },
  };

  const existing = await db.customerFavorite.findUnique({ where });

  const shouldSave =
    intent === "add" ||
    (intent === "toggle" && !existing);

  if (shouldSave) {
    if (!existing) {
      await db.customerFavorite.create({
        data: {
          shop,
          shopifyCustomerId: customerId,
          sellerProductId: sellerProduct.id,
        },
      });
    }

    return json({
      success: true,
      authenticated: true,
      favorite: true,
      productGid,
    });
  }

  if (existing) {
    await db.customerFavorite.delete({ where });
  }

  return json({
    success: true,
    authenticated: true,
    favorite: false,
    productGid,
  });
};
