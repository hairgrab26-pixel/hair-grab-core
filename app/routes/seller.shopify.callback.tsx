import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  redirect,
} from "react-router";

import db from "../db.server";

import {
  requireSellerSession,
} from "../seller-session.server";

import {
  encryptShopifyToken,
  exchangeShopifyCode,
  normalizeShopDomain,
  sellerShopifyGraphql,
  verifyShopifyCallbackHmac,
  verifyShopifyState,
} from "../seller-shopify.server";

type ShopQuery = {
  shop: {
    name: string;
    myshopifyDomain: string;
  };
};

export const loader =
  async ({
    request,
  }: LoaderFunctionArgs) => {
    const url =
      new URL(
        request.url,
      );

    if (
      !verifyShopifyCallbackHmac(
        url,
      )
    ) {
      throw new Response(
        "Shopify callback could not be verified.",
        {
          status:
            403,
        },
      );
    }

    const rawShop =
      url.searchParams.get(
        "shop",
      ) ||
      "";

    const code =
      url.searchParams.get(
        "code",
      ) ||
      "";

    const state =
      url.searchParams.get(
        "state",
      ) ||
      "";

    if (
      !rawShop ||
      !code ||
      !state
    ) {
      throw new Response(
        "Shopify callback is missing required information.",
        {
          status:
            400,
        },
      );
    }

    const shopDomain =
      normalizeShopDomain(
        rawShop,
      );

    const statePayload =
      verifyShopifyState(
        state,
      );

    if (
      statePayload.shopDomain !==
      shopDomain
    ) {
      throw new Response(
        "Shopify store does not match the authorization request.",
        {
          status:
            403,
        },
      );
    }

    const {
      seller,
    } =
      await requireSellerSession(
        request,
      );

    if (
      seller.id !==
      statePayload.sellerId
    ) {
      throw new Response(
        "Shopify authorization belongs to a different HairGrab seller.",
        {
          status:
            403,
        },
      );
    }

    const {
      accessToken,
      scope,
    } =
      await exchangeShopifyCode(
        shopDomain,
        code,
      );

    const shopData =
      await sellerShopifyGraphql<
        ShopQuery
      >(
        shopDomain,
        accessToken,
        `#graphql
        query HairGrabSellerShopIdentity {
          shop {
            name
            myshopifyDomain
          }
        }
        `,
      );

    const verifiedDomain =
      normalizeShopDomain(
        shopData.shop
          .myshopifyDomain ||
          shopDomain,
      );

    if (
      verifiedDomain !==
      shopDomain
    ) {
      throw new Response(
        "Shopify returned an unexpected store identity.",
        {
          status:
            403,
        },
      );
    }

    const existingOtherSeller =
      await db
        .sellerShopifyConnection
        .findFirst({
          where: {
            shopDomain,
            sellerId: {
              not:
                seller.id,
            },
          },

          select: {
            sellerId:
              true,
          },
        });

    if (
      existingOtherSeller
    ) {
      throw new Response(
        "That Shopify store is already connected to another HairGrab seller.",
        {
          status:
            409,
        },
      );
    }

    await db
      .sellerShopifyConnection
      .upsert({
        where: {
          sellerId:
            seller.id,
        },

        create: {
          sellerId:
            seller.id,

          shopDomain,

          shopName:
            shopData.shop.name,

          accessTokenEncrypted:
            encryptShopifyToken(
              accessToken,
            ),

          status:
            "CONNECTED",

          scopes:
            scope,

          connectedAt:
            new Date(),

          disconnectedAt:
            null,

          lastError:
            null,
        },

        update: {
          shopDomain,

          shopName:
            shopData.shop.name,

          accessTokenEncrypted:
            encryptShopifyToken(
              accessToken,
            ),

          status:
            "CONNECTED",

          scopes:
            scope,

          connectedAt:
            new Date(),

          disconnectedAt:
            null,

          lastError:
            null,
        },
      });

    return redirect(
      "/seller/shopify/products?connected=1",
    );
  };

export default function SellerShopifyCallbackRoute() {
  return null;
}
