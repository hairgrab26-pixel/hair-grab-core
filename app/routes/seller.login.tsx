import type { ActionFunctionArgs } from "react-router";

import {
  Form,
  useActionData,
  useNavigation,
} from "react-router";

import crypto from "node:crypto";

import db from "../db.server";


// ==========================================================
// HELPERS
// ==========================================================

function normalizeEmail(
  value: FormDataEntryValue | null,
) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


function isValidEmail(
  value: string,
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );
}


function hashToken(
  token: string,
) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}


// ==========================================================
// ACTION
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {

  const formData =
    await request.formData();


  const email =
    normalizeEmail(
      formData.get("email"),
    );


  if (!email) {
    return {
      success: false,
      message:
        "Enter your email address.",
    };
  }


  if (!isValidEmail(email)) {
    return {
      success: false,
      message:
        "Enter a valid email address.",
    };
  }


  try {

    const portalAccount =
      await db.sellerPortalAccount.findUnique({
        where: {
          email,
        },

        include: {
          seller:
            true,
        },
      });


    // Do not reveal whether an email exists.
    // Always return a generic success message.
    if (
      !portalAccount ||
      portalAccount.status ===
        "DISABLED"
    ) {
      return {
        success: true,
        message:
          "If a HairGrab seller account exists for this email, a sign-in link will be sent.",
      };
    }


    const rawToken =
      crypto.randomBytes(
        32,
      ).toString("hex");


    const tokenHash =
      hashToken(
        rawToken,
      );


    const expiresAt =
      new Date(
        Date.now() +
          15 * 60 * 1000,
      );


    await db.sellerLoginToken.create({
      data: {
        portalAccountId:
          portalAccount.id,

        tokenHash,

        expiresAt,
      },
    });


    // ======================================================
    // TEMPORARY DEV OUTPUT
    //
    // We are returning the link on-screen only while
    // building/testing. Once email delivery is connected,
    // this dev link will be removed.
    // ======================================================

    const loginUrl =
      `/seller/login/verify?token=${rawToken}`;


    return {
      success: true,

      message:
        "Your HairGrab sign-in link is ready.",

      loginUrl,
    };

  } catch (error) {

    console.error(
      "[HairGrab Core] Seller login request error:",
      error,
    );


    return {
      success: false,

      message:
        "We couldn't create your sign-in link right now. Please try again.",
    };
  }
};


// ==========================================================
// STYLES
// ==========================================================

const pageStyle = {
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
};


const cardStyle = {
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
};


const inputStyle = {
  width:
    "100%",
  boxSizing:
    "border-box" as const,
  border:
    "1px solid #d8cce0",
  borderRadius:
    "10px",
  padding:
    "12px 13px",
  fontSize:
    "15px",
  color:
    "#21152a",
  background:
    "#ffffff",
};


// ==========================================================
// PAGE
// ==========================================================

export default function SellerLoginPage() {

  const actionData =
    useActionData<
      typeof action
    >();


  const navigation =
    useNavigation();


  const submitting =
    navigation.state ===
    "submitting";


  return (
    <div style={pageStyle}>
      <div style={cardStyle}>

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
                "250px",
              maxWidth:
                "82%",
              height:
                "auto",
              marginBottom:
                "12px",
            }}
          />


          <h1
            style={{
              margin:
                "0",
              color:
                "#4B1678",
              fontSize:
                "28px",
            }}
          >
            Seller Sign In
          </h1>


          <p
            style={{
              color:
                "#706776",
              fontSize:
                "14px",
              lineHeight:
                "1.6",
              margin:
                "10px 0 0",
            }}
          >
            Enter the email address connected to your HairGrab seller account.
          </p>
        </div>


        {actionData?.message && (
          <div
            style={{
              marginBottom:
                "18px",
              padding:
                "13px 14px",
              borderRadius:
                "10px",
              background:
                actionData.success
                  ? "#eef8f0"
                  : "#fff2f2",
              border:
                actionData.success
                  ? "1px solid #cbe3d0"
                  : "1px solid #efcaca",
              color:
                actionData.success
                  ? "#2f6b3c"
                  : "#922f2f",
              fontSize:
                "13px",
              fontWeight:
                "700",
            }}
          >
            {actionData.message}
          </div>
        )}


        <Form
          method="post"
        >
          <label
            htmlFor="email"
            style={{
              display:
                "block",
              fontSize:
                "13px",
              fontWeight:
                "700",
              color:
                "#35263e",
              marginBottom:
                "7px",
            }}
          >
            Email address
          </label>


          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            style={
              inputStyle
            }
          />


          <button
            type="submit"
            disabled={
              submitting
            }
            style={{
              width:
                "100%",
              marginTop:
                "16px",
              border:
                "none",
              borderRadius:
                "10px",
              background:
                submitting
                  ? "#8c72a0"
                  : "#4B1678",
              color:
                "#ffffff",
              padding:
                "13px 16px",
              fontSize:
                "14px",
              fontWeight:
                "800",
              cursor:
                submitting
                  ? "wait"
                  : "pointer",
            }}
          >
            {submitting
              ? "Creating sign-in link..."
              : "Continue"}
          </button>
        </Form>


        {actionData?.success &&
          actionData.loginUrl && (
            <div
              style={{
                marginTop:
                  "22px",
                padding:
                  "16px",
                border:
                  "1px solid #e1d3eb",
                borderRadius:
                  "10px",
                background:
                  "#faf7fc",
              }}
            >
              <div
                style={{
                  color:
                    "#4B1678",
                  fontWeight:
                    "800",
                  fontSize:
                    "13px",
                  marginBottom:
                    "8px",
                }}
              >
                Development sign-in link
              </div>


              <a
                href={
                  actionData.loginUrl
                }
                style={{
                  color:
                    "#4B1678",
                  fontWeight:
                    "700",
                  fontSize:
                    "13px",
                  wordBreak:
                    "break-all",
                }}
              >
                Open HairGrab Seller Account
              </a>


              <div
                style={{
                  marginTop:
                    "8px",
                  color:
                    "#817787",
                  fontSize:
                    "11px",
                  lineHeight:
                    "1.5",
                }}
              >
                This temporary link is shown only while we are building the seller portal. It expires in 15 minutes.
              </div>
            </div>
          )}

      </div>
    </div>
  );
}