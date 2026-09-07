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


// ==========================================================
// SESSION HELPERS
// ==========================================================

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


function safeEqual(
  first: string,
  second: string,
) {
  try {

    const a =
      Buffer.from(
        first,
        "utf8",
      );

    const b =
      Buffer.from(
        second,
        "utf8",
      );


    if (
      a.length !==
      b.length
    ) {
      return false;
    }


    return crypto.timingSafeEqual(
      a,
      b,
    );

  } catch {

    return false;
  }
}


function getCookie(
  request: Request,
  name: string,
) {

  const cookieHeader =
    request.headers.get(
      "Cookie",
    );


  if (!cookieHeader) {
    return null;
  }


  const cookies =
    cookieHeader.split(";");


  for (
    const cookie of cookies
  ) {

    const [cookieName, ...rest] =
      cookie
        .trim()
        .split("=");


    if (
      cookieName ===
      name
    ) {
      return rest.join("=") || null;
    }
  }


  return null;
}


type SellerSessionPayload = {
  sellerId: string;
  portalAccountId: string;
  expiresAt: number;
};


function readSellerSession(
  request: Request,
): SellerSessionPayload | null {

  const sessionValue =
    getCookie(
      request,
      SELLER_SESSION_COOKIE,
    );


  if (!sessionValue) {
    return null;
  }


  const parts =
    sessionValue.split(".");


  if (
    parts.length !==
    2
  ) {
    return null;
  }


  const [
    encodedPayload,
    suppliedSignature,
  ] = parts;


  const expectedSignature =
    signValue(
      encodedPayload,
    );


  if (
    !safeEqual(
      suppliedSignature,
      expectedSignature,
    )
  ) {
    return null;
  }


  try {

    const payload =
      JSON.parse(
        Buffer
          .from(
            encodedPayload,
            "base64url",
          )
          .toString(
            "utf8",
          ),
      ) as SellerSessionPayload;


    if (
      !payload.sellerId ||
      !payload.portalAccountId ||
      !payload.expiresAt
    ) {
      return null;
    }


    if (
      payload.expiresAt <
      Date.now()
    ) {
      return null;
    }


    return payload;

  } catch {

    return null;
  }
}


// ==========================================================
// LOADER
// ==========================================================

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {

  const session =
    readSellerSession(
      request,
    );


  if (!session) {
    return redirect(
      "/seller/login",
    );
  }


  const portalAccount =
    await db.sellerPortalAccount.findUnique({
      where: {
        id:
          session.portalAccountId,
      },
    });


  if (
    !portalAccount ||
    portalAccount.sellerId !==
      session.sellerId ||
    portalAccount.status !==
      "ACTIVE"
  ) {
    return redirect(
      "/seller/login",
    );
  }


  const seller =
    await db.seller.findUnique({
      where: {
        id:
          session.sellerId,
      },
    });


  if (!seller) {
    return redirect(
      "/seller/login",
    );
  }


  if (
    seller.status ===
      "SUSPENDED" ||
    seller.status ===
      "INACTIVE" ||
    seller.status ===
      "CLOSED"
  ) {
    return redirect(
      "/seller/login",
    );
  }


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
    seller,
    onboarding,

    portalAccount: {
      firstName:
        portalAccount.firstName,

      email:
        portalAccount.email,
    },
  };
};


// ==========================================================
// DISPLAY HELPERS
// ==========================================================

function yesNo(
  value: boolean,
) {
  return value
    ? "Yes"
    : "No";
}


function displayValue(
  value:
    | string
    | null
    | undefined,
) {
  return value?.trim()
    ? value
    : "Not provided yet";
}


// ==========================================================
// STYLES
// ==========================================================

const pageStyle = {
  minHeight:
    "100vh",
  background:
    "#faf8fc",
  padding:
    "30px 18px 60px",
  fontFamily:
    "Arial, sans-serif",
  color:
    "#21152a",
};


const shellStyle = {
  maxWidth:
    "900px",
  margin:
    "0 auto",
};


const cardStyle = {
  background:
    "#ffffff",
  border:
    "1px solid #e6d9ef",
  borderRadius:
    "16px",
  padding:
    "22px",
  boxShadow:
    "0 3px 12px rgba(75, 22, 120, 0.06)",
};


const labelStyle = {
  fontSize:
    "11px",
  color:
    "#817787",
  marginBottom:
    "4px",
};


const valueStyle = {
  fontSize:
    "14px",
  color:
    "#2b1b35",
  fontWeight:
    "700",
};


