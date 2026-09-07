import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";

import crypto from "node:crypto";

import { sendSellerApprovalEmail } from "../email.server";


// ==========================================================
// DISPLAY HELPERS
// ==========================================================

function formatYearsInBusiness(value: string | null) {
  if (!value) {
    return "—";
  }

  const labels: Record<string, string> = {
    LESS_THAN_1: "Less than 1 year",
    "1_TO_2": "1–2 years",
    "3_TO_5": "3–5 years",
    "6_TO_10": "6–10 years",
    MORE_THAN_10: "More than 10 years",
    "10_PLUS": "10+ years",
  };

  return labels[value] || value.replaceAll("_", " ");
}


function formatProductRange(value: string | null) {
  if (!value) {
    return "—";
  }

  const labels: Record<string, string> = {
    "1_TO_10": "1–10 products",
    "11_TO_25": "11–25 products",
    "26_TO_50": "26–50 products",
    "51_TO_100": "51–100 products",
    MORE_THAN_100: "More than 100 products",
    "100_PLUS": "100+ products",
  };

  return labels[value] || value.replaceAll("_", " ");
}


// ==========================================================
// HELPERS
// ==========================================================

function makeShopifyVendor(
  businessName: string,
  sellerCode: string,
) {
  const cleaned =
    businessName
      .trim()
      .replace(/\s+/g, " ");

  return `${cleaned} - ${sellerCode}`;
}


async function getNextSellerCode() {
  const sellers =
    await db.seller.findMany({
      select: {
        sellerCode: true,
      },
    });

  let highestSellerNumber = 0;

  for (const seller of sellers) {
    const match =
      seller.sellerCode.match(
        /^HG-(\d+)$/,
      );

    if (!match) {
      continue;
    }

    const number =
      Number(match[1]);

    if (
      Number.isFinite(number) &&
      number > highestSellerNumber
    ) {
      highestSellerNumber =
        number;
    }
  }

  return `HG-${String(
    highestSellerNumber + 1,
  ).padStart(4, "0")}`;
}


async function createSellerLoginLink({
  request,
  portalAccountId,
}: {
  request: Request;
  portalAccountId: string;
}) {
  const rawToken =
    crypto.randomBytes(
      32,
    ).toString("hex");

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
}: LoaderFunctionArgs) => {
  await authenticate.admin(
    request,
  );

  const applications =
    await db.sellerApplication.findMany({
      orderBy: {
        submittedAt:
          "desc",
      },

      include: {
        approvedSeller: {
          include: {
            portalAccounts:
              true,
          },
        },
      },
    });

  const pendingCount =
    applications.filter(
      (application) =>
        application.status ===
        "PENDING",
    ).length;

  const approvedCount =
    applications.filter(
      (application) =>
        application.status ===
        "APPROVED",
    ).length;

  const declinedCount =
    applications.filter(
      (application) =>
        application.status ===
        "DECLINED",
    ).length;

  return {
    applications,
    pendingCount,
    approvedCount,
    declinedCount,
  };
};


