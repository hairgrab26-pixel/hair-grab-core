
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import { requireSellerSession } from "../seller-session.server";


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(request);

  const onboarding =
    await db.sellerOnboarding.findUnique({
      where: {
        sellerId: seller.id,
      },
    });

  if (!onboarding) {
    throw new Response(
      "Seller onboarding record was not found.",
      {
        status: 404,
      },
    );
  }

  return {
    seller: {
      businessName:
        seller.businessName,

      sellerCode:
        seller.sellerCode,
    },

    agreementsComplete:
      onboarding.agreementsComplete,

    agreementsCompletedAt:
      onboarding.agreementsCompletedAt
        ? onboarding.agreementsCompletedAt.toISOString()
        : null,
  };
};


export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const { seller } =
    await requireSellerSession(request);

  const formData =
    await request.formData();

  const accepted =
    formData.get("accepted") === "on";

  if (!accepted) {
    return {
      success: false,

      message:
        "You must read and accept the HairGrab Seller Agreement before continuing.",
    };
  }

  const onboarding =
    await db.sellerOnboarding.findUnique({
      where: {
        sellerId: seller.id,
      },
    });

  if (!onboarding) {
    throw new Response(
      "Seller onboarding record was not found.",
      {
        status: 404,
      },
    );
  }

  const now =
    new Date();

  await db.sellerOnboarding.update({
    where: {
      sellerId: seller.id,
    },

    data: {
      agreementsComplete:
        true,

      agreementsCompletedAt:
        onboarding.agreementsCompletedAt ||
        now,

      currentStep:
        "PRODUCTS",

      status:
        "IN_PROGRESS",

      lastSavedAt:
        now,
    },
  });

  return redirect(
    "/seller/onboarding",
  );
};


export default function SellerAgreementsOnboardingPage() {
  const {
    seller,
    agreementsComplete,
    agreementsCompletedAt,
  } =
    useLoaderData<typeof loader>();

  const actionData =
    useActionData<typeof action>();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf8fc",
        padding: "28px 18px 70px",
        fontFamily: "Arial, sans-serif",
        color: "#21152a",
      }}
    >
      <div
        style={{
          maxWidth: "720px",
          margin: "0 auto",
        }}
      >
        <Link
          to="/seller/onboarding"
          style={{
            color: "#4B1678",
            textDecoration: "none",
            fontWeight: "800",
            fontSize: "12px",
          }}
        >
          ← Back to Seller Setup
        </Link>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5dce9",
            borderRadius: "16px",
            padding: "24px",
            marginTop: "12px",
          }}
        >
          <div
            style={{
              color: "#7b3fa0",
              fontSize: "11px",
              fontWeight: "800",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            HairGrab Seller Setup
          </div>

          <h1
            style={{
              color: "#4B1678",
              margin: "6px 0 5px",
              fontSize: "28px",
            }}
          >
            Seller Agreement
          </h1>

          <p
            style={{
              color: "#756b79",
              fontSize: "13px",
              lineHeight: 1.6,
              margin: "0 0 18px",
            }}
          >
            Review HairGrab's marketplace seller terms before listing products.
          </p>

          {agreementsComplete && (
            <div
              style={{
                background: "#edf8ef",
                color: "#28743b",
                borderRadius: "9px",
                padding: "11px",
                fontSize: "12px",
                fontWeight: "700",
                marginBottom: "16px",
              }}
            >
              ✓ Seller Agreement accepted
              {agreementsCompletedAt
                ? ` on ${new Date(
                    agreementsCompletedAt,
                  ).toLocaleDateString()}`
                : ""}
            </div>
          )}

          {actionData && (
            <div
              style={{
                background: "#fff1f1",
                color: "#922f2f",
                borderRadius: "9px",
                padding: "11px",
                fontSize: "12px",
                fontWeight: "700",
                marginBottom: "16px",
              }}
            >
              {actionData.message}
            </div>
          )}

          <div
            style={{
              background: "#faf8fc",
              border: "1px solid #e5dce9",
              borderRadius: "11px",
              padding: "16px",
              marginBottom: "14px",
            }}
          >
            <div
              style={{
                color: "#4B1678",
                fontWeight: "800",
                fontSize: "14px",
                marginBottom: "10px",
              }}
            >
              HairGrab Seller Commitments
            </div>

            <div
              style={{
                color: "#5f5664",
                fontSize: "12px",
                lineHeight: 1.7,
              }}
            >
              Sellers agree to provide accurate product information,
              maintain current inventory and pricing, fulfill orders
              within HairGrab's required timeframe, follow their
              stated return policy, comply with payout requirements
              and follow HairGrab marketplace rules.
            </div>
          </div>

          <Link
            to="/seller/agreement"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              textAlign: "center",
              border: "2px solid #4B1678",
              color: "#4B1678",
              background: "#ffffff",
              borderRadius: "9px",
              padding: "12px 17px",
              textDecoration: "none",
              fontWeight: "800",
              fontSize: "13px",
              marginBottom: "16px",
            }}
          >
            View Full Seller Agreement ↗
          </Link>

          <Form method="post">
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                border: "1px solid #e5dce9",
                borderRadius: "10px",
                padding: "14px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                name="accepted"
                defaultChecked={
                  agreementsComplete
                }
                style={{
                  marginTop: "3px",
                }}
              />

              <div
                style={{
                  color: "#4f4554",
                  fontSize: "12px",
                  lineHeight: 1.55,
                }}
              >
                I have read and agree to the HairGrab Seller Agreement and marketplace requirements for{" "}
                <strong>
                  {seller.businessName}
                </strong>{" "}
                ({seller.sellerCode}).
              </div>
            </label>

            <button
              type="submit"
              style={{
                width: "100%",
                border: 0,
                background: "#4B1678",
                color: "#ffffff",
                borderRadius: "9px",
                padding: "13px 17px",
                fontWeight: "800",
                marginTop: "18px",
                cursor: "pointer",
              }}
            >
              {agreementsComplete
                ? "Continue Seller Setup"
                : "Accept & Continue"}
            </button>
          </Form>

          <div
            style={{
              marginTop: "12px",
              color: "#817787",
              fontSize: "10px",
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            HairGrab records the date and time this agreement is accepted.
          </div>
        </div>
      </div>
    </div>
  );
}