function ChecklistRow({
  title,
  description,
  complete,
  current = false,
}: {
  title: string;
  description: string;
  complete: boolean;
  current?: boolean;
}) {

  return (
    <div
      style={{
        display:
          "flex",
        alignItems:
          "flex-start",
        gap:
          "13px",
        padding:
          "16px 0",
        borderBottom:
          "1px solid #eee7f2",
      }}
    >

      <div
        style={{
          width:
            "28px",
          height:
            "28px",
          minWidth:
            "28px",
          borderRadius:
            "50%",
          display:
            "flex",
          alignItems:
            "center",
          justifyContent:
            "center",
          fontSize:
            "13px",
          fontWeight:
            "800",

          background:
            complete
              ? "#eaf7ed"
              : current
                ? "#f0e6f7"
                : "#f4f1f6",

          color:
            complete
              ? "#347143"
              : current
                ? "#4B1678"
                : "#887f8c",
        }}
      >
        {complete
          ? "✓"
          : current
            ? "→"
            : "•"}
      </div>


      <div>
        <div
          style={{
            color:
              complete
                ? "#347143"
                : "#4B1678",
            fontSize:
              "14px",
            fontWeight:
              "800",
          }}
        >
          {title}
        </div>

        <div
          style={{
            color:
              "#766d7a",
            fontSize:
              "12px",
            lineHeight:
              "1.5",
            marginTop:
              "4px",
          }}
        >
          {description}
        </div>
      </div>

    </div>
  );
}


// ==========================================================
// PAGE
// ==========================================================

