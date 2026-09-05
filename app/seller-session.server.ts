import crypto from "node:crypto";
import { redirect } from "react-router";

import db from "./db.server";

const SELLER_SESSION_COOKIE = "hairgrab_seller_session";
const SELLER_SESSION_DAYS = 7;

type SellerSessionPayload = {
  sellerId: string;
  portalAccountId: string;
  expiresAt: number;
};

function getSessionSecret() {
  // eslint-disable-next-line no-undef
  const secret =
    process.env.SESSION_SECRET ||
    // eslint-disable-next-line no-undef
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

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function getCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("Cookie") || "";

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [cookieName, ...cookieValueParts] = cookie.trim().split("=");

    if (cookieName === name) {
      return cookieValueParts.join("=");
    }
  }

  return null;
}

export function createSellerSessionCookie({
  sellerId,
  portalAccountId,
}: {
  sellerId: string;
  portalAccountId: string;
}) {
  const expiresAt =
    Date.now() +
    SELLER_SESSION_DAYS * 24 * 60 * 60 * 1000;

  const payload = JSON.stringify({
    sellerId,
    portalAccountId,
    expiresAt,
  });

  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");

  const signature = signValue(encodedPayload);

  const sessionValue = `${encodedPayload}.${signature}`;

  const maxAge =
    SELLER_SESSION_DAYS * 24 * 60 * 60;

  // eslint-disable-next-line no-undef
  const secure = process.env.NODE_ENV === "production";

  return [
    `${SELLER_SESSION_COOKIE}=${sessionValue}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSellerSessionCookie() {
  // eslint-disable-next-line no-undef
  const secure = process.env.NODE_ENV === "production";

  return [
    `${SELLER_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function readSellerSession(
  request: Request,
): SellerSessionPayload | null {
  try {
    const sessionValue = getCookieValue(
      request,
      SELLER_SESSION_COOKIE,
    );

    if (!sessionValue) {
      return null;
    }

    const parts = sessionValue.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const [encodedPayload, suppliedSignature] = parts;

    if (!encodedPayload || !suppliedSignature) {
      return null;
    }

    const expectedSignature = signValue(encodedPayload);

    if (!safeEqual(suppliedSignature, expectedSignature)) {
      return null;
    }

    const decodedPayload = Buffer.from(
      encodedPayload,
      "base64url",
    ).toString("utf8");

    const payload = JSON.parse(
      decodedPayload,
    ) as SellerSessionPayload;

    if (
      !payload.sellerId ||
      !payload.portalAccountId ||
      !payload.expiresAt
    ) {
      return null;
    }

    if (payload.expiresAt <= Date.now()) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error(
      "[HairGrab Core] Seller session validation error:",
      error,
    );

    return null;
  }
}

export async function requireSellerSession(request: Request) {
  const session = readSellerSession(request);

  if (!session) {
    throw redirect("/seller/login");
  }

  const portalAccount =
    await db.sellerPortalAccount.findUnique({
      where: {
        id: session.portalAccountId,
      },

      include: {
        seller: true,
      },
    });

  if (
    !portalAccount ||
    portalAccount.sellerId !== session.sellerId ||
    portalAccount.status !== "ACTIVE"
  ) {
    throw redirect("/seller/login", {
      headers: {
        "Set-Cookie": clearSellerSessionCookie(),
      },
    });
  }

  const seller = portalAccount.seller;

  if (
    !seller ||
    seller.status === "SUSPENDED" ||
    seller.status === "INACTIVE" ||
    seller.status === "CLOSED"
  ) {
    throw redirect("/seller/login", {
      headers: {
        "Set-Cookie": clearSellerSessionCookie(),
      },
    });
  }

  return {
    session,
    portalAccount,
    seller,
  };
}