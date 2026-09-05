import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
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


function signValue(value: string) {
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

  for (const cookie of cookies) {
    const [
      cookieName,
      ...rest
    ] =
      cookie
        .trim()
        .split("=");

    if (
      cookieName === name
    ) {
      return (
        rest.join("=") ||
        null
      );
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
    parts.length !== 2
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
// AUTHENTICATED SELLER
// ==========================================================

async function requireSeller(
  request: Request,
) {

  const session =
    readSellerSession(
      request,
    );

  if (!session) {
    throw redirect(
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
    throw redirect(
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
    throw redirect(
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
    throw redirect(
      "/seller/login",
    );
  }


  return {
    seller,
    portalAccount,
  };
}


// ==========================================================
// FORM HELPERS
// ==========================================================

function cleanText(
  value:
    | FormDataEntryValue
    | null,
) {
  return String(
    value || "",
  ).trim();
}


function cleanOptional(
  value:
    | FormDataEntryValue
    | null,
) {
  const cleaned =
    String(
      value || "",
    ).trim();

  return (
    cleaned ||
    null
  );
}


function isValidZip(
  value: string,
) {
  return /^\d{5}(-\d{4})?$/.test(
    value,
  );
}


function isValidState(
  value: string,
) {
  return /^[A-Za-z]{2}$/.test(
    value,
  );
}


// ==========================================================
// LOADER
// ==========================================================

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {

  const {
    seller,
    portalAccount,
  } =
    await requireSeller(
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
    seller,
    onboarding,

    portalAccount: {
      email:
        portalAccount.email,

      firstName:
        portalAccount.firstName,

      lastName:
        portalAccount.lastName,
    },
  };
};


// ==========================================================
// ACTION
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {

  const {
    seller,
  } =
    await requireSeller(
      request,
    );


  const formData =
    await request.formData();


  const legalBusinessName =
    cleanText(
      formData.get(
        "legalBusinessName",
      ),
    );


  const phone =
    cleanOptional(
      formData.get(
        "phone",
      ),
    );


  const website =
    cleanOptional(
      formData.get(
        "website",
      ),
    );


  const address1 =
    cleanText(
      formData.get(
        "address1",
      ),
    );


  const address2 =
    cleanOptional(
      formData.get(
        "address2",
      ),
    );


  const city =
    cleanText(
      formData.get(
        "city",
      ),
    );


  const state =
    cleanText(
      formData.get(
        "state",
      ),
    ).toUpperCase();


  const postalCode =
    cleanText(
      formData.get(
        "postalCode",
      ),
    );


  if (
    !legalBusinessName ||
    !address1 ||
    !city ||
    !state ||
    !postalCode
  ) {
    return {
      success:
        false,

      message:
        "Please complete all required business fields.",

      values: {
        legalBusinessName,
        phone:
          phone || "",
        website:
          website || "",
        address1,
        address2:
          address2 || "",
        city,
        state,
        postalCode,
      },
    };
  }


  if (
    !isValidState(
      state,
    )
  ) {
    return {
      success:
        false,

      message:
        "Please enter your two-letter state abbreviation.",

      values: {
        legalBusinessName,
        phone:
          phone || "",
        website:
          website || "",
        address1,
        address2:
          address2 || "",
        city,
        state,
        postalCode,
      },
    };
  }


  if (
    !isValidZip(
      postalCode,
    )
  ) {
    return {
      success:
        false,

      message:
        "Please enter a valid U.S. ZIP code.",

      values: {
        legalBusinessName,
        phone:
          phone || "",
        website:
          website || "",
        address1,
        address2:
          address2 || "",
        city,
        state,
        postalCode,
      },
    };
  }


  try {

    const now =
      new Date();


    await db.$transaction(
      async (tx) => {

        await tx.seller.update({
          where: {
            id:
              seller.id,
          },

          data: {
            legalBusinessName,

            phone,

            website,

            address1,

            address2,

            city,

            state,

            postalCode,

            country:
              "US",
          },
        });


        await tx.sellerOnboarding.update({
          where: {
            sellerId:
              seller.id,
          },

          data: {
            businessComplete:
              true,

            currentStep:
              "STOREFRONT",

            status:
              "IN_PROGRESS",

            startedAt:
              now,

            lastSavedAt:
              now,
          },
        });
      },
    );


    return redirect(
      "/seller/onboarding?business=saved",
    );

  } catch (error) {

    console.error(
      "[HairGrab Core] Business onboarding save error:",
      error,
    );


    return {
      success:
        false,

      message:
        "We couldn't save your business information right now. Please try again.",

      values: {
        legalBusinessName,
        phone:
          phone || "",
        website:
          website || "",
        address1,
        address2:
          address2 || "",
        city,
        state,
        postalCode,
      },
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
    "30px 18px 60px",
  fontFamily:
    "Arial, sans-serif",
  color:
    "#21152a",
};


const cardStyle = {
  maxWidth:
    "720px",
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
    "14px",
  color:
    "#21152a",
  background:
    "#ffffff",
};


const labelStyle = {
  display:
    "block",
  fontSize:
    "12px",
  fontWeight:
    "700",
  color:
    "#35263e",
  marginBottom:
    "6px",
};


const savedBoxStyle = {
  background:
    "#faf7fc",
  border:
    "1px solid #e4d8ec",
  borderRadius:
    "10px",
  padding:
    "12px 13px",
};


// ==========================================================
// PAGE
// ==========================================================

export default function SellerBusinessOnboardingPage() {

  const {
    seller,
    portalAccount,
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


  const saving =
    navigation.state ===
    "submitting";


  const values =
    actionData?.success ===
    false
      ? actionData.values
      : undefined;


  return (
    <div style={pageStyle}>

      <div
        style={{
          textAlign:
            "center",
          marginBottom:
            "22px",
        }}
      >
        <img
          src="/hairgrab-logo.png"
          alt="HairGrab"
          style={{
            width:
              "250px",
            maxWidth:
              "72%",
            height:
              "auto",
          }}
        />
      </div>


      <div style={cardStyle}>

        <div
          style={{
            color:
              "#7b3fa0",
            fontSize:
              "11px",
            fontWeight:
              "800",
            textTransform:
              "uppercase",
            letterSpacing:
              "1.3px",
            marginBottom:
              "6px",
          }}
        >
          Seller Setup · Business Details
        </div>


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
          Confirm your business
        </h1>


        <p
          style={{
            color:
              "#706776",
            fontSize:
              "13px",
            lineHeight:
              "1.6",
            margin:
              "8px 0 24px",
          }}
        >
          We already saved what you provided when
          you applied. Just complete the few business
          details HairGrab still needs.
        </p>


        {actionData?.success ===
          false &&
          actionData.message && (
            <div
              style={{
                background:
                  "#fff2f2",
                border:
                  "1px solid #efcaca",
                color:
                  "#922f2f",
                padding:
                  "12px 14px",
                borderRadius:
                  "10px",
                marginBottom:
                  "20px",
                fontSize:
                  "12px",
                fontWeight:
                  "700",
              }}
            >
              {
                actionData.message
              }
            </div>
          )}


        {/* ALREADY SAVED */}

        <div
          style={{
            marginBottom:
              "24px",
          }}
        >
          <div
            style={{
              color:
                "#4B1678",
              fontWeight:
                "800",
              fontSize:
                "14px",
              marginBottom:
                "12px",
            }}
          >
            Already saved
          </div>


          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(190px, 1fr))",
              gap:
                "12px",
            }}
          >
            <div
              style={
                savedBoxStyle
              }
            >
              <div
                style={{
                  color:
                    "#817787",
                  fontSize:
                    "10px",
                  marginBottom:
                    "4px",
                }}
              >
                Business Name
              </div>

              <div
                style={{
                  fontWeight:
                    "700",
                  fontSize:
                    "13px",
                }}
              >
                {
                  seller.businessName
                }
              </div>
            </div>


            <div
              style={
                savedBoxStyle
              }
            >
              <div
                style={{
                  color:
                    "#817787",
                  fontSize:
                    "10px",
                  marginBottom:
                    "4px",
                }}
              >
                Seller ID
              </div>

              <div
                style={{
                  fontWeight:
                    "700",
                  fontSize:
                    "13px",
                }}
              >
                {
                  seller.sellerCode
                }
              </div>
            </div>


            <div
              style={
                savedBoxStyle
              }
            >
              <div
                style={{
                  color:
                    "#817787",
                  fontSize:
                    "10px",
                  marginBottom:
                    "4px",
                }}
              >
                Contact Name
              </div>

              <div
                style={{
                  fontWeight:
                    "700",
                  fontSize:
                    "13px",
                }}
              >
                {[
                  seller.contactFirstName,
                  seller.contactLastName,
                ]
                  .filter(Boolean)
                  .join(" ") ||
                  "Not provided"}
              </div>
            </div>


            <div
              style={
                savedBoxStyle
              }
            >
              <div
                style={{
                  color:
                    "#817787",
                  fontSize:
                    "10px",
                  marginBottom:
                    "4px",
                }}
              >
                Account Email
              </div>

              <div
                style={{
                  fontWeight:
                    "700",
                  fontSize:
                    "13px",
                  wordBreak:
                    "break-word",
                }}
              >
                {
                  portalAccount.email
                }
              </div>
            </div>
          </div>
        </div>


        <Form method="post">

          <div
            style={{
              borderTop:
                "1px solid #eee7f2",
              paddingTop:
                "22px",
            }}
          >
            <div
              style={{
                color:
                  "#4B1678",
                fontWeight:
                  "800",
                fontSize:
                  "14px",
                marginBottom:
                  "16px",
              }}
            >
              Complete your business details
            </div>


            <div>
              <label
                htmlFor="legalBusinessName"
                style={
                  labelStyle
                }
              >
                Legal business name *
              </label>

              <input
                id="legalBusinessName"
                name="legalBusinessName"
                required
                defaultValue={
                  values?.legalBusinessName ??
                  seller.legalBusinessName ??
                  seller.businessName
                }
                style={
                  inputStyle
                }
              />

              <div
                style={{
                  color:
                    "#817787",
                  fontSize:
                    "10px",
                  marginTop:
                    "5px",
                }}
              >
                Use the legal name associated with your business.
              </div>
            </div>


            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap:
                  "14px",
                marginTop:
                  "16px",
              }}
            >
              <div>
                <label
                  htmlFor="phone"
                  style={
                    labelStyle
                  }
                >
                  Phone
                </label>

                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={
                    values?.phone ??
                    seller.phone ??
                    ""
                  }
                  style={
                    inputStyle
                  }
                />
              </div>


              <div>
                <label
                  htmlFor="website"
                  style={
                    labelStyle
                  }
                >
                  Website
                </label>

                <input
                  id="website"
                  name="website"
                  defaultValue={
                    values?.website ??
                    seller.website ??
                    ""
                  }
                  style={
                    inputStyle
                  }
                />
              </div>
            </div>


            <div
              style={{
                marginTop:
                  "24px",
                color:
                  "#4B1678",
                fontWeight:
                  "800",
                fontSize:
                  "14px",
              }}
            >
              Business address
            </div>


            <div
              style={{
                marginTop:
                  "14px",
              }}
            >
              <label
                htmlFor="address1"
                style={
                  labelStyle
                }
              >
                Street address *
              </label>

              <input
                id="address1"
                name="address1"
                required
                defaultValue={
                  values?.address1 ??
                  seller.address1 ??
                  ""
                }
                style={
                  inputStyle
                }
                placeholder="123 Main Street"
              />
            </div>


            <div
              style={{
                marginTop:
                  "14px",
              }}
            >
              <label
                htmlFor="address2"
                style={
                  labelStyle
                }
              >
                Suite, unit, etc.
              </label>

              <input
                id="address2"
                name="address2"
                defaultValue={
                  values?.address2 ??
                  seller.address2 ??
                  ""
                }
                style={
                  inputStyle
                }
                placeholder="Optional"
              />
            </div>


            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "2fr 1fr 1fr",
                gap:
                  "14px",
                marginTop:
                  "14px",
              }}
            >
              <div>
                <label
                  htmlFor="city"
                  style={
                    labelStyle
                  }
                >
                  City *
                </label>

                <input
                  id="city"
                  name="city"
                  required
                  defaultValue={
                    values?.city ??
                    seller.city ??
                    ""
                  }
                  style={
                    inputStyle
                  }
                />
              </div>


              <div>
                <label
                  htmlFor="state"
                  style={
                    labelStyle
                  }
                >
                  State *
                </label>

                <input
                  id="state"
                  name="state"
                  required
                  maxLength={2}
                  defaultValue={
                    values?.state ??
                    seller.state ??
                    ""
                  }
                  style={
                    inputStyle
                  }
                  placeholder="CT"
                />
              </div>


              <div>
                <label
                  htmlFor="postalCode"
                  style={
                    labelStyle
                  }
                >
                  ZIP *
                </label>

                <input
                  id="postalCode"
                  name="postalCode"
                  required
                  inputMode="numeric"
                  defaultValue={
                    values?.postalCode ??
                    seller.postalCode ??
                    ""
                  }
                  style={
                    inputStyle
                  }
                />
              </div>
            </div>


            <div
              style={{
                marginTop:
                  "14px",
              }}
            >
              <label
                style={
                  labelStyle
                }
              >
                Country
              </label>

              <div
                style={{
                  ...savedBoxStyle,
                  fontWeight:
                    "700",
                  fontSize:
                    "13px",
                }}
              >
                United States
              </div>
            </div>
          </div>


          <div
            style={{
              display:
                "flex",
              gap:
                "10px",
              marginTop:
                "28px",
              paddingTop:
                "20px",
              borderTop:
                "1px solid #eee7f2",
              flexWrap:
                "wrap",
            }}
          >
            <a
              href="/seller/onboarding"
              style={{
                flex:
                  "1 1 160px",
                boxSizing:
                  "border-box",
                textAlign:
                  "center",
                border:
                  "1px solid #d8cce0",
                borderRadius:
                  "10px",
                background:
                  "#ffffff",
                color:
                  "#4B1678",
                padding:
                  "13px 16px",
                fontSize:
                  "13px",
                fontWeight:
                  "800",
                textDecoration:
                  "none",
              }}
            >
              Back
            </a>


            <button
              type="submit"
              disabled={
                saving
              }
              style={{
                flex:
                  "2 1 280px",
                border:
                  "none",
                borderRadius:
                  "10px",
                background:
                  saving
                    ? "#8c72a0"
                    : "#4B1678",
                color:
                  "#ffffff",
                padding:
                  "13px 16px",
                fontSize:
                  "13px",
                fontWeight:
                  "800",
                cursor:
                  saving
                    ? "wait"
                    : "pointer",
              }}
            >
              {saving
                ? "Saving..."
                : "Save Business Details"}
            </button>
          </div>


          <p
            style={{
              textAlign:
                "center",
              color:
                "#817787",
              fontSize:
                "10px",
              lineHeight:
                "1.5",
              margin:
                "11px 0 0",
            }}
          >
            Your progress is saved to your HairGrab seller account.
          </p>

        </Form>
      </div>
    </div>
  );
}