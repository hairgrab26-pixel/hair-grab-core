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


// ==========================================================
// LOADER
// ==========================================================

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
        status: 404,
      },
    );
  }

  return {
    seller: {
      businessName:
        seller.businessName,

      sellsNationwide:
        seller.sellsNationwide,

      nationwideShippingMethod:
        seller.nationwideShippingMethod,

      offersLocalPickup:
        seller.offersLocalPickup,

      offersLocalDelivery:
        seller.offersLocalDelivery,
    },

    fulfillmentComplete:
      onboarding.fulfillmentComplete,
  };
};


// ==========================================================
// ACTION
// ==========================================================

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


    const nationwideShippingMethod =
      String(
        formData.get(
          "nationwideShippingMethod",
        ) ||
          "",
      )
        .trim()
        .toUpperCase();


    const offersLocalPickup =
      formData.get(
        "offersLocalPickup",
      ) === "on";


    const offersLocalDelivery =
      formData.get(
        "offersLocalDelivery",
      ) === "on";


    const allowedShippingMethods =
      [
        "SELLER_MANAGED",
        "HAIRGRAB_SHIPPING",
      ];


    if (
      !allowedShippingMethods.includes(
        nationwideShippingMethod,
      )
    ) {
      return {
        success: false,

        message:
          "Choose how you want to handle nationwide shipping.",
      };
    }


    const sellsNationwide =
      true;


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

          nationwideShippingMethod,

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
      success: false,

      message:
        "HairGrab could not save your shipping and fulfillment settings.",
    };
  }
};


// ==========================================================
// PAGE
// ==========================================================

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


  const defaultShippingMethod =
    seller.nationwideShippingMethod ||
    "SELLER_MANAGED";


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
            Choose how you want to
            fulfill HairGrab orders.
            You can update these
            settings later.
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
              Your shipping setup is
              already complete. You
              can update it here if
              needed.
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

            {/* ================================================
                NATIONWIDE SHIPPING
            ================================================= */}

            <div
              style={{
                marginBottom:
                  "18px",
              }}
            >
              <div
                style={{
                  color:
                    "#4B1678",

                  fontSize:
                    "14px",

                  fontWeight:
                    "800",

                  marginBottom:
                    "5px",
                }}
              >
                Nationwide Shipping
              </div>

              <div
                style={{
                  color:
                    "#756b79",

                  fontSize:
                    "11px",

                  lineHeight:
                    1.55,

                  marginBottom:
                    "10px",
                }}
              >
                Choose the default
                way you want to ship
                HairGrab orders
                across the U.S.
              </div>


              <RadioChoice
                name="nationwideShippingMethod"
                value="SELLER_MANAGED"
                title="I'll Handle My Own Shipping"
                description="Use your own carrier, shipping account or label process. You remain responsible for shipping the order and providing tracking."
                defaultChecked={
                  defaultShippingMethod ===
                  "SELLER_MANAGED"
                }
              />


              <RadioChoice
                name="nationwideShippingMethod"
                value="HAIRGRAB_SHIPPING"
                title="Use HairGrab Shipping"
                description="HairGrab will provide an available shipping-label option through the seller portal. You still pack and hand the order to the carrier."
                defaultChecked={
                  defaultShippingMethod ===
                  "HAIRGRAB_SHIPPING"
                }
              />


              <div
                style={{
                  marginTop:
                    "10px",

                  background:
                    "#f7f2fa",

                  border:
                    "1px solid #eadff0",

                  borderRadius:
                    "10px",

                  padding:
                    "11px",

                  color:
                    "#6f6675",

                  fontSize:
                    "10px",

                  lineHeight:
                    1.55,
                }}
              >
                HairGrab does not
                physically ship your
                packages. HairGrab
                Shipping is a label
                and shipping-service
                option for sellers who
                want help with the
                shipping process.
              </div>
            </div>


            {/* ================================================
                ADDITIONAL OPTIONS
            ================================================= */}

            <div
              style={{
                marginTop:
                  "22px",

                marginBottom:
                  "10px",
              }}
            >
              <div
                style={{
                  color:
                    "#4B1678",

                  fontSize:
                    "14px",

                  fontWeight:
                    "800",

                  marginBottom:
                    "5px",
                }}
              >
                Additional Fulfillment Options
              </div>

              <div
                style={{
                  color:
                    "#756b79",

                  fontSize:
                    "11px",

                  lineHeight:
                    1.55,

                  marginBottom:
                    "10px",
                }}
              >
                These are optional
                and can be offered in
                addition to nationwide
                shipping.
              </div>


              <CheckboxChoice
                name="offersLocalPickup"
                title="Local Pickup"
                description="Nearby shoppers may pick up eligible orders directly from your approved pickup location."
                defaultChecked={
                  seller.offersLocalPickup
                }
              />


              <CheckboxChoice
                name="offersLocalDelivery"
                title="HairGrab Same-Day Delivery"
                description="Eligible nearby orders may be delivered by a HairGrab courier partner. HairGrab will request the courier after you mark the order ready for pickup."
                defaultChecked={
                  seller.offersLocalDelivery
                }
              />
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
              Product-specific shipping
              speed, inventory and
              eligibility details are
              handled with the product
              listing so you do not
              have to enter the same
              information twice.
            </div>


            <button
              type="submit"
              style={{
                width:
                  "100%",

                border:
                  0,

                background:
                  "#4B1678",

                color:
                  "#ffffff",

                borderRadius:
                  "9px",

                padding:
                  "13px 17px",

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


// ==========================================================
// COMPONENTS
// ==========================================================

function RadioChoice({
  name,
  value,
  title,
  description,
  defaultChecked,
}: {
  name: string;
  value: string;
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
          "10px",

        cursor:
          "pointer",

        background:
          "#ffffff",
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
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


function CheckboxChoice({
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
          "10px",

        cursor:
          "pointer",

        background:
          "#ffffff",
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