export default function SellerOnboardingPage() {

  const {
    seller,
    onboarding,
    portalAccount,
  } =
    useLoaderData<
      typeof loader
    >();


  const firstName =
    portalAccount.firstName ||
    seller.contactFirstName ||
    "Seller";


  const currentStep =
    onboarding.currentStep;


  return (
    <div style={pageStyle}>
      <div style={shellStyle}>

        {/* LOGO */}

        <div
          style={{
            textAlign:
              "center",
            marginBottom:
              "24px",
          }}
        >
          <img
            src="/hairgrab-logo.png"
            alt="HairGrab"
            style={{
              width:
                "260px",
              maxWidth:
                "76%",
              height:
                "auto",
            }}
          />
        </div>


        {/* WELCOME */}

        <div
          style={{
            ...cardStyle,
            marginBottom:
              "18px",
          }}
        >
          <div
            style={{
              color:
                "#7b3fa0",
              fontSize:
                "12px",
              fontWeight:
                "800",
              textTransform:
                "uppercase",
              letterSpacing:
                "1.3px",
            }}
          >
            HairGrab Seller Setup
          </div>


          <h1
            style={{
              margin:
                "7px 0 8px",
              color:
                "#4B1678",
              fontSize:
                "29px",
            }}
          >
            Welcome, {firstName}
          </h1>


          <p
            style={{
              margin:
                "0",
              color:
                "#6f6675",
              fontSize:
                "14px",
              lineHeight:
                "1.6",
            }}
          >
            Your HairGrab seller account is approved.
            We already carried your registration
            information into your account, so you
            won't need to enter it again.
          </p>


          <div
            style={{
              display:
                "flex",
              gap:
                "12px",
              flexWrap:
                "wrap",
              marginTop:
                "18px",
            }}
          >
            <div
              style={{
                background:
                  "#f6effa",
                border:
                  "1px solid #dfd0e9",
                borderRadius:
                  "9px",
                padding:
                  "9px 12px",
                color:
                  "#4B1678",
                fontWeight:
                  "800",
                fontSize:
                  "12px",
              }}
            >
              Seller ID: {seller.sellerCode}
            </div>


            <div
              style={{
                background:
                  "#eef8f0",
                border:
                  "1px solid #cbe3d0",
                borderRadius:
                  "9px",
                padding:
                  "9px 12px",
                color:
                  "#347143",
                fontWeight:
                  "800",
                fontSize:
                  "12px",
              }}
            >
              Account Approved
            </div>
          </div>
        </div>


        {/* PROGRESS */}

        <div
          style={{
            ...cardStyle,
            marginBottom:
              "18px",
          }}
        >
          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              gap:
                "12px",
              alignItems:
                "center",
              flexWrap:
                "wrap",
              marginBottom:
                "4px",
            }}
          >
            <div>
              <h2
                style={{
                  margin:
                    "0",
                  color:
                    "#4B1678",
                  fontSize:
                    "20px",
                }}
              >
                Finish your seller setup
              </h2>

              <div
                style={{
                  color:
                    "#817787",
                  fontSize:
                    "12px",
                  marginTop:
                    "4px",
                }}
              >
                Status: {onboarding.status}
              </div>
            </div>


            <div
              style={{
                color:
                  "#4B1678",
                background:
                  "#f6effa",
                padding:
                  "7px 10px",
                borderRadius:
                  "8px",
                fontSize:
                  "11px",
                fontWeight:
                  "800",
              }}
            >
              Current step: {currentStep}
            </div>
          </div>


          <ChecklistRow
            title="Business details"
            description="Confirm the remaining legal and business information HairGrab needs."
            complete={
              onboarding.businessComplete
            }
            current={
              currentStep ===
              "BUSINESS"
            }
          />


          <ChecklistRow
            title="Storefront"
            description="Add your storefront description, logo and public seller information."
            complete={
              onboarding.storefrontComplete
            }
            current={
              currentStep ===
              "STOREFRONT"
            }
          />


          <ChecklistRow
            title="Shipping & fulfillment"
            description="Confirm shipping speed, nationwide shipping, local pickup, local delivery and HairGrab Same-Day Delivery."
            complete={
              onboarding.fulfillmentComplete
            }
            current={
              currentStep ===
              "FULFILLMENT"
            }
          />


          <ChecklistRow
            title="Returns"
            description="Choose the return policy shoppers will see on your HairGrab products."
            complete={
              onboarding.returnsComplete
            }
            current={
              currentStep ===
              "RETURNS"
            }
          />


          <ChecklistRow
            title="Payouts"
            description="Connect your payout account so HairGrab can send your seller earnings."
            complete={
              onboarding.payoutsComplete
            }
            current={
              currentStep ===
              "PAYOUTS"
            }
          />


          <ChecklistRow
            title="Seller agreements"
            description="Review and accept HairGrab marketplace seller terms."
            complete={
              onboarding.agreementsComplete
            }
            current={
              currentStep ===
              "AGREEMENTS"
            }
          />


          <ChecklistRow
            title="Products"
            description="Add products manually or import your hair catalog when you're ready."
            complete={
              onboarding.productsComplete
            }
            current={
              currentStep ===
              "PRODUCTS"
            }
          />

        </div>


        {/* WHAT WE ALREADY KNOW */}

        <div style={cardStyle}>

          <div
            style={{
              marginBottom:
                "18px",
            }}
          >
            <h2
              style={{
                margin:
                  "0",
                color:
                  "#4B1678",
                fontSize:
                  "20px",
              }}
            >
              Already saved from your application
            </h2>

            <p
              style={{
                color:
                  "#817787",
                fontSize:
                  "12px",
                lineHeight:
                  "1.5",
                margin:
                  "5px 0 0",
              }}
            >
              HairGrab carried this information forward
              automatically.
            </p>
          </div>


          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(190px, 1fr))",
              gap:
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
                Seller ID
              </div>

              <div style={valueStyle}>
                {seller.sellerCode}
              </div>
            </div>


            <div>
              <div style={labelStyle}>
                Contact
              </div>

              <div style={valueStyle}>
                {displayValue(
                  [
                    seller.contactFirstName,
                    seller.contactLastName,
                  ]
                    .filter(Boolean)
                    .join(" "),
                )}
              </div>
            </div>


            <div>
              <div style={labelStyle}>
                Email
              </div>

              <div style={valueStyle}>
                {displayValue(
                  seller.email,
                )}
              </div>
            </div>


            <div>
              <div style={labelStyle}>
                Phone
              </div>

              <div style={valueStyle}>
                {displayValue(
                  seller.phone,
                )}
              </div>
            </div>


            <div>
              <div style={labelStyle}>
                ZIP Code
              </div>

              <div style={valueStyle}>
                {displayValue(
                  seller.postalCode,
                )}
              </div>
            </div>


            <div>
              <div style={labelStyle}>
                Ships Nationwide
              </div>

              <div style={valueStyle}>
                {yesNo(
                  seller.sellsNationwide,
                )}
              </div>
            </div>


            <div>
              <div style={labelStyle}>
                Local Pickup
              </div>

              <div style={valueStyle}>
                {yesNo(
                  seller.offersLocalPickup,
                )}
              </div>
            </div>


            <div>
              <div style={labelStyle}>
                Local Delivery
              </div>

              <div style={valueStyle}>
                {yesNo(
                  seller.offersLocalDelivery,
                )}
              </div>
            </div>


            <div>
              <div style={labelStyle}>
                HairGrab Same-Day Delivery
              </div>

              <div style={valueStyle}>
                {yesNo(
                  seller.offersSameDayDelivery,
                )}
              </div>
            </div>

          </div>


          <div
            style={{
              marginTop:
                "24px",
              paddingTop:
                "20px",
              borderTop:
                "1px solid #eee7f2",
            }}
          >
            <a
              href="/seller/onboarding/business"
              style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                textAlign: "center",
                border: "none",
                borderRadius: "10px",
                background: "#4B1678",
                color: "#ffffff",
                padding: "14px 18px",
                fontSize: "14px",
                fontWeight: "800",
                cursor: "pointer",
                textDecoration: "none",
              }}
            >
              Continue Seller Setup
            </a>


            <div
              style={{
                textAlign:
                  "center",
                color:
                  "#817787",
                fontSize:
                  "11px",
                lineHeight:
                  "1.5",
                marginTop:
                  "10px",
              }}
            >
              Your progress will save as you complete each section.
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
