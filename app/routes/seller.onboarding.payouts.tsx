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
import stripe from "../stripe.server";
import { requireSellerSession } from "../seller-session.server";


function appBaseUrl(request: Request) {
  return (
    process.env.SHOPIFY_APP_URL ||
    new URL(request.url).origin
  ).replace(/\/+$/, "");
}


function isPayoutReady(account: any) {
  return Boolean(
    account?.details_submitted &&
    account?.payouts_enabled,
  );
}


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

  let stripeAccount: any = null;

  if (seller.stripeAccountId) {
    try {
      stripeAccount =
        await stripe.accounts.retrieve(
          seller.stripeAccountId,
        );
    } catch (error) {
      console.error(
        "[HairGrab Core] Unable to retrieve Stripe connected account:",
        error,
      );
    }
  }

  const connected =
    isPayoutReady(stripeAccount);

  if (
    connected &&
    (
      seller.payoutStatus !== "CONNECTED" ||
      !onboarding.payoutsComplete
    )
  ) {
    const now = new Date();

    await db.$transaction([
      db.seller.update({
        where: {
          id: seller.id,
        },
        data: {
          payoutStatus: "CONNECTED",
        },
      }),

      db.sellerOnboarding.update({
        where: {
          sellerId: seller.id,
        },
        data: {
          payoutsComplete: true,

          payoutsCompletedAt:
            onboarding.payoutsCompletedAt ||
            now,

          currentStep:
            onboarding.agreementsComplete
              ? "PRODUCTS"
              : "AGREEMENTS",

          status: "IN_PROGRESS",
          lastSavedAt: now,
        },
      }),
    ]);
  }

  return {
    seller: {
      businessName:
        seller.businessName,

      payoutStatus:
        connected
          ? "CONNECTED"
          : seller.stripeAccountId
            ? "PENDING"
            : "NOT_CONNECTED",

      stripeAccountId:
        seller.stripeAccountId || "",
    },

    stripe: {
      detailsSubmitted:
        Boolean(
          stripeAccount?.details_submitted,
        ),

      payoutsEnabled:
        Boolean(
          stripeAccount?.payouts_enabled,
        ),

      requirementsDue:
        Array.isArray(
          stripeAccount
            ?.requirements
            ?.currently_due,
        )
          ? stripeAccount
              .requirements
              .currently_due
              .length
          : 0,
    },

    payoutsComplete:
      connected ||
      onboarding.payoutsComplete,
  };
};


export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const { seller } =
    await requireSellerSession(request);

  try {
    let accountId =
      seller.stripeAccountId;

    if (!accountId) {
      const account =
        await stripe.accounts.create({
          type: "express",
          country: "US",

          email:
            seller.email ||
            undefined,

          business_profile: {
            name:
              seller.businessName,
          },

          capabilities: {
            transfers: {
              requested: true,
            },
          },

          metadata: {
            hairgrabSellerId:
              seller.id,

            hairgrabSellerCode:
              seller.sellerCode,
          },
        });

      accountId =
        account.id;

      await db.seller.update({
        where: {
          id: seller.id,
        },

        data: {
          stripeAccountId:
            accountId,

          payoutStatus:
            "PENDING",
        },
      });
    }

    const baseUrl =
      appBaseUrl(request);

    const accountLink =
      await stripe.accountLinks.create({
        account: accountId,

        refresh_url:
          `${baseUrl}/seller/onboarding/payouts?stripe=refresh`,

        return_url:
          `${baseUrl}/seller/onboarding/payouts?stripe=return`,

        type:
          "account_onboarding",
      });

    return redirect(
      accountLink.url,
    );
  } catch (error) {
    console.error(
      "[HairGrab Core] Stripe Connect onboarding error:",
      error,
    );

    return {
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "HairGrab could not start Stripe payout setup.",
    };
  }
};


