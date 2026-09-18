import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import crypto from "node:crypto";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sendSellerApprovalEmail } from "../email.server";


// ==========================================================
// CREATE SELLER LOGIN / ONBOARDING LINK
// ==========================================================

async function createSellerLoginLink({
  request,
  portalAccountId,
}: {
  request: Request;
  portalAccountId: string;
}) {
  const rawToken =
    crypto.randomBytes(32).toString("hex");

  const tokenHash =
    crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

  const expiresAt =
    new Date(
      Date.now() +
        24 * 60 * 60 * 1000,
    );

  await db.sellerLoginToken.create({
    data: {
      portalAccountId,
      tokenHash,
      expiresAt,
    },
  });

  const requestUrl =
    new URL(request.url);

  return `${requestUrl.origin}/seller/login/verify?token=${rawToken}`;
}


// ==========================================================
// LOADER
// ==========================================================

export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const sellerCode =
    params.sellerCode;

  if (!sellerCode) {
    throw new Response(
      "Seller code is required",
      {
        status: 400,
      },
    );
  }

  const seller =
    await db.seller.findUnique({
      where: {
        sellerCode,
      },

      include: {
        portalAccounts: true,
      },
    });

  if (!seller) {
    throw new Response(
      "Seller not found",
      {
        status: 404,
      },
    );
  }

  return {
    seller,
  };
};


// ==========================================================
// ACTION
// ==========================================================

export const action = async ({
  request,
  params,
}: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const sellerCode =
    params.sellerCode;

  if (!sellerCode) {
    return {
      success: false,
      message:
        "Seller code is missing.",
      intent: "",
    };
  }

  const formData =
    await request.formData();

  const intent =
    String(
      formData.get("intent") ||
        "",
    );

  const seller =
    await db.seller.findUnique({
      where: {
        sellerCode,
      },

      include: {
        portalAccounts: true,
      },
    });

  if (!seller) {
    return {
      success: false,
      message:
        "Seller was not found.",
      intent,
    };
  }


  // ========================================================
  // MAKE INACTIVE
  // ========================================================

  if (
    intent ===
    "make-inactive"
  ) {
    if (
      seller.status !==
      "ACTIVE"
    ) {
      return {
        success: false,
        message:
          `${seller.businessName} is not currently active.`,
        intent,
      };
    }

    try {
      await db.seller.update({
        where: {
          id: seller.id,
        },

        data: {
          status:
            "INACTIVE",

          deactivatedAt:
            new Date(),
        },
      });

      return {
        success: true,
        message:
          `${seller.businessName} is now inactive.`,
        intent,
      };
    } catch (error) {
      console.error(
        "[HairGrab Core] Seller deactivation error:",
        error,
      );

      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to make seller inactive.",
        intent,
      };
    }
  }


  // ========================================================
  // REACTIVATE
  // ========================================================

  if (
    intent ===
    "reactivate"
  ) {
    if (
      seller.status !==
      "INACTIVE"
    ) {
      return {
        success: false,
        message:
          `${seller.businessName} is not currently inactive.`,
        intent,
      };
    }

    try {
      await db.seller.update({
        where: {
          id: seller.id,
        },

        data: {
          status:
            "ACTIVE",

          deactivatedAt:
            null,
        },
      });

      return {
        success: true,
        message:
          `${seller.businessName} is active again.`,
        intent,
      };
    } catch (error) {
      console.error(
        "[HairGrab Core] Seller reactivation error:",
        error,
      );

      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to reactivate seller.",
        intent,
      };
    }
  }


  // ========================================================
  // RESEND ONBOARDING LINK
  // ========================================================

  if (
    intent ===
    "resend-onboarding-link"
  ) {
    try {
      const portalAccount =
        seller.portalAccounts.find(
          (account) =>
            seller.email &&
            account.email.toLowerCase() ===
              seller.email.toLowerCase(),
        ) ||
        seller.portalAccounts[0];

      if (!portalAccount) {
        return {
          success: false,
          message:
            "This seller does not have a seller portal account yet.",
          intent,
        };
      }

      const recipientEmail =
        seller.email ||
        portalAccount.email;

      if (!recipientEmail) {
        return {
          success: false,
          message:
            "This seller does not have an email address.",
          intent,
        };
      }

      const onboardingUrl =
        await createSellerLoginLink({
          request,
          portalAccountId:
            portalAccount.id,
        });

      await sendSellerApprovalEmail({
        to:
          recipientEmail,

        firstName:
          seller.contactFirstName ||
          portalAccount.firstName ||
          "there",

        businessName:
          seller.businessName,

        sellerCode:
          seller.sellerCode,

        onboardingUrl,
      });

      return {
        success: true,
        message:
          `A new 24-hour onboarding link was sent to ${recipientEmail}.`,
        intent,
      };
    } catch (error) {
      console.error(
        "[HairGrab Core] Resend onboarding link error:",
        error,
      );

      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to resend the onboarding link.",
        intent,
      };
    }
  }


  return {
    success: false,
    message:
      "Unknown seller action.",
    intent,
  };
};


