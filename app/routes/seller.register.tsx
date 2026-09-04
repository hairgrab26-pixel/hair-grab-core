import type { ActionFunctionArgs } from "react-router";

import {
  Form,
  useActionData,
  useNavigation,
} from "react-router";

import db from "../db.server";


// ==========================================================
// HELPERS
// ==========================================================

function cleanText(
  value: FormDataEntryValue | null,
) {
  return String(value || "").trim();
}


function cleanOptional(
  value: FormDataEntryValue | null,
) {
  const cleaned =
    String(value || "").trim();

  return cleaned || null;
}


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


function isValidUsPostalCode(
  value: string,
) {
  return /^\d{5}(-\d{4})?$/.test(
    value,
  );
}


// ==========================================================
// SELLER APPLICATION ACTION
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {

  const formData =
    await request.formData();


  const businessName =
    cleanText(
      formData.get(
        "businessName",
      ),
    );


  const contactFirstName =
    cleanText(
      formData.get(
        "contactFirstName",
      ),
    );


  const contactLastName =
    cleanText(
      formData.get(
        "contactLastName",
      ),
    );


  const email =
    normalizeEmail(
      formData.get(
        "email",
      ),
    );


  const phone =
    cleanOptional(
      formData.get(
        "phone",
      ),
    );


  const postalCode =
    cleanText(
      formData.get(
        "postalCode",
      ),
    );


  const website =
    cleanOptional(
      formData.get(
        "website",
      ),
    );


  const instagram =
    cleanOptional(
      formData.get(
        "instagram",
      ),
    );


  const tiktok =
    cleanOptional(
      formData.get(
        "tiktok",
      ),
    );


  const yearsInBusiness =
    cleanOptional(
      formData.get(
        "yearsInBusiness",
      ),
    );


  const productCountRange =
    cleanOptional(
      formData.get(
        "productCountRange",
      ),
    );


  const canImportCsvValue =
    cleanText(
      formData.get(
        "canImportCsv",
      ),
    );


  const canImportCsv =
    canImportCsvValue === "yes"
      ? true
      : canImportCsvValue === "no"
        ? false
        : null;


  const sellsNationwide =
    formData.get(
      "sellsNationwide",
    ) === "on";


  const offersLocalPickup =
    formData.get(
      "offersLocalPickup",
    ) === "on";


  const offersLocalDelivery =
    formData.get(
      "offersLocalDelivery",
    ) === "on";


  // ========================================================
  // REQUIRED FIELD VALIDATION
  // ========================================================

  if (
    !businessName ||
    !contactFirstName ||
    !contactLastName ||
    !email ||
    !postalCode
  ) {
    return {
      success: false,

      message:
        "Please complete all required fields.",

      values: {
        businessName,
        contactFirstName,
        contactLastName,
        email,
        phone,
        postalCode,
        website,
        instagram,
        tiktok,
        yearsInBusiness,
        productCountRange,
        canImportCsv:
          canImportCsvValue,
        sellsNationwide,
        offersLocalPickup,
        offersLocalDelivery,
      },
    };
  }


  if (!isValidEmail(email)) {
    return {
      success: false,

      message:
        "Please enter a valid email address.",

      values: {
        businessName,
        contactFirstName,
        contactLastName,
        email,
        phone,
        postalCode,
        website,
        instagram,
        tiktok,
        yearsInBusiness,
        productCountRange,
        canImportCsv:
          canImportCsvValue,
        sellsNationwide,
        offersLocalPickup,
        offersLocalDelivery,
      },
    };
  }


  if (
    !isValidUsPostalCode(
      postalCode,
    )
  ) {
    return {
      success: false,

      message:
        "Please enter a valid U.S. ZIP code.",

      values: {
        businessName,
        contactFirstName,
        contactLastName,
        email,
        phone,
        postalCode,
        website,
        instagram,
        tiktok,
        yearsInBusiness,
        productCountRange,
        canImportCsv:
          canImportCsvValue,
        sellsNationwide,
        offersLocalPickup,
        offersLocalDelivery,
      },
    };
  }


  try {

    // ======================================================
    // PREVENT DUPLICATE OPEN APPLICATIONS
    // ======================================================

    const existingApplication =
      await db.sellerApplication.findFirst({
        where: {
          email,

          status: {
            in: [
              "PENDING",
              "APPROVED",
            ],
          },
        },

        orderBy: {
          submittedAt:
            "desc",
        },
      });


    if (
      existingApplication
    ) {

      if (
        existingApplication.status ===
        "APPROVED"
      ) {
        return {
          success: false,

          message:
            "This email is already associated with an approved HairGrab seller.",
        };
      }


      return {
        success: false,

        message:
          "We already have a HairGrab seller application for this email and it is currently under review.",
      };
    }


    // Also prevent an existing permanent seller
    // from applying again with the same email.
    const existingSeller =
      await db.seller.findFirst({
        where: {
          email,
        },
      });


    if (existingSeller) {
      return {
        success: false,

        message:
          "This email is already associated with a HairGrab seller account.",
      };
    }


    // ======================================================
    // CREATE APPLICATION
    // ======================================================

    await db.sellerApplication.create({
      data: {
        status:
          "PENDING",

        businessName,

        contactFirstName,

        contactLastName,

        email,

        phone,

        website,

        instagram,

        tiktok,

        postalCode,

        country:
          "US",

        yearsInBusiness,

        productCountRange,

        canImportCsv,

        sellsNationwide,

        offersLocalPickup,

        offersLocalDelivery,

        submittedAt:
          new Date(),
      },
    });


    return {
      success: true,

      message:
        "Your HairGrab seller application has been submitted.",
    };

  } catch (error) {

    console.error(
      "[HairGrab Core] Seller application error:",
      error,
    );


    return {
      success: false,

      message:
        "We couldn't submit your application right now. Please try again.",
    };
  }
};


