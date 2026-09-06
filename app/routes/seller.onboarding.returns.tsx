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


const RETURN_OPTIONS = [
  {
    value:
      "14_DAY_RETURNS",

    label:
      "14-Day Returns",

    description:
      "Shoppers may request a return within 14 days, subject to HairGrab and seller return conditions.",
  },

  {
    value:
      "FINAL_SALE",

    label:
      "Final Sale",

    description:
      "Eligible products are sold as final sale and are not returnable unless required by law or HairGrab policy.",
  },
];


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  const onboarding =
    await db.sellerOnboarding.findUnique({
      where: {
        sellerId:
          seller.id,
      },
    });

  if (!onboarding) {
    throw new Response(
      "Seller onboarding record was not found.",
      {
        status:
          404,
      },
    );
  }

  return {
    seller: {
      businessName:
        seller.businessName,

      returnPolicy:
        seller.returnPolicy ||
        "14_DAY_RETURNS",
    },

    returnsComplete:
      onboarding.returnsComplete,
  };
};


export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  try {
    const formData =
      await request.formData();

    const returnPolicy =
      String(
        formData.get(
          "returnPolicy",
        ) ||
        "",
      ).trim();

    if (
      !RETURN_OPTIONS.some(
        (option) =>
          option.value ===
          returnPolicy,
      )
    ) {
      return {
        success:
          false,

        message:
          "Choose a return policy.",
      };
    }

    const now =
      new Date();

    await db.$transaction([
      db.seller.update({
        where: {
          id:
            seller.id,
        },

        data: {
          returnPolicy,
        },
      }),

      db.sellerOnboarding.update({
        where: {
          sellerId:
            seller.id,
        },

        data: {
          returnsComplete:
            true,

          returnsCompletedAt:
            now,

          currentStep:
            "PAYOUTS",

          status:
            "IN_PROGRESS",

          lastSavedAt:
            now,
        },
      }),
    ]);

    return redirect(
      "/seller/onboarding",
    );
  } catch (error) {
    console.error(
      "[HairGrab Core] Returns onboarding error:",
      error,
    );

    return {
      success:
        false,

      message:
        "HairGrab could not save your return policy.",
    };
  }
};


export default function SellerReturnsOnboardingPage() {
  const {
    seller,
    returnsComplete,
  } =
    useLoaderData<
      typeof loader
    >();

  const actionData =
    useActionData<
      typeof action
    >();

  return (
    <div
      style={{
        minHeight:
          "100vh",

        background:
          "#faf8fc",

        padding:
          "28px 18px 70px",

        fontFamily:
          "Arial, sans-serif",

        color:
          "#21152a",
      }}
    >
      <div
        style={{
          maxWidth:
            "720px",

          margin:
            "0 auto",
        }}
      >
        <Link
          to="/seller/onboarding"
          style={{
            color:
              "#4B1678",

            textDecoration:
              "none",

            fontWeight:
              "800",

            fontSize:
              "12px",
          }}
        >
          ← Back to Seller Setup
        </Link>

        <div
          style={{
            background:
              "#ffffff",

            border:
              "1px solid #e5dce9",

            borderRadius:
              "16px",

            padding:
              "24px",

            marginTop:
              "12px",
          }}
        >
          <div
            style={{
              color:
                "#7b3fa0",

              fontSize:
                "11px",

              fontWeight:
                "800",

              letterSpacing:
                "1px",

              textTransform:
                "uppercase",
            }}
          >
            HairGrab Seller Setup
          </div>

          <h1
            style={{
              color:
                "#4B1678",

              margin:
                "6px 0 5px",

              fontSize:
                "28px",
            }}
          >
            Returns
          </h1>

          <p
            style={{
              color:
                "#756b79",

              fontSize:
                "13px",

              lineHeight:
                1.6,

              margin:
                "0 0 18px",
            }}
          >
            Choose the return policy shoppers will see on your HairGrab products.
          </p>

          {returnsComplete && (
            <div
              style={{
                background:
                  "#edf8ef",

                color:
                  "#28743b",

                padding:
                  "10px 12px",

                borderRadius:
                  "9px",

                fontSize:
                  "12px",

                fontWeight:
                  "700",

                marginBottom:
                  "16px",
              }}
            >
              Your return policy is already saved. You can update it here if needed.
            </div>
          )}

          {actionData && (
            <div
              style={{
                background:
                  "#fff1f1",

                color:
                  "#922f2f",

                borderRadius:
                  "9px",

                padding:
                  "11px",

                fontSize:
                  "12px",

                fontWeight:
                  "700",

                marginBottom:
                  "16px",
              }}
            >
              {actionData.message}
            </div>
          )}

          <Form method="post">
            <div
              style={{
                display:
                  "grid",

                gap:
                  "11px",
              }}
            >
              {RETURN_OPTIONS.map(
                (option) => (
                  <label
                    key={
                      option.value
                    }
                    style={{
                      display:
                        "flex",

                      alignItems:
                        "flex-start",

                      gap:
                        "12px",

                      border:
                        "1px solid #e5dce9",

                      borderRadius:
                        "11px",

                      padding:
                        "14px",

                      cursor:
                        "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="returnPolicy"
                      value={
                        option.value
                      }
                      defaultChecked={
                        seller.returnPolicy ===
                        option.value
                      }
                      style={{
                        marginTop:
                          "3px",
                      }}
                    />

                    <div>
                      <div
                        style={{
                          color:
                            "#4B1678",

                          fontSize:
                            "13px",

                          fontWeight:
                            "800",
                        }}
                      >
                        {option.label}
                      </div>

                      <div
                        style={{
                          color:
                            "#756b79",

                          fontSize:
                            "11px",

                          lineHeight:
                            1.5,

                          marginTop:
                            "4px",
                        }}
                      >
                        {option.description}
                      </div>
                    </div>
                  </label>
                ),
              )}
            </div>

            <div
              style={{
                marginTop:
                  "18px",

                background:
                  "#f7f2fa",

                border:
                  "1px solid #eadff0",

                borderRadius:
                  "10px",

                padding:
                  "12px",

                color:
                  "#6f6675",

                fontSize:
                  "11px",

                lineHeight:
                  1.55,
              }}
            >
              You can still make product-specific return decisions later if HairGrab adds that option. This setting is your default store policy.
            </div>

            <button
              type="submit"
              style={{
                border:
                  0,

                background:
                  "#4B1678",

                color:
                  "#ffffff",

                borderRadius:
                  "9px",

                padding:
                  "12px 17px",

                fontWeight:
                  "800",

                marginTop:
                  "20px",

                cursor:
                  "pointer",
              }}
            >
              Save & Continue
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
