import type { LoaderFunctionArgs } from "react-router";

import {
  redirect,
  useLoaderData,
} from "react-router";

import crypto from "node:crypto";

import db from "../db.server";


// ==========================================================
// SETTINGS
// ==========================================================

const SELLER_SESSION_COOKIE =
  "hairgrab_seller_session";

const SELLER_SESSION_DAYS =
  7;


// ==========================================================
// HELPERS
// ==========================================================

function hashToken(
  token: string,
) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}


function getSessionSecret() {

  // eslint-disable-next-line no-undef
  const secret =
    process.env.SESSION_SECRET ||
    // eslint-disable-next-line no-undef
    process.env.SHOPIFY_API_SECRET ||
    "";

  if (!secret) {
    throw new Error(
      "Seller session secret is not configured.",
    );
  }

  return secret;
}


function base64UrlEncode(
  value: string,
) {
  return Buffer
    .from(value, "utf8")
    .toString("base64url");
}


function signValue(
  value: string,
) {
  return crypto
    .createHmac(
      "sha256",
      getSessionSecret(),
    )
    .update(value)
    .digest("base64url");
}


function createSellerSessionCookie({
  sellerId,
  portalAccountId,
}: {
  sellerId: string;
  portalAccountId: string;
}) {

  const expiresAt =
    Date.now() +
    SELLER_SESSION_DAYS *
      24 *
      60 *
      60 *
      1000;


  const payload =
    JSON.stringify({
      sellerId,
      portalAccountId,
      expiresAt,
    });


  const encodedPayload =
    base64UrlEncode(
      payload,
    );


  const signature =
    signValue(
      encodedPayload,
    );


  const sessionValue =
    `${encodedPayload}.${signature}`;


  const maxAge =
    SELLER_SESSION_DAYS *
    24 *
    60 *
    60;


  // eslint-disable-next-line no-undef
  const secure =
    process.env.NODE_ENV ===
    "production";


  return [
    `${SELLER_SESSION_COOKIE}=${sessionValue}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure
      ? "Secure"
      : "",
  ]
    .filter(Boolean)
    .join("; ");
}


// ==========================================================
// LOADER
//
// The seller arrives here from:
//
// /seller/login/verify?token=...
//
// We validate the one-time token, mark it used,
// activate the portal account, create a signed seller
// browser session, then send the seller to onboarding.
// ==========================================================

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {

  const url =
    new URL(
      request.url,
    );


  const rawToken =
    String(
      url.searchParams.get(
        "token",
      ) || "",
    ).trim();


  if (!rawToken) {
    return {
      success: false,

      message:
        "This HairGrab sign-in link is invalid.",
    };
  }


  const tokenHash =
    hashToken(
      rawToken,
    );


  try {

    const loginToken =
      await db.sellerLoginToken.findUnique({
        where: {
          tokenHash,
        },

        include: {
          portalAccount: {
            include: {
              seller:
                true,
            },
          },
        },
      });


    if (!loginToken) {
      return {
        success: false,

        message:
          "This HairGrab sign-in link is invalid or no longer available.",
      };
    }


    // ======================================================
    // TOKEN ALREADY USED
    // ======================================================

    if (
      loginToken.usedAt
    ) {
      return {
        success: false,

        message:
          "This sign-in link has already been used. Please request a new HairGrab sign-in link.",
      };
    }


    // ======================================================
    // TOKEN EXPIRED
    // ======================================================

    if (
      loginToken.expiresAt.getTime() <
      Date.now()
    ) {
      return {
        success: false,

        message:
          "This sign-in link has expired. Please request a new HairGrab sign-in link.",
      };
    }


    const portalAccount =
      loginToken.portalAccount;


    if (
      !portalAccount
    ) {
      return {
        success: false,

        message:
          "We couldn't locate the HairGrab seller account connected to this sign-in link.",
      };
    }


    if (
      portalAccount.status ===
      "DISABLED"
    ) {
      return {
        success: false,

        message:
          "This HairGrab seller login is currently disabled.",
      };
    }


    const seller =
      portalAccount.seller;


    if (!seller) {
      return {
        success: false,

        message:
          "We couldn't locate your HairGrab seller account.",
      };
    }


    if (
      seller.status ===
      "SUSPENDED" ||
      seller.status ===
      "INACTIVE" ||
      seller.status ===
      "CLOSED"
    ) {
      return {
        success: false,

        message:
          "This HairGrab seller account is not currently available for sign-in.",
      };
    }


    const now =
      new Date();


    // ======================================================
    // CONSUME TOKEN + ACTIVATE PORTAL LOGIN
    //
    // Done in one transaction so a successful sign-in
    // updates both records together.
    // ======================================================

    await db.$transaction(
      async (tx) => {

        await tx.sellerLoginToken.update({
          where: {
            id:
              loginToken.id,
          },

          data: {
            usedAt:
              now,
          },
        });


        await tx.sellerPortalAccount.update({
          where: {
            id:
              portalAccount.id,
          },

          data: {
            status:
              "ACTIVE",

            emailVerifiedAt:
              portalAccount.emailVerifiedAt ||
              now,

            lastLoginAt:
              now,
          },
        });


        // Start onboarding the first time the seller
        // successfully signs into the portal.
        const onboarding =
          await tx.sellerOnboarding.findUnique({
            where: {
              sellerId:
                seller.id,
            },
          });


        if (onboarding) {

          const onboardingUpdate: {
            status?: string;
            startedAt?: Date;
            lastSavedAt?: Date;
          } = {
            lastSavedAt:
              now,
          };


          if (
            onboarding.status ===
            "NOT_STARTED"
          ) {
            onboardingUpdate.status =
              "IN_PROGRESS";

            onboardingUpdate.startedAt =
              onboarding.startedAt ||
              now;
          }


          await tx.sellerOnboarding.update({
            where: {
              sellerId:
                seller.id,
            },

            data:
              onboardingUpdate,
          });
        }
      },
    );


    // ======================================================
    // CREATE AUTHENTICATED SELLER COOKIE
    // ======================================================

    const cookie =
      createSellerSessionCookie({
        sellerId:
          seller.id,

        portalAccountId:
          portalAccount.id,
      });


    return redirect(
      "/seller/onboarding",
      {
        headers: {
          "Set-Cookie":
            cookie,
        },
      },
    );

  } catch (error) {

    console.error(
      "[HairGrab Core] Seller login verification error:",
      error,
    );


    return {
      success: false,

      message:
        "We couldn't sign you in right now. Please request a new HairGrab sign-in link.",
    };
  }
};


// ==========================================================
// ERROR PAGE
//
// On successful verification the loader redirects, so the
// seller only sees this page when the link cannot be used.
// ==========================================================

export default function SellerLoginVerifyPage() {

  const data =
    useLoaderData<
      typeof loader
    >();


  return (
    <div
      style={{
        minHeight:
          "100vh",
        background:
          "#faf8fc",
        padding:
          "40px 18px",
        fontFamily:
          "Arial, sans-serif",
        color:
          "#21152a",
      }}
    >
      <div
        style={{
          maxWidth:
            "460px",
          margin:
            "0 auto",
          background:
            "#ffffff",
          border:
            "1px solid #e6d9ef",
          borderRadius:
            "18px",
          padding:
            "28px",
          boxShadow:
            "0 4px 18px rgba(75, 22, 120, 0.07)",
          textAlign:
            "center",
        }}
      >

        <img
          src="/hairgrab-logo.png"
          alt="HairGrab"
          style={{
            width:
              "250px",
            maxWidth:
              "82%",
            height:
              "auto",
            marginBottom:
              "20px",
          }}
        />


        <div
          style={{
            width:
              "52px",
            height:
              "52px",
            borderRadius:
              "50%",
            background:
              "#fff1f1",
            color:
              "#922f2f",
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            margin:
              "0 auto 18px",
            fontWeight:
              "800",
            fontSize:
              "22px",
          }}
        >
          !
        </div>


        <h1
          style={{
            margin:
              "0 0 10px",
            color:
              "#4B1678",
            fontSize:
              "26px",
          }}
        >
          Sign-in link unavailable
        </h1>


        <p
          style={{
            margin:
              "0",
            color:
              "#706776",
            fontSize:
              "14px",
            lineHeight:
              "1.6",
          }}
        >
          {data.message}
        </p>


        <a
          href="/seller/login"
          style={{
            display:
              "inline-block",
            marginTop:
              "22px",
            background:
              "#4B1678",
            color:
              "#ffffff",
            borderRadius:
              "10px",
            padding:
              "12px 17px",
            textDecoration:
              "none",
            fontSize:
              "13px",
            fontWeight:
              "800",
          }}
        >
          Request a New Sign-In Link
        </a>

      </div>
    </div>
  );
}