// ==========================================================
// STYLES
// ==========================================================

const pageStyle = {
  minHeight: "100vh",
  background:
    "#faf8fc",
  padding:
    "40px 18px",
  fontFamily:
    "Arial, sans-serif",
  color:
    "#21152a",
};


const shellStyle = {
  maxWidth:
    "760px",
  margin:
    "0 auto",
};


const cardStyle = {
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


const sectionStyle = {
  marginTop:
    "28px",
};


const labelStyle = {
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


const helperStyle = {
  fontSize:
    "12px",
  color:
    "#756b7b",
  marginTop:
    "5px",
  lineHeight:
    "1.4",
};


// ==========================================================
// PAGE
// ==========================================================

export default function SellerRegistrationPage() {

  const actionData =
    useActionData<
      typeof action
    >();


  const navigation =
    useNavigation();


  const submitting =
    navigation.state ===
    "submitting";


  const values =
    actionData?.success === false
      ? actionData.values
      : undefined;


  // ========================================================
  // SUCCESS SCREEN
  // ========================================================

  if (
    actionData?.success ===
    true
  ) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={cardStyle}>

            <div
              style={{
                width:
                  "54px",
                height:
                  "54px",
                borderRadius:
                  "50%",
                background:
                  "#f0e6f7",
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                color:
                  "#4B1678",
                fontWeight:
                  "800",
                fontSize:
                  "24px",
                marginBottom:
                  "20px",
              }}
            >
              ✓
            </div>


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
                  "1.4px",
                marginBottom:
                  "7px",
              }}
            >
              HairGrab Seller Application
            </div>


            <h1
              style={{
                margin:
                  "0 0 12px 0",
                color:
                  "#4B1678",
                fontSize:
                  "30px",
              }}
            >
              Application received
            </h1>


            <p
              style={{
                color:
                  "#625869",
                fontSize:
                  "15px",
                lineHeight:
                  "1.65",
                margin:
                  "0",
              }}
            >
              Thank you for applying to sell on HairGrab.
              We’ll review your information and contact
              you at the email address you provided.
            </p>


            <div
              style={{
                marginTop:
                  "24px",
                background:
                  "#faf7fc",
                border:
                  "1px solid #e5d8ef",
                borderRadius:
                  "12px",
                padding:
                  "17px",
                color:
                  "#554b5b",
                fontSize:
                  "13px",
                lineHeight:
                  "1.6",
              }}
            >
              <strong
                style={{
                  color:
                    "#4B1678",
                }}
              >
                What happens next?
              </strong>

              <div
                style={{
                  marginTop:
                    "7px",
                }}
              >
                If approved, HairGrab will create your
                permanent seller account and you'll
                continue directly into your seller setup.
                You will not have to enter this information
                again.
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }


  return (
    <div style={pageStyle}>
      <div style={shellStyle}>

        {/* HEADER */}

        <div
          style={{
            textAlign:
              "center",
            marginBottom:
              "26px",
          }}
        >
          <div
            style={{
              color:
                "#4B1678",
              fontWeight:
                "800",
              fontSize:
                "25px",
              marginBottom:
                "8px",
            }}
          >
            HairGrab
          </div>


          <h1
            style={{
              margin:
                "0",
              color:
                "#21152a",
              fontSize:
                "32px",
            }}
          >
            Sell on HairGrab
          </h1>


          <p
            style={{
              maxWidth:
                "590px",
              margin:
                "10px auto 0",
              color:
                "#706776",
              fontSize:
                "15px",
              lineHeight:
                "1.6",
            }}
          >
            Tell us a little about your hair business.
            This should only take a few minutes.
          </p>
        </div>


        <div style={cardStyle}>

          {/* ERROR */}

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
                    "13px 15px",
                  borderRadius:
                    "10px",
                  marginBottom:
                    "22px",
                  fontSize:
                    "13px",
                  fontWeight:
                    "700",
                }}
              >
                {
                  actionData.message
                }
              </div>
            )}


          <Form
            method="post"
          >

            {/* BUSINESS */}

            <div>
              <h2
                style={{
                  margin:
                    "0 0 16px 0",
                  color:
                    "#4B1678",
                  fontSize:
                    "19px",
                }}
              >
                Your business
              </h2>


              <div>
                <label
                  style={
                    labelStyle
                  }
                  htmlFor="businessName"
                >
                  Business or store name *
                </label>

                <input
                  id="businessName"
                  name="businessName"
                  required
                  defaultValue={
                    values?.businessName ||
                    ""
                  }
                  style={
                    inputStyle
                  }
                  placeholder="Your hair business name"
                />
              </div>


              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(200px, 1fr))",
                  gap:
                    "14px",
                  marginTop:
                    "14px",
                }}
              >
                <div>
                  <label
                    style={
                      labelStyle
                    }
                    htmlFor="website"
                  >
                    Website
                  </label>

                  <input
                    id="website"
                    name="website"
                    defaultValue={
                      values?.website ||
                      ""
                    }
                    style={
                      inputStyle
                    }
                    placeholder="yourstore.com"
                  />
                </div>


                <div>
                  <label
                    style={
                      labelStyle
                    }
                    htmlFor="instagram"
                  >
                    Instagram
                  </label>

                  <input
                    id="instagram"
                    name="instagram"
                    defaultValue={
                      values?.instagram ||
                      ""
                    }
                    style={
                      inputStyle
                    }
                    placeholder="@yourbusiness"
                  />
                </div>


                <div>
                  <label
                    style={
                      labelStyle
                    }
                    htmlFor="tiktok"
                  >
                    TikTok
                  </label>

                  <input
                    id="tiktok"
                    name="tiktok"
                    defaultValue={
                      values?.tiktok ||
                      ""
                    }
                    style={
                      inputStyle
                    }
                    placeholder="@yourbusiness"
                  />
                </div>
              </div>
            </div>


            {/* CONTACT */}

            <div style={sectionStyle}>
              <h2
                style={{
                  margin:
                    "0 0 16px 0",
                  color:
                    "#4B1678",
                  fontSize:
                    "19px",
                }}
              >
                Your contact information
              </h2>


              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap:
                    "14px",
                }}
              >
                <div>
                  <label
                    style={
                      labelStyle
                    }
                    htmlFor="contactFirstName"
                  >
                    First name *
                  </label>

                  <input
                    id="contactFirstName"
                    name="contactFirstName"
                    required
                    defaultValue={
                      values?.contactFirstName ||
                      ""
                    }
                    style={
                      inputStyle
                    }
                  />
                </div>


                <div>
                  <label
                    style={
                      labelStyle
                    }
                    htmlFor="contactLastName"
                  >
                    Last name *
                  </label>

                  <input
                    id="contactLastName"
                    name="contactLastName"
                    required
                    defaultValue={
                      values?.contactLastName ||
                      ""
                    }
                    style={
                      inputStyle
                    }
                  />
                </div>


                <div>
                  <label
                    style={
                      labelStyle
                    }
                    htmlFor="email"
                  >
                    Email *
                  </label>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    defaultValue={
                      values?.email ||
                      ""
                    }
                    style={
                      inputStyle
                    }
                  />
                </div>


                <div>
                  <label
                    style={
                      labelStyle
                    }
                    htmlFor="phone"
                  >
                    Phone
                  </label>

                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    defaultValue={
                      values?.phone ||
                      ""
                    }
                    style={
                      inputStyle
                    }
                  />
                </div>
              </div>
            </div>


            {/* LOCATION */}

            <div style={sectionStyle}>
              <h2
                style={{
                  margin:
                    "0 0 16px 0",
                  color:
                    "#4B1678",
                  fontSize:
                    "19px",
                }}
              >
                Where are you based?
              </h2>


              <div
                style={{
                  maxWidth:
                    "280px",
                }}
              >
                <label
                  style={
                    labelStyle
                  }
                  htmlFor="postalCode"
                >
                  ZIP code *
                </label>

                <input
                  id="postalCode"
                  name="postalCode"
                  inputMode="numeric"
                  required
                  defaultValue={
                    values?.postalCode ||
                    ""
                  }
                  style={
                    inputStyle
                  }
                  placeholder="06510"
                />

                <div
                  style={
                    helperStyle
                  }
                >
                  We'll use your ZIP code to help set up
                  your HairGrab location information.
                </div>
              </div>
            </div>


            {/* QUICK QUESTIONS */}

            <div style={sectionStyle}>
              <h2
                style={{
                  margin:
                    "0 0 16px 0",
                  color:
                    "#4B1678",
                  fontSize:
                    "19px",
                }}
              >
                A few quick questions
              </h2>


              <div
                style={{
                  display:
                    "grid",
                  gap:
                    "16px",
                }}
              >
                <div>
                  <label
                    style={
                      labelStyle
                    }
                    htmlFor="yearsInBusiness"
                  >
                    How long have you been selling hair?
                  </label>

                  <select
                    id="yearsInBusiness"
                    name="yearsInBusiness"
                    defaultValue={
                      values?.yearsInBusiness ||
                      ""
                    }
                    style={
                      inputStyle
                    }
                  >
                    <option value="">
                      Select
                    </option>

                    <option value="NOT_STARTED">
                      I'm getting ready to launch
                    </option>

                    <option value="LESS_THAN_1">
                      Less than 1 year
                    </option>

                    <option value="1_TO_2">
                      1–2 years
                    </option>

                    <option value="3_TO_5">
                      3–5 years
                    </option>

                    <option value="6_PLUS">
                      6+ years
                    </option>
                  </select>
                </div>


                <div>
                  <label
                    style={
                      labelStyle
                    }
                    htmlFor="productCountRange"
                  >
                    About how many products do you sell?
                  </label>

                  <select
                    id="productCountRange"
                    name="productCountRange"
                    defaultValue={
                      values?.productCountRange ||
                      ""
                    }
                    style={
                      inputStyle
                    }
                  >
                    <option value="">
                      Select
                    </option>

                    <option value="1_TO_10">
                      1–10
                    </option>

                    <option value="11_TO_25">
                      11–25
                    </option>

                    <option value="26_TO_50">
                      26–50
                    </option>

                    <option value="51_TO_100">
                      51–100
                    </option>

                    <option value="100_PLUS">
                      More than 100
                    </option>
                  </select>
                </div>


                <div>
                  <div
                    style={
                      labelStyle
                    }
                  >
                    Do you currently have your products in a CSV or spreadsheet?
                  </div>

                  <div
                    style={{
                      display:
                        "flex",
                      gap:
                        "18px",
                      flexWrap:
                        "wrap",
                      marginTop:
                        "9px",
                    }}
                  >
                    <label
                      style={{
                        display:
                          "flex",
                        gap:
                          "7px",
                        alignItems:
                          "center",
                        fontSize:
                          "14px",
                      }}
                    >
                      <input
                        type="radio"
                        name="canImportCsv"
                        value="yes"
                        defaultChecked={
                          values?.canImportCsv ===
                          "yes"
                        }
                      />

                      Yes
                    </label>


                    <label
                      style={{
                        display:
                          "flex",
                        gap:
                          "7px",
                        alignItems:
                          "center",
                        fontSize:
                          "14px",
                      }}
                    >
                      <input
                        type="radio"
                        name="canImportCsv"
                        value="no"
                        defaultChecked={
                          values?.canImportCsv ===
                          "no"
                        }
                      />

                      No
                    </label>
                  </div>
                </div>
              </div>
            </div>


            {/* FULFILLMENT */}

            <div style={sectionStyle}>
              <h2
                style={{
                  margin:
                    "0 0 7px 0",
                  color:
                    "#4B1678",
                  fontSize:
                    "19px",
                }}
              >
                How do you sell?
              </h2>


              <p
                style={{
                  margin:
                    "0 0 14px 0",
                  color:
                    "#756b7b",
                  fontSize:
                    "12px",
                }}
              >
                You can change these later during setup.
              </p>


              <div
                style={{
                  display:
                    "grid",
                  gap:
                    "11px",
                }}
              >
                <label
                  style={{
                    display:
                      "flex",
                    gap:
                      "10px",
                    alignItems:
                      "center",
                    border:
                      "1px solid #e4d8ec",
                    borderRadius:
                      "10px",
                    padding:
                      "12px",
                    fontSize:
                      "14px",
                  }}
                >
                  <input
                    type="checkbox"
                    name="sellsNationwide"
                    defaultChecked={
                      values
                        ? values.sellsNationwide
                        : true
                    }
                  />

                  Ship orders nationwide
                </label>


                <label
                  style={{
                    display:
                      "flex",
                    gap:
                      "10px",
                    alignItems:
                      "center",
                    border:
                      "1px solid #e4d8ec",
                    borderRadius:
                      "10px",
                    padding:
                      "12px",
                    fontSize:
                      "14px",
                  }}
                >
                  <input
                    type="checkbox"
                    name="offersLocalPickup"
                    defaultChecked={
                      values?.offersLocalPickup ||
                      false
                    }
                  />

                  Offer local pickup
                </label>


                <label
                  style={{
                    display:
                      "flex",
                    gap:
                      "10px",
                    alignItems:
                      "center",
                    border:
                      "1px solid #e4d8ec",
                    borderRadius:
                      "10px",
                    padding:
                      "12px",
                    fontSize:
                      "14px",
                  }}
                >
                  <input
                    type="checkbox"
                    name="offersLocalDelivery"
                    defaultChecked={
                      values?.offersLocalDelivery ||
                      false
                    }
                  />

                  Offer local delivery
                </label>
              </div>
            </div>


            {/* SUBMIT */}

            <div
              style={{
                marginTop:
                  "30px",
                paddingTop:
                  "22px",
                borderTop:
                  "1px solid #eee6f2",
              }}
            >
              <button
                type="submit"
                disabled={
                  submitting
                }
                style={{
                  width:
                    "100%",
                  background:
                    submitting
                      ? "#8c72a0"
                      : "#4B1678",
                  color:
                    "#ffffff",
                  border:
                    "none",
                  borderRadius:
                    "11px",
                  padding:
                    "14px 18px",
                  fontSize:
                    "15px",
                  fontWeight:
                    "800",
                  cursor:
                    submitting
                      ? "wait"
                      : "pointer",
                }}
              >
                {submitting
                  ? "Submitting..."
                  : "Submit Seller Application"}
              </button>


              <p
                style={{
                  textAlign:
                    "center",
                  color:
                    "#817787",
                  fontSize:
                    "11px",
                  lineHeight:
                    "1.5",
                  margin:
                    "12px 0 0",
                }}
              >
                Submitting an application does not automatically
                activate a HairGrab seller account. Approved
                sellers will be invited to complete setup.
              </p>
            </div>

          </Form>
        </div>
      </div>
    </div>
  );
}