export default function SellerPayoutsOnboardingPage() {
  const {
    seller,
    stripe,
    payoutsComplete,
  } =
    useLoaderData<typeof loader>();

  const actionData =
    useActionData<typeof action>();

  const connected =
    seller.payoutStatus ===
    "CONNECTED";

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
            Payouts
          </h1>

          <p
            style={{
              color: "#756b79",
              fontSize: "13px",
              lineHeight: 1.6,
              margin: "0 0 18px",
            }}
          >
            Connect your payout account so HairGrab can send your seller earnings securely through Stripe.
          </p>

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

          {connected ? (
            <>
              <div
                style={{
                  background: "#edf8ef",
                  color: "#28743b",
                  borderRadius: "11px",
                  padding: "15px",
                  fontSize: "13px",
                  fontWeight: "800",
                  marginBottom: "16px",
                }}
              >
                ✓ Stripe payout account connected
              </div>

              <StatusRow
                label="Account details"
                value={
                  stripe.detailsSubmitted
                    ? "Complete"
                    : "Needs attention"
                }
              />

              <StatusRow
                label="Payouts"
                value={
                  stripe.payoutsEnabled
                    ? "Enabled"
                    : "Pending"
                }
              />

              {stripe.requirementsDue > 0 && (
                <div
                  style={{
                    marginTop: "14px",
                    color: "#8a5d13",
                    background: "#fff8e7",
                    border:
                      "1px solid #f2dfad",
                    borderRadius: "10px",
                    padding: "12px",
                    fontSize: "12px",
                  }}
                >
                  Stripe still has{" "}
                  {stripe.requirementsDue}{" "}
                  requirement
                  {stripe.requirementsDue === 1
                    ? ""
                    : "s"}{" "}
                  that may need attention.
                </div>
              )}

              <Link
                to="/seller/onboarding"
                style={{
                  display: "block",
                  marginTop: "20px",
                  width: "100%",
                  boxSizing: "border-box",
                  textAlign: "center",
                  background: "#4B1678",
                  color: "#ffffff",
                  borderRadius: "9px",
                  padding: "12px 17px",
                  textDecoration: "none",
                  fontWeight: "800",
                }}
              >
                Continue Seller Setup
              </Link>
            </>
          ) : (
            <>
              <div
                style={{
                  border:
                    "1px solid #e5dce9",
                  borderRadius: "11px",
                  padding: "16px",
                  background: "#faf8fc",
                }}
              >
                <div
                  style={{
                    color: "#4B1678",
                    fontWeight: "800",
                    fontSize: "14px",
                  }}
                >
                  {seller.stripeAccountId
                    ? "Finish Stripe Setup"
                    : "Connect with Stripe"}
                </div>

                <div
                  style={{
                    color: "#756b79",
                    fontSize: "12px",
                    lineHeight: 1.55,
                    marginTop: "6px",
                  }}
                >
                  Stripe securely collects your banking, identity and tax information. HairGrab does not store your bank account number.
                </div>
              </div>

              <Form method="post">
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
                  {seller.stripeAccountId
                    ? "Continue Stripe Setup"
                    : "Connect Payout Account"}
                </button>
              </Form>
            </>
          )}

          {payoutsComplete &&
            !connected && (
              <div
                style={{
                  marginTop: "16px",
                  background: "#fff8e7",
                  border:
                    "1px solid #f2dfad",
                  borderRadius: "10px",
                  padding: "12px",
                  color: "#8a5d13",
                  fontSize: "12px",
                }}
              >
                HairGrab previously marked payouts complete, but Stripe is not currently reporting payouts as enabled. Please finish Stripe setup.
              </div>
            )}
        </div>
      </div>
    </div>
  );
}


function StatusRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "14px",
        borderBottom:
          "1px solid #eee7f2",
        padding: "11px 0",
        fontSize: "12px",
      }}
    >
      <span
        style={{
          color: "#756b79",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          color: "#4B1678",
        }}
      >
        {value}
      </strong>
    </div>
  );
}