// ==========================================================
// STYLES
// ==========================================================

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5d8ef",
  borderRadius: "14px",
  padding: "22px",
  boxShadow:
    "0 2px 8px rgba(84, 35, 120, 0.06)",
};

const labelStyle = {
  fontSize: "12px",
  color: "#756b7b",
  marginBottom: "4px",
};

const valueStyle = {
  fontSize: "15px",
  fontWeight: "700",
  color: "#2b1b35",
};


// ==========================================================
// PAGE
// ==========================================================

export default function SellerDetailPage() {
  const {
    seller,
  } =
    useLoaderData<
      typeof loader
    >();

  const actionData =
    useActionData<
      typeof action
    >();

  const navigation =
    useNavigation();

  const isSubmitting =
    navigation.state ===
    "submitting";

  const submittingIntent =
    navigation.formData
      ? String(
          navigation.formData.get(
            "intent",
          ) || "",
        )
      : "";

  const isMakingInactive =
    isSubmitting &&
    submittingIntent ===
      "make-inactive";

  const isReactivating =
    isSubmitting &&
    submittingIntent ===
      "reactivate";

  const isResending =
    isSubmitting &&
    submittingIntent ===
      "resend-onboarding-link";

  const hasPortalAccount =
    seller.portalAccounts.length >
    0;


  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "28px",
        fontFamily:
          "Arial, sans-serif",
        color: "#21152a",
      }}
    >

      {/* HEADER */}

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: "16px",
          alignItems:
            "flex-start",
          flexWrap: "wrap",
          marginBottom: "24px",
        }}
      >
        <div>
          <div
            style={{
              color: "#7b3fa0",
              fontSize: "13px",
              fontWeight: "700",
              textTransform:
                "uppercase",
              letterSpacing:
                "1.5px",
              marginBottom: "6px",
            }}
          >
            HairGrab Seller
          </div>

          <h1
            style={{
              margin: "0",
              color: "#542378",
              fontSize: "32px",
            }}
          >
            {seller.businessName}
          </h1>

          <p
            style={{
              color: "#6f6675",
              fontSize: "15px",
              marginTop: "8px",
            }}
          >
            Seller profile,
            marketplace status,
            commission and payout
            setup.
          </p>
        </div>

        <Link
          to="/app/sellers"
          style={{
            display:
              "inline-block",
            color: "#542378",
            border:
              "1px solid #d8c8e2",
            borderRadius: "9px",
            padding: "9px 12px",
            textDecoration: "none",
            fontWeight: "800",
            fontSize: "11px",
            background:
              "#ffffff",
          }}
        >
          ← Back to Sellers
        </Link>
      </div>


      {/* ACTION RESULT */}

      {actionData?.message && (
        <div
          style={{
            marginBottom:
              "20px",
            padding:
              "14px 16px",
            borderRadius:
              "10px",
            background:
              actionData.success
                ? "#eef8f0"
                : "#fff0f0",
            border:
              actionData.success
                ? "1px solid #cbe3d0"
                : "1px solid #efc0c0",
            color:
              actionData.success
                ? "#2f6b3c"
                : "#9a2929",
            fontWeight:
              "700",
            fontSize:
              "13px",
          }}
        >
          {actionData.success
            ? "✓ "
            : ""}

          {actionData.message}
        </div>
      )}


      {/* SUMMARY */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={cardStyle}>
          <div style={labelStyle}>
            Seller ID
          </div>

          <div style={valueStyle}>
            {seller.sellerCode}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>
            Status
          </div>

          <div
            style={{
              ...valueStyle,

              color:
                seller.status ===
                "ACTIVE"
                  ? "#28743b"
                  : seller.status ===
                      "INACTIVE"
                    ? "#805c12"
                    : "#922f2f",
            }}
          >
            {seller.status}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>
            Commission Rate
          </div>

          <div style={valueStyle}>
            {seller.commissionRate}%
          </div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>
            Payout Status
          </div>

          <div style={valueStyle}>
            {seller.payoutStatus}
          </div>
        </div>
      </div>


      {/* SELLER ACCESS */}

      <div
        style={{
          ...cardStyle,
          marginBottom: "18px",
        }}
      >
        <h2
          style={{
            margin: "0",
            color: "#542378",
            fontSize: "20px",
          }}
        >
          Seller Access
        </h2>

        <p
          style={{
            color: "#6f6675",
            fontSize: "12px",
            lineHeight: 1.6,
            margin:
              "7px 0 16px",
          }}
        >
          Send the seller a new
          secure HairGrab onboarding
          access link. Each new link
          expires after 24 hours.
        </p>

        {hasPortalAccount ? (
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="resend-onboarding-link"
            />

            <button
              type="submit"
              disabled={
                isSubmitting
              }
              style={{
                border: "none",
                borderRadius:
                  "9px",
                background:
                  "#4B1678",
                color: "#ffffff",
                padding:
                  "10px 15px",
                fontWeight:
                  "800",
                cursor:
                  isSubmitting
                    ? "wait"
                    : "pointer",
                opacity:
                  isSubmitting
                    ? 0.65
                    : 1,
              }}
            >
              {isResending
                ? "Sending..."
                : "Resend Onboarding Link"}
            </button>
          </Form>
        ) : (
          <div
            style={{
              padding:
                "11px 13px",
              background:
                "#f8f5fa",
              border:
                "1px solid #e6ddea",
              borderRadius:
                "9px",
              color:
                "#756b7b",
              fontSize:
                "12px",
              fontWeight:
                "700",
            }}
          >
            No seller portal account
            is connected to this
            seller, so an onboarding
            link cannot be sent from
            this screen.
          </div>
        )}
      </div>


      {/* MARKETPLACE STATUS */}

      <div
        style={{
          ...cardStyle,
          marginBottom: "18px",

          border:
            seller.status ===
            "ACTIVE"
              ? "1px solid #d7e8da"
              : seller.status ===
                  "INACTIVE"
                ? "1px solid #ead9a8"
                : "1px solid #e5d8ef",
        }}
      >
        <h2
          style={{
            margin: "0",
            color: "#542378",
            fontSize: "20px",
          }}
        >
          Marketplace Status
        </h2>

        <p
          style={{
            color: "#6f6675",
            fontSize: "12px",
            lineHeight: 1.6,
            margin:
              "7px 0 16px",
          }}
        >
          Active sellers can
          participate in the HairGrab
          marketplace. Making a seller
          inactive keeps their
          HairGrab account and history
          intact while removing them
          from active marketplace
          participation.
        </p>

        {seller.status ===
          "ACTIVE" && (
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="make-inactive"
            />

            <button
              type="submit"
              disabled={
                isSubmitting
              }
              style={{
                border:
                  "1px solid #d9b9a3",
                borderRadius:
                  "9px",
                background:
                  isMakingInactive
                    ? "#f5f1ee"
                    : "#ffffff",
                color:
                  "#8a4b2b",
                padding:
                  "10px 15px",
                fontWeight:
                  "800",
                cursor:
                  isSubmitting
                    ? "wait"
                    : "pointer",
                opacity:
                  isSubmitting
                    ? 0.65
                    : 1,
              }}
            >
              {isMakingInactive
                ? "Updating..."
                : "Make Inactive"}
            </button>
          </Form>
        )}

        {seller.status ===
          "INACTIVE" && (
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="reactivate"
            />

            <button
              type="submit"
              disabled={
                isSubmitting
              }
              style={{
                border: "none",
                borderRadius:
                  "9px",
                background:
                  "#4B1678",
                color:
                  "#ffffff",
                padding:
                  "10px 15px",
                fontWeight:
                  "800",
                cursor:
                  isSubmitting
                    ? "wait"
                    : "pointer",
                opacity:
                  isSubmitting
                    ? 0.65
                    : 1,
              }}
            >
              {isReactivating
                ? "Updating..."
                : "Reactivate Seller"}
            </button>
          </Form>
        )}

        {seller.status !==
          "ACTIVE" &&
          seller.status !==
            "INACTIVE" && (
            <div
              style={{
                padding:
                  "11px 13px",
                background:
                  "#f8f5fa",
                border:
                  "1px solid #e6ddea",
                borderRadius:
                  "9px",
                color:
                  "#756b7b",
                fontSize:
                  "12px",
                fontWeight:
                  "700",
              }}
            >
              This seller is currently{" "}
              {seller.status}. No
              automatic status action
              is available from this
              screen.
            </div>
          )}
      </div>


      {/* INFORMATION */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "18px",
        }}
      >
        <div style={cardStyle}>
          <h2
            style={{
              marginTop: "0",
              color: "#542378",
              fontSize: "20px",
            }}
          >
            Seller Information
          </h2>

          <div
            style={{
              display: "grid",
              gap: "18px",
              marginTop:
                "18px",
            }}
          >
            <div>
              <div style={labelStyle}>
                Business Name
              </div>

              <div style={valueStyle}>
                {seller.businessName}
              </div>
            </div>

            <div>
              <div style={labelStyle}>
                Contact
              </div>

              <div style={valueStyle}>
                {[
                  seller.contactFirstName,
                  seller.contactLastName,
                ]
                  .filter(Boolean)
                  .join(" ") ||
                  "Not provided"}
              </div>
            </div>

            <div>
              <div style={labelStyle}>
                Email
              </div>

              <div style={valueStyle}>
                {seller.email ||
                  seller.portalAccounts[0]
                    ?.email ||
                  "Not provided"}
              </div>
            </div>

            <div>
              <div style={labelStyle}>
                Shopify Vendor
              </div>

              <div style={valueStyle}>
                {seller.shopifyVendor}
              </div>
            </div>

            <div>
              <div style={labelStyle}>
                Nexus Seller ID
              </div>

              <div style={valueStyle}>
                {seller.nexusSellerId ||
                  "Not connected"}
              </div>
            </div>
          </div>
        </div>


        {/* PAYOUT */}

        <div style={cardStyle}>
          <h2
            style={{
              marginTop: "0",
              color: "#542378",
              fontSize: "20px",
            }}
          >
            Payout Setup
          </h2>

          <div
            style={{
              display: "grid",
              gap: "18px",
              marginTop:
                "18px",
            }}
          >
            <div>
              <div style={labelStyle}>
                Payout Connection
              </div>

              <div style={valueStyle}>
                {seller.payoutStatus}
              </div>
            </div>

            <div>
              <div style={labelStyle}>
                Stripe Connected
                Account
              </div>

              <div style={valueStyle}>
                {seller.stripeAccountId ||
                  "Not connected"}
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* FINANCIAL SUMMARY */}

      <div
        style={{
          ...cardStyle,
          marginTop: "18px",
        }}
      >
        <h2
          style={{
            marginTop: "0",
            color: "#542378",
            fontSize: "20px",
          }}
        >
          Seller Financial Summary
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "18px",
            marginTop: "18px",
          }}
        >
          <div>
            <div style={labelStyle}>
              Gross Sales
            </div>

            <div style={valueStyle}>
              $0.00
            </div>
          </div>

          <div>
            <div style={labelStyle}>
              HairGrab Commission
            </div>

            <div style={valueStyle}>
              $0.00
            </div>
          </div>

          <div>
            <div style={labelStyle}>
              Seller Earnings
            </div>

            <div style={valueStyle}>
              $0.00
            </div>
          </div>

          <div>
            <div style={labelStyle}>
              Payout Ready
            </div>

            <div style={valueStyle}>
              $0.00
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}