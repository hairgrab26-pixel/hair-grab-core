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

      sellsNationwide:
        seller.sellsNationwide,

      offersLocalPickup:
        seller.offersLocalPickup,

      offersLocalDelivery:
        seller.offersLocalDelivery,
    },

    fulfillmentComplete:
      onboarding.fulfillmentComplete,
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

    const sellsNationwide =
      formData.get(
        "sellsNationwide",
      ) ===
      "on";

    const offersLocalPickup =
      formData.get(
        "offersLocalPickup",
      ) ===
      "on";

    const offersLocalDelivery =
      formData.get(
        "offersLocalDelivery",
      ) ===
      "on";

    if (
      !sellsNationwide &&
      !offersLocalPickup &&
      !offersLocalDelivery
    ) {
      return {
        success:
          false,

        message:
          "Choose at least one fulfillment option.",
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
          sellsNationwide,
          offersLocalPickup,
          offersLocalDelivery,
        },
      }),

      db.sellerOnboarding.update({
        where: {
          sellerId:
            seller.id,
        },

        data: {
          fulfillmentComplete:
            true,

          fulfillmentCompletedAt:
            now,

          currentStep:
            "RETURNS",

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
      "[HairGrab Core] Fulfillment onboarding error:",
      error,
    );

    return {
      success:
        false,

      message:
        "HairGrab could not save your fulfillment settings.",
    };
  }
};


export default function SellerFulfillmentOnboardingPage() {
  const {
    seller,
    fulfillmentComplete,
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
            Shipping & Fulfillment
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
            Tell HairGrab how shoppers can receive your products. You can change these settings later.
          </p>

          {fulfillmentComplete && (
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
              Your fulfillment setup is already complete. You can update it here if needed.
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
            <Choice
              name="sellsNationwide"
              title="Ships Nationwide"
              description="Your products can be shipped to shoppers across the U.S."
              defaultChecked={
                seller.sellsNationwide
              }
            />

            <Choice
              name="offersLocalPickup"
              title="Local Pickup"
              description="Nearby shoppers may pick up eligible orders using the pickup instructions HairGrab provides."
              defaultChecked={
                seller.offersLocalPickup
              }
            />

            <Choice
              name="offersLocalDelivery"
              title="Local Delivery"
              description="Eligible nearby orders may be offered for local delivery when this option is available."
              defaultChecked={
                seller.offersLocalDelivery
              }
            />

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
              Shipping speed, inventory and product-specific fulfillment details are handled with the product listing so sellers do not have to enter the same information twice.
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


function Choice({
  name,
  title,
  description,
  defaultChecked,
}: {
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label
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

        marginTop:
          "11px",

        cursor:
          "pointer",
      }}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={
          defaultChecked
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
          {title}
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
          {description}
        </div>
      </div>
    </label>
  );
}