// ==========================================================
// ACTION
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  await authenticate.admin(
    request,
  );

  const formData =
    await request.formData();

  const intent =
    String(
      formData.get("intent") ||
      "",
    );

  const applicationId =
    String(
      formData.get(
        "applicationId",
      ) || "",
    );

  if (!applicationId) {
    return {
      success: false,
      message:
        "Application ID is missing.",
      intent,
      applicationId,
    };
  }

  const application =
    await db.sellerApplication.findUnique({
      where: {
        id:
          applicationId,
      },

      include: {
        approvedSeller: {
          include: {
            portalAccounts:
              true,
          },
        },
      },
    });

  if (!application) {
    return {
      success: false,
      message:
        "Seller application was not found.",
      intent,
      applicationId,
    };
  }


  // ========================================================
  // APPROVE
  // ========================================================

  if (
    intent ===
    "approve"
  ) {
    if (
      application.status ===
        "APPROVED" &&
      application.approvedSeller
    ) {
      return {
        success: false,
        message:
          `This application is already approved as ${application.approvedSeller.sellerCode}.`,
        intent,
        applicationId,
      };
    }

    try {
      const sellerCode =
        await getNextSellerCode();

      const sellerNumber =
        Number(
          sellerCode.replace(
            "HG-",
            "",
          ),
        );

      const commissionRate =
        sellerNumber <= 100
          ? 5
          : 7;

      const shopifyVendor =
        makeShopifyVendor(
          application.businessName,
          sellerCode,
        );

      const now =
        new Date();

      const result =
        await db.$transaction(
          async (tx) => {
            const seller =
              await tx.seller.create({
                data: {
                  sellerCode,

                  businessName:
                    application.businessName,

                  contactFirstName:
                    application.contactFirstName,

                  contactLastName:
                    application.contactLastName,

                  email:
                    application.email,

                  phone:
                    application.phone,

                  address1:
                    application.address1,

                  address2:
                    application.address2,

                  city:
                    application.city,

                  state:
                    application.state,

                  postalCode:
                    application.postalCode,

                  country:
                    application.country,

                  sellsNationwide:
                    application.sellsNationwide,

                  offersLocalPickup:
                    application.offersLocalPickup,

                  offersLocalDelivery:
                    application.offersLocalDelivery,

                  offersSameDayDelivery:
                    application.offersSameDayDelivery,

                  shopifyVendor,

                  status:
                    "ACTIVE",

                  commissionRate,

                  activeProductLimit:
                    50,

                  payoutStatus:
                    "NOT_CONNECTED",

                  payoutTier:
                    "STANDARD",

                  approvedAt:
                    now,
                },
              });

            const portalAccount =
              await tx.sellerPortalAccount.create({
                data: {
                  sellerId:
                    seller.id,

                  email:
                    application.email,

                  firstName:
                    application.contactFirstName,

                  lastName:
                    application.contactLastName,

                  role:
                    "OWNER",

                  status:
                    "INVITED",

                  invitedAt:
                    now,
                },
              });

            await tx.sellerOnboarding.create({
              data: {
                sellerId:
                  seller.id,

                currentStep:
                  "BUSINESS",

                status:
                  "NOT_STARTED",

                businessComplete:
                  false,

                storefrontComplete:
                  false,

                fulfillmentComplete:
                  false,

                returnsComplete:
                  false,

                payoutsComplete:
                  false,

                agreementsComplete:
                  false,

                productsComplete:
                  false,

                startedAt:
                  null,

                lastSavedAt:
                  null,

                completedAt:
                  null,
              },
            });

            await tx.sellerApplication.update({
              where: {
                id:
                  application.id,
              },

              data: {
                status:
                  "APPROVED",

                reviewedAt:
                  now,

                approvedAt:
                  now,

                approvedSellerId:
                  seller.id,
              },
            });

            return {
              seller,
              portalAccount,
            };
          },
        );

      const onboardingUrl =
        await createSellerLoginLink({
          request,
          portalAccountId:
            result.portalAccount.id,
        });

      let approvalEmailSent =
        true;

      try {
        await sendSellerApprovalEmail({
          to:
            application.email,

          firstName:
            application.contactFirstName,

          businessName:
            application.businessName,

          sellerCode:
            result.seller.sellerCode,

          onboardingUrl,
        });

      } catch (emailError) {
        approvalEmailSent =
          false;

        console.error(
          "[HairGrab Core] Seller approved but approval email failed:",
          emailError,
        );
      }

      return {
        success:
          true,

        message:
          approvalEmailSent
            ? `${application.businessName} approved as ${result.seller.sellerCode}. Seller account and onboarding were created, and the seller email was sent.`
            : `${application.businessName} approved as ${result.seller.sellerCode}. Seller account and onboarding were created, but the seller email could not be sent.`,

        intent,
        applicationId,
      };

    } catch (error) {
      console.error(
        "[HairGrab Core] Seller approval error:",
        error,
      );

      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to approve seller application.",
        intent,
        applicationId,
      };
    }
  }


  // ========================================================
  // RESEND APPROVAL EMAIL
  // ========================================================

  if (
    intent ===
    "resend-approval-email"
  ) {
    if (
      application.status !==
        "APPROVED" ||
      !application.approvedSeller
    ) {
      return {
        success: false,
        message:
          "Only approved sellers can receive an approval email.",
        intent,
        applicationId,
      };
    }

    try {
      const portalAccount =
        application.approvedSeller.portalAccounts.find(
          (account) =>
            account.email.toLowerCase() ===
            application.email.toLowerCase(),
        ) ||
        application.approvedSeller.portalAccounts[0];

      if (!portalAccount) {
        return {
          success: false,
          message:
            "This seller does not have a portal account.",
          intent,
          applicationId,
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
          application.email,

        firstName:
          application.contactFirstName,

        businessName:
          application.businessName,

        sellerCode:
          application.approvedSeller.sellerCode,

        onboardingUrl,
      });

      return {
        success: true,
        message:
          `Approval email sent to ${application.email}.`,
        intent,
        applicationId,
      };

    } catch (error) {
      console.error(
        "[HairGrab Core] Resend seller approval email error:",
        error,
      );

      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to resend seller approval email.",
        intent,
        applicationId,
      };
    }
  }


  // ========================================================
  // DECLINE
  // ========================================================

  if (
    intent ===
    "decline"
  ) {
    if (
      application.status ===
      "APPROVED"
    ) {
      return {
        success: false,
        message:
          "An approved seller application cannot be declined from this screen.",
        intent,
        applicationId,
      };
    }

    try {
      await db.sellerApplication.update({
        where: {
          id:
            application.id,
        },

        data: {
          status:
            "DECLINED",

          reviewedAt:
            new Date(),

          declinedAt:
            new Date(),
        },
      });

      return {
        success: true,
        message:
          `${application.businessName} was declined.`,
        intent,
        applicationId,
      };

    } catch (error) {
      console.error(
        "[HairGrab Core] Seller decline error:",
        error,
      );

      return {
        success: false,
        message:
          "Unable to decline seller application.",
        intent,
        applicationId,
      };
    }
  }

  return {
    success: false,
    message:
      "Unknown application action.",
    intent,
    applicationId,
  };
};


