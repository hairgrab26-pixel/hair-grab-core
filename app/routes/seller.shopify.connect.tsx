import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  redirect,
} from "react-router";

import {
  requireSellerSession,
} from "../seller-session.server";

import {
  buildShopifyAuthorizeUrl,
  normalizeShopDomain,
} from "../seller-shopify.server";

export const loader =
  async ({
    request,
  }: LoaderFunctionArgs) => {
    const {
      seller,
    } =
      await requireSellerSession(
        request,
      );

    const url =
      new URL(
        request.url,
      );

    const rawShop =
      url.searchParams.get(
        "shop",
      ) ||
      "";

    let shopDomain:
      string;

    try {
      shopDomain =
        normalizeShopDomain(
          rawShop,
        );
    } catch (
      error
    ) {
      const message =
        error instanceof
        Error
          ? error.message
          : "Invalid Shopify store address.";

      return redirect(
        `/seller/shopify?error=${encodeURIComponent(message)}`,
      );
    }

    const authorizeUrl =
      buildShopifyAuthorizeUrl(
        seller.id,
        shopDomain,
      );

    return redirect(
      authorizeUrl,
    );
  };

export default function SellerShopifyConnectRoute() {
  return null;
}