// ==========================================================
// STYLES
// ==========================================================

const cardStyle = {
  background:
    "#ffffff",
  border:
    "1px solid #e5d8ef",
  borderRadius:
    "14px",
  padding:
    "20px",
  boxShadow:
    "0 2px 8px rgba(84, 35, 120, 0.06)",
};


const badgeStyle = (
  status: string,
) => {
  if (
    status ===
    "APPROVED"
  ) {
    return {
      background:
        "#edf8ef",
      color:
        "#2d6c3a",
      border:
        "1px solid #c7e3cd",
    };
  }

  if (
    status ===
    "DECLINED"
  ) {
    return {
      background:
        "#fff0f0",
      color:
        "#963333",
      border:
        "1px solid #efc4c4",
    };
  }

  return {
    background:
      "#fff8e8",
    color:
      "#7a5b16",
    border:
      "1px solid #ead9a6",
  };
};


// ==========================================================
// PAGE
// ==========================================================

export default function ApplicationsPage() {
  const {
    applications,
    pendingCount,
    approvedCount,
    declinedCount,
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

  const busy =
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

  const submittingApplicationId =
    navigation.formData
      ? String(
          navigation.formData.get(
            "applicationId",
          ) || "",
        )
      : "";

  return (
    <div
      style={{
        maxWidth:
          "1200px",
        margin:
          "0 auto",
        padding:
          "28px",
        fontFamily:
          "Arial, sans-serif",
        color:
          "#21152a",
      }}
    >

      {/* HEADER */}

      <div
        style={{
          marginBottom:
            "24px",
        }}
      >
        <div
          style={{
            color:
              "#7b3fa0",
            fontSize:
              "13px",
            fontWeight:
              "700",
            textTransform:
              "uppercase",
            letterSpacing:
              "1.5px",
            marginBottom:
              "6px",
          }}
        >
          HairGrab Marketplace
        </div>

        <h1
          style={{
            margin:
              "0",
            color:
              "#542378",
            fontSize:
              "32px",
          }}
        >
          Seller Applications
        </h1>

        <p
          style={{
            color:
              "#6f6675",
            fontSize:
              "15px",
            marginTop:
              "8px",
          }}
        >
          Review seller applications and approve qualified businesses into HairGrab Core.
        </p>
      </div>


      {/* RESULT FOR NON-RESEND ACTIONS */}

      {actionData?.message &&
        actionData.intent !==
          "resend-approval-email" && (
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
          {actionData.message}
        </div>
      )}


      {/* SUMMARY */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap:
            "16px",
          marginBottom:
            "24px",
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              fontSize:
                "12px",
              color:
                "#756b7b",
            }}
          >
            Pending
          </div>

          <div
            style={{
              fontSize:
                "30px",
              fontWeight:
                "800",
              color:
                "#542378",
              marginTop:
                "7px",
            }}
          >
            {pendingCount}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize:
                "12px",
              color:
                "#756b7b",
            }}
          >
            Approved
          </div>

          <div
            style={{
              fontSize:
                "30px",
              fontWeight:
                "800",
              color:
                "#542378",
              marginTop:
                "7px",
            }}
          >
            {approvedCount}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize:
                "12px",
              color:
                "#756b7b",
            }}
          >
            Declined
          </div>

          <div
            style={{
              fontSize:
                "30px",
              fontWeight:
                "800",
              color:
                "#542378",
              marginTop:
                "7px",
            }}
          >
            {declinedCount}
          </div>
        </div>
      </div>


      {/* APPLICATIONS */}

      <div
        style={{
          display:
            "grid",
          gap:
            "16px",
        }}
      >
        {applications.length ===
        0 ? (
          <div
            style={{
              ...cardStyle,
              textAlign:
                "center",
              color:
                "#756b7b",
              padding:
                "40px",
            }}
          >
            No seller applications have been submitted yet.
          </div>
        ) : (
          applications.map(
            (application) => {
              const badge =
                badgeStyle(
                  application.status,
                );

              const isResending =
                busy &&
                submittingIntent ===
                  "resend-approval-email" &&
                submittingApplicationId ===
                  application.id;

              const resendResult =
                actionData?.intent ===
                  "resend-approval-email" &&
                actionData.applicationId ===
                  application.id
                  ? actionData
                  : null;

              return (
                <div
                  key={
                    application.id
                  }
                  style={
                    cardStyle
                  }
                >
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      gap:
                        "14px",
                      alignItems:
                        "flex-start",
                      flexWrap:
                        "wrap",
                    }}
                  >
                    <div>
                      <h2
                        style={{
                          margin:
                            "0",
                          color:
                            "#542378",
                          fontSize:
                            "20px",
                        }}
                      >
                        {
                          application.businessName
                        }
                      </h2>

                      <div
                        style={{
                          marginTop:
                            "5px",
                          color:
                            "#756b7b",
                          fontSize:
                            "13px",
                        }}
                      >
                        {
                          application.contactFirstName
                        }{" "}
                        {
                          application.contactLastName
                        }
                        {" · "}
                        {
                          application.email
                        }
                      </div>
                    </div>

                    <div
                      style={{
                        ...badge,
                        borderRadius:
                          "20px",
                        padding:
                          "6px 11px",
                        fontSize:
                          "11px",
                        fontWeight:
                          "800",
                      }}
                    >
                      {
                        application.status
                      }
                    </div>
                  </div>


                  <div
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap:
                        "14px",
                      marginTop:
                        "18px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize:
                            "11px",
                          color:
                            "#867c8b",
                          marginBottom:
                            "4px",
                        }}
                      >
                        ZIP Code
                      </div>

                      <div
                        style={{
                          fontWeight:
                            "700",
                        }}
                      >
                        {
                          application.postalCode ||
                          "—"
                        }
                      </div>
                    </div>


                    <div>
                      <div
                        style={{
                          fontSize:
                            "11px",
                          color:
                            "#867c8b",
                          marginBottom:
                            "4px",
                        }}
                      >
                        Years Selling Hair
                      </div>

                      <div
                        style={{
                          fontWeight:
                            "700",
                        }}
                      >
                        {formatYearsInBusiness(
                          application.yearsInBusiness,
                        )}
                      </div>
                    </div>


                    <div>
                      <div
                        style={{
                          fontSize:
                            "11px",
                          color:
                            "#867c8b",
                          marginBottom:
                            "4px",
                        }}
                      >
                        Product Range
                      </div>

                      <div
                        style={{
                          fontWeight:
                            "700",
                        }}
                      >
                        {formatProductRange(
                          application.productCountRange,
                        )}
                      </div>
                    </div>


                    <div>
                      <div
                        style={{
                          fontSize:
                            "11px",
                          color:
                            "#867c8b",
                          marginBottom:
                            "4px",
                        }}
                      >
                        CSV Ready
                      </div>

                      <div
                        style={{
                          fontWeight:
                            "700",
                        }}
                      >
                        {
                          application.canImportCsv ===
                          null
                            ? "—"
                            : application.canImportCsv
                              ? "Yes"
                              : "No"
                        }
                      </div>
                    </div>
                  </div>


                  <div
                    style={{
                      marginTop:
                        "16px",
                      color:
                        "#5f5664",
                      fontSize:
                        "12px",
                      lineHeight:
                        "1.6",
                    }}
                  >
                    Nationwide Shipping:{" "}
                    <strong>
                      {
                        application.sellsNationwide
                          ? "Yes"
                          : "No"
                      }
                    </strong>

                    {" · "}

                    Local Pickup:{" "}
                    <strong>
                      {
                        application.offersLocalPickup
                          ? "Yes"
                          : "No"
                      }
                    </strong>

                    {" · "}

                    Local Delivery:{" "}
                    <strong>
                      {
                        application.offersLocalDelivery
                          ? "Yes"
                          : "No"
                      }
                    </strong>

                    {" · "}

                    Same-Day Delivery:{" "}
                    <strong>
                      {
                        application.offersSameDayDelivery
                          ? "Yes"
                          : "No"
                      }
                    </strong>
                  </div>


                  {application.approvedSeller && (
                    <div
                      style={{
                        marginTop:
                          "16px",
                        background:
                          "#f8f1fc",
                        border:
                          "1px solid #e2d3ec",
                        borderRadius:
                          "10px",
                        padding:
                          "12px",
                        color:
                          "#542378",
                        fontWeight:
                          "700",
                        fontSize:
                          "12px",
                      }}
                    >
                      Approved Seller ID:{" "}
                      {
                        application.approvedSeller.sellerCode
                      }
                    </div>
                  )}


                  {application.status ===
                    "PENDING" && (
                    <div
                      style={{
                        display:
                          "flex",
                        gap:
                          "10px",
                        flexWrap:
                          "wrap",
                        marginTop:
                          "18px",
                        paddingTop:
                          "16px",
                        borderTop:
                          "1px solid #eee6f2",
                      }}
                    >
                      <Form
                        method="post"
                      >
                        <input
                          type="hidden"
                          name="applicationId"
                          value={
                            application.id
                          }
                        />

                        <input
                          type="hidden"
                          name="intent"
                          value="approve"
                        />

                        <button
                          type="submit"
                          disabled={
                            busy
                          }
                          style={{
                            border:
                              "none",
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
                              busy
                                ? "wait"
                                : "pointer",
                            opacity:
                              busy
                                ? 0.65
                                : 1,
                          }}
                        >
                          Approve Seller
                        </button>
                      </Form>


                      <Form
                        method="post"
                      >
                        <input
                          type="hidden"
                          name="applicationId"
                          value={
                            application.id
                          }
                        />

                        <input
                          type="hidden"
                          name="intent"
                          value="decline"
                        />

                        <button
                          type="submit"
                          disabled={
                            busy
                          }
                          style={{
                            border:
                              "1px solid #d8c4c4",
                            borderRadius:
                              "9px",
                            background:
                              "#ffffff",
                            color:
                              "#8d3434",
                            padding:
                              "10px 15px",
                            fontWeight:
                              "800",
                            cursor:
                              busy
                                ? "wait"
                                : "pointer",
                            opacity:
                              busy
                                ? 0.65
                                : 1,
                          }}
                        >
                          Decline
                        </button>
                      </Form>
                    </div>
                  )}


                  {application.status ===
                    "APPROVED" &&
                    application.approvedSeller && (
                    <div
                      style={{
                        marginTop:
                          "18px",
                        paddingTop:
                          "16px",
                        borderTop:
                          "1px solid #eee6f2",
                      }}
                    >
                      <Form
                        method="post"
                      >
                        <input
                          type="hidden"
                          name="applicationId"
                          value={
                            application.id
                          }
                        />

                        <input
                          type="hidden"
                          name="intent"
                          value="resend-approval-email"
                        />

                        <button
                          type="submit"
                          disabled={
                            isResending
                          }
                          style={{
                            border:
                              "1px solid #c9b1d9",
                            borderRadius:
                              "9px",
                            background:
                              isResending
                                ? "#f3eef6"
                                : "#ffffff",
                            color:
                              "#4B1678",
                            padding:
                              "10px 15px",
                            fontWeight:
                              "800",
                            cursor:
                              isResending
                                ? "wait"
                                : "pointer",
                            opacity:
                              isResending
                                ? 0.65
                                : 1,
                          }}
                        >
                          {
                            isResending
                              ? "Sending..."
                              : "Resend Approval Email"
                          }
                        </button>
                      </Form>


                      {resendResult && (
                        <div
                          style={{
                            marginTop:
                              "12px",
                            padding:
                              "11px 13px",
                            borderRadius:
                              "9px",
                            background:
                              resendResult.success
                                ? "#eef8f0"
                                : "#fff0f0",
                            border:
                              resendResult.success
                                ? "1px solid #cbe3d0"
                                : "1px solid #efc0c0",
                            color:
                              resendResult.success
                                ? "#2f6b3c"
                                : "#9a2929",
                            fontWeight:
                              "700",
                            fontSize:
                              "13px",
                          }}
                        >
                          {
                            resendResult.success
                              ? "✓ "
                              : ""
                          }
                          {resendResult.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            },
          )
        )}
      </div>
    </div>
  );
}