import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Link,
  useFetcher,
  useLoaderData,
} from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";


// ==========================================================
// HELPERS
// ==========================================================

function formatMoney(
  cents: number,
  currency = "USD",
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency,
    },
  ).format(cents / 100);
}


function formatDate(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  ).format(
    new Date(value),
  );
}


function displayValue(
  value:
    | string
    | null
    | undefined,
) {
  return value?.trim()
    ? value
    : "Not provided";
}


function yesNo(
  value: boolean,
) {
  return value
    ? "Yes"
    : "No";
}


function formatStatus(
  value: string,
) {
  return String(
    value || "",
  )
    .replace(
      /_/g,
      " ",
    )
    .toLowerCase()
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}


// ==========================================================
// LOADER
// ==========================================================

export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs) => {
  await authenticate.admin(
    request,
  );

  if (!params.sellerCode) {
    throw new Response(
      "Seller code missing",
      {
        status: 400,
      },
    );
  }


  const seller =
    await db.seller.findUnique({
      where: {
        sellerCode:
          params.sellerCode,
      },

      include: {
        onboarding:
          true,

        portalAccounts: {
          orderBy: {
            createdAt:
              "asc",
          },

          select: {
            id:
              true,

            email:
              true,

            firstName:
              true,

            lastName:
              true,

            role:
              true,

            status:
              true,

            emailVerifiedAt:
              true,

            lastLoginAt:
              true,
          },
        },

        products: {
          select: {
            id:
              true,

            title:
              true,

            status:
              true,

            publishedToShopify:
              true,

            shopifyProductId:
              true,

            createdAt:
              true,

            updatedAt:
              true,
          },

          orderBy: {
            updatedAt:
              "desc",
          },
        },

        ledgerEntries: {
          orderBy: {
            createdAt:
              "desc",
          },

          take:
            100,
        },
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


  // ========================================================
  // PRODUCT COUNTS
  // ========================================================

  const totalProducts =
    seller.products.length;

  const activeProducts =
    seller.products.filter(
      (product) =>
        product.status ===
        "ACTIVE",
    ).length;

  const draftProducts =
    seller.products.filter(
      (product) =>
        product.status ===
        "DRAFT",
    ).length;

  const pendingProducts =
    seller.products.filter(
      (product) =>
        product.status ===
        "PENDING_APPROVAL",
    ).length;

  const archivedProducts =
    seller.products.filter(
      (product) =>
        product.status ===
        "ARCHIVED",
    ).length;

  const rejectedProducts =
    seller.products.filter(
      (product) =>
        product.status ===
        "REJECTED",
    ).length;


  // ========================================================
  // LEDGER TOTALS
  // ========================================================

  const saleEntries =
    seller.ledgerEntries.filter(
      (entry) =>
        entry.entryType ===
        "SALE",
    );


  const grossSalesCents =
    saleEntries.reduce(
      (
        total,
        entry,
      ) =>
        total +
        entry.grossAmountCents,
      0,
    );


  const commissionCents =
    seller.ledgerEntries.reduce(
      (
        total,
        entry,
      ) =>
        total +
        entry.commissionAmountCents,
      0,
    );


  const sellerEarningsCents =
    seller.ledgerEntries.reduce(
      (
        total,
        entry,
      ) =>
        total +
        entry.sellerEarningsCents,
      0,
    );


  const refundsCents =
    seller.ledgerEntries.reduce(
      (
        total,
        entry,
      ) =>
        total +
        entry.refundAmountCents,
      0,
    );


  const paidToSellerCents =
    seller.ledgerEntries.reduce(
      (
        total,
        entry,
      ) =>
        total +
        entry.payoutAmountCents,
      0,
    );


  const payoutReadyCents =
    seller.ledgerEntries
      .filter(
        (entry) =>
          entry.status ===
          "ELIGIBLE",
      )
      .reduce(
        (
          total,
          entry,
        ) =>
          total +
          entry.sellerEarningsCents,
        0,
      );


  const ledgerEntries =
    seller.ledgerEntries.map(
      (entry) => ({
        id:
          entry.id,

        shopifyOrderId:
          entry.shopifyOrderId,

        shopifyOrderName:
          entry.shopifyOrderName,

        entryType:
          entry.entryType,

        status:
          entry.status,

        fundsStatus:
          entry.fundsStatus,

        currency:
          entry.currency,

        grossAmountCents:
          entry.grossAmountCents,

        commissionAmountCents:
          entry.commissionAmountCents,

        sellerEarningsCents:
          entry.sellerEarningsCents,

        refundAmountCents:
          entry.refundAmountCents,

        payoutAmountCents:
          entry.payoutAmountCents,

        availableOn:
          entry.availableOn
            ?.toISOString() ||
          null,

        paidAt:
          entry.paidAt
            ?.toISOString() ||
          null,

        shopifyCreatedAt:
          entry.shopifyCreatedAt
            ?.toISOString() ||
          null,

        createdAt:
          entry.createdAt
            .toISOString(),
      }),
    );


  return {
    seller: {
      id:
        seller.id,

      sellerCode:
        seller.sellerCode,

      businessName:
        seller.businessName,

      legalBusinessName:
        seller.legalBusinessName,

      contactFirstName:
        seller.contactFirstName,

      contactLastName:
        seller.contactLastName,

      email:
        seller.email,

      phone:
        seller.phone,

      storeSlug:
        seller.storeSlug,

      storeDescription:
        seller.storeDescription,

      address1:
        seller.address1,

      address2:
        seller.address2,

      city:
        seller.city,

      state:
        seller.state,

      postalCode:
        seller.postalCode,

      country:
        seller.country,

      sellsNationwide:
        seller.sellsNationwide,

      offersLocalPickup:
        seller.offersLocalPickup,

      offersLocalDelivery:
        seller.offersLocalDelivery,

      offersSameDayDelivery:
        seller.offersSameDayDelivery,

      returnPolicy:
        seller.returnPolicy,

      shopifyVendor:
        seller.shopifyVendor,

      nexusSellerId:
        seller.nexusSellerId,

      status:
        seller.status,

      commissionRate:
        seller.commissionRate,

      activeProductLimit:
        seller.activeProductLimit,

      payoutStatus:
        seller.payoutStatus,

      stripeAccountId:
        seller.stripeAccountId,

      payoutTier:
        seller.payoutTier,

      successfulDeliveredOrders:
        seller.successfulDeliveredOrders,

      fastPayoutEligibleAt:
        seller.fastPayoutEligibleAt
          ?.toISOString() ||
        null,

      fastPayoutUnlockedAt:
        seller.fastPayoutUnlockedAt
          ?.toISOString() ||
        null,

      fastPayoutSuspendedAt:
        seller.fastPayoutSuspendedAt
          ?.toISOString() ||
        null,

      approvedAt:
        seller.approvedAt
          ?.toISOString() ||
        null,

      suspendedAt:
        seller.suspendedAt
          ?.toISOString() ||
        null,

      deactivatedAt:
        seller.deactivatedAt
          ?.toISOString() ||
        null,

      createdAt:
        seller.createdAt
          .toISOString(),

      onboarding:
        seller.onboarding
          ? {
              status:
                seller.onboarding.status,

              currentStep:
                seller.onboarding.currentStep,

              businessComplete:
                seller.onboarding.businessComplete,

              storefrontComplete:
                seller.onboarding.storefrontComplete,

              fulfillmentComplete:
                seller.onboarding.fulfillmentComplete,

              returnsComplete:
                seller.onboarding.returnsComplete,

              payoutsComplete:
                seller.onboarding.payoutsComplete,

              agreementsComplete:
                seller.onboarding.agreementsComplete,

              agreementsCompletedAt:
                seller.onboarding
                  .agreementsCompletedAt
                  ?.toISOString() ||
                null,

              completedAt:
                seller.onboarding
                  .completedAt
                  ?.toISOString() ||
                null,
            }
          : null,

      portalAccounts:
        seller.portalAccounts,
    },

    products: {
      total:
        totalProducts,

      active:
        activeProducts,

      draft:
        draftProducts,

      pending:
        pendingProducts,

      archived:
        archivedProducts,

      rejected:
        rejectedProducts,
    },

    financials: {
      grossSalesCents,
      commissionCents,
      sellerEarningsCents,
      refundsCents,
      paidToSellerCents,
      payoutReadyCents,
    },

    ledgerEntries,
  };
};


// ==========================================================
// ACTION
// ==========================================================

export const action = async ({
  request,
  params,
}: ActionFunctionArgs) => {
  await authenticate.admin(
    request,
  );


  if (!params.sellerCode) {
    return {
      success:
        false,

      message:
        "Seller code is missing.",
    };
  }


  const formData =
    await request.formData();


  const status =
    String(
      formData.get(
        "status",
      ) ||
        "ACTIVE",
    );


  const commissionRate =
    Number(
      formData.get(
        "commissionRate",
      ) ||
        0,
    );


  const activeProductLimit =
    Number(
      formData.get(
        "activeProductLimit",
      ) ||
        50,
    );


  const payoutTier =
    String(
      formData.get(
        "payoutTier",
      ) ||
        "STANDARD",
    );


  const nexusSellerIdRaw =
    String(
      formData.get(
        "nexusSellerId",
      ) ||
        "",
    ).trim();


  const allowedStatuses =
    [
      "ACTIVE",
      "SUSPENDED",
      "INACTIVE",
      "CLOSED",
    ];


  const allowedPayoutTiers =
    [
      "STANDARD",
      "FAST",
      "TRUSTED",
    ];


  if (
    !allowedStatuses.includes(
      status,
    )
  ) {
    return {
      success:
        false,

      message:
        "Invalid seller status.",
    };
  }


  if (
    !allowedPayoutTiers.includes(
      payoutTier,
    )
  ) {
    return {
      success:
        false,

      message:
        "Invalid payout tier.",
    };
  }


  if (
    Number.isNaN(
      commissionRate,
    ) ||
    commissionRate <
      0 ||
    commissionRate >
      100
  ) {
    return {
      success:
        false,

      message:
        "Commission rate must be between 0 and 100.",
    };
  }


  if (
    Number.isNaN(
      activeProductLimit,
    ) ||
    activeProductLimit <
      0 ||
    activeProductLimit >
      500
  ) {
    return {
      success:
        false,

      message:
        "Active product limit must be between 0 and 500.",
    };
  }


  const existingSeller =
    await db.seller.findUnique({
      where: {
        sellerCode:
          params.sellerCode,
      },

      select: {
        status:
          true,
      },
    });


  if (!existingSeller) {
    return {
      success:
        false,

      message:
        "Seller was not found.",
    };
  }


  const now =
    new Date();


  await db.seller.update({
    where: {
      sellerCode:
        params.sellerCode,
    },

    data: {
      status,

      commissionRate,

      activeProductLimit:
        Math.floor(
          activeProductLimit,
        ),

      payoutTier,

      nexusSellerId:
        nexusSellerIdRaw
          ? nexusSellerIdRaw
          : null,

      suspendedAt:
        status ===
        "SUSPENDED"
          ? now
          : existingSeller.status ===
              "SUSPENDED"
            ? null
            : undefined,

      deactivatedAt:
        status ===
          "INACTIVE" ||
        status ===
          "CLOSED"
          ? now
          : (
              existingSeller.status ===
                "INACTIVE" ||
              existingSeller.status ===
                "CLOSED"
            )
            ? null
            : undefined,
    },
  });


  return {
    success:
      true,

    message:
      "Seller changes saved.",
  };
};


// ==========================================================
// PAGE
// ==========================================================

export default function SellerDetailPage() {
  const {
    seller,
    products,
    financials,
    ledgerEntries,
  } =
    useLoaderData<
      typeof loader
    >();


  const fetcher =
    useFetcher<
      typeof action
    >();


  const isSaving =
    fetcher.state !==
    "idle";


  const contactName =
    [
      seller.contactFirstName,
      seller.contactLastName,
    ]
      .filter(Boolean)
      .join(" ");


  return (
    <div
      style={{
        maxWidth:
          "1220px",
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
          display:
            "flex",
          justifyContent:
            "space-between",
          gap:
            "18px",
          alignItems:
            "flex-start",
          flexWrap:
            "wrap",
          marginBottom:
            "22px",
        }}
      >
        <div>
          <div
            style={{
              color:
                "#7b3fa0",
              fontSize:
                "11px",
              fontWeight:
                "800",
              letterSpacing:
                "1.3px",
              textTransform:
                "uppercase",
            }}
          >
            HairGrab Seller Management
          </div>

          <h1
            style={{
              margin:
                "6px 0 5px",
              color:
                "#542378",
              fontSize:
                "31px",
            }}
          >
            {seller.businessName}
          </h1>

          <div
            style={{
              color:
                "#756b7b",
              fontSize:
                "12px",
            }}
          >
            {seller.sellerCode}
            {" • "}
            {seller.shopifyVendor}
          </div>
        </div>


        <div
          style={{
            display:
              "flex",
            gap:
              "8px",
            flexWrap:
              "wrap",
          }}
        >
          <Link
            to="/app/sellers"
            style={
              secondaryButtonStyle
            }
          >
            ← Sellers
          </Link>

          <Link
            to="/app/payouts"
            style={
              secondaryButtonStyle
            }
          >
            Payouts
          </Link>

          {seller.storeSlug && (
            <a
              href={`https://shops.hairgrab.com/seller-store/${seller.storeSlug}`}
              target="_blank"
              rel="noreferrer"
              style={
                primaryButtonStyle
              }
            >
              Storefront ↗
            </a>
          )}
        </div>
      </div>


      {/* HELP */}

      <div
        style={{
          ...cardStyle,
          background:
            "#faf7fc",
          marginBottom:
            "20px",
        }}
      >
        <div
          style={{
            color:
              "#542378",
            fontWeight:
              "800",
            fontSize:
              "14px",
          }}
        >
          What this page controls
        </div>

        <div
          style={{
            marginTop:
              "7px",
            color:
              "#6f6675",
            fontSize:
              "12px",
            lineHeight:
              1.65,
          }}
        >
          Use this page for marketplace-level seller management.
          You can activate, suspend, deactivate or close a seller,
          change their HairGrab commission, adjust their active
          product limit and review onboarding, Stripe payout status,
          products and financial activity. Stripe connection status
          is shown for reference and is not manually overridden here.
        </div>
      </div>


      {/* SAVE RESULT */}

      {fetcher.data?.message && (
        <div
          style={{
            marginBottom:
              "18px",
            padding:
              "13px 15px",
            borderRadius:
              "10px",

            background:
              fetcher.data.success
                ? "#edf8ef"
                : "#fff0f0",

            color:
              fetcher.data.success
                ? "#28743b"
                : "#922f2f",

            border:
              fetcher.data.success
                ? "1px solid #cfe8d4"
                : "1px solid #efcccc",

            fontWeight:
              "700",

            fontSize:
              "12px",
          }}
        >
          {fetcher.data.message}
        </div>
      )}


      {/* TOP STATUS CARDS */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(170px, 1fr))",
          gap:
            "13px",
          marginBottom:
            "20px",
        }}
      >
        <SummaryCard
          label="Marketplace"
          value={
            formatStatus(
              seller.status,
            )
          }
        />

        <SummaryCard
          label="Onboarding"
          value={
            seller.onboarding
              ?.status ===
            "COMPLETE"
              ? "Complete"
              : "Incomplete"
          }
        />

        <SummaryCard
          label="Payout"
          value={
            formatStatus(
              seller.payoutStatus,
            )
          }
        />

        <SummaryCard
          label="Commission"
          value={`${seller.commissionRate}%`}
        />

        <SummaryCard
          label="Products"
          value={`${products.active} Active`}
        />

        <SummaryCard
          label="Product Limit"
          value={
            String(
              seller.activeProductLimit,
            )
          }
        />
      </div>


      {/* MANAGEMENT + ACCOUNT */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(330px, 1fr))",
          gap:
            "18px",
        }}
      >
        {/* ADMIN CONTROLS */}

        <div
          style={
            cardStyle
          }
        >
          <SectionHeader
            title="Marketplace Controls"
            help="Settings HairGrab administrators may change."
          />

          <fetcher.Form
            method="post"
          >
            <AdminField
              label="Marketplace Status"
              help="ACTIVE can sell. SUSPENDED is temporarily restricted. INACTIVE is disabled. CLOSED is no longer participating."
            >
              <select
                name="status"
                defaultValue={
                  seller.status
                }
                style={
                  inputStyle
                }
              >
                <option value="ACTIVE">
                  ACTIVE
                </option>

                <option value="SUSPENDED">
                  SUSPENDED
                </option>

                <option value="INACTIVE">
                  INACTIVE
                </option>

                <option value="CLOSED">
                  CLOSED
                </option>
              </select>
            </AdminField>


            <AdminField
              label="Commission Rate %"
              help="HairGrab marketplace commission for this seller."
            >
              <input
                type="number"
                name="commissionRate"
                min="0"
                max="100"
                step="0.01"
                defaultValue={
                  seller.commissionRate
                }
                style={
                  inputStyle
                }
              />
            </AdminField>


            <AdminField
              label="Active Product Limit"
              help="Maximum active HairGrab listings for this seller."
            >
              <input
                type="number"
                name="activeProductLimit"
                min="0"
                max="500"
                step="1"
                defaultValue={
                  seller.activeProductLimit
                }
                style={
                  inputStyle
                }
              />
            </AdminField>


            <AdminField
              label="Payout Tier"
              help="STANDARD is normal payout timing. FAST/TRUSTED are reserved for sellers who qualify."
            >
              <select
                name="payoutTier"
                defaultValue={
                  seller.payoutTier
                }
                style={
                  inputStyle
                }
              >
                <option value="STANDARD">
                  STANDARD
                </option>

                <option value="FAST">
                  FAST
                </option>

                <option value="TRUSTED">
                  TRUSTED
                </option>
              </select>
            </AdminField>


            <AdminField
              label="Legacy Nexus Seller ID"
              help="Temporary legacy reference. Leave blank for sellers that never used Nexus."
            >
              <input
                type="text"
                name="nexusSellerId"
                defaultValue={
                  seller.nexusSellerId ||
                  ""
                }
                style={
                  inputStyle
                }
              />
            </AdminField>


            <button
              type="submit"
              disabled={
                isSaving
              }
              style={{
                ...primaryButtonStyle,
                width:
                  "100%",
                border:
                  "none",
                marginTop:
                  "18px",
                cursor:
                  isSaving
                    ? "wait"
                    : "pointer",
                opacity:
                  isSaving
                    ? 0.65
                    : 1,
              }}
            >
              {isSaving
                ? "Saving..."
                : "Save Seller Changes"}
            </button>
          </fetcher.Form>
        </div>


        {/* BUSINESS INFORMATION */}

        <div
          style={
            cardStyle
          }
        >
          <SectionHeader
            title="Business & Contact"
            help="Information carried forward from the seller application and onboarding."
          />

          <InfoRow
            label="Business Name"
            value={
              seller.businessName
            }
          />

          <InfoRow
            label="Legal Business Name"
            value={
              displayValue(
                seller.legalBusinessName,
              )
            }
          />

          <InfoRow
            label="Contact"
            value={
              displayValue(
                contactName,
              )
            }
          />

          <InfoRow
            label="Email"
            value={
              displayValue(
                seller.email,
              )
            }
          />

          <InfoRow
            label="Phone"
            value={
              displayValue(
                seller.phone,
              )
            }
          />

          <InfoRow
            label="Location"
            value={
              [
                seller.city,
                seller.state,
                seller.postalCode,
              ]
                .filter(Boolean)
                .join(", ") ||
              "Not provided"
            }
          />
        </div>


        {/* ONBOARDING */}

        <div
          style={
            cardStyle
          }
        >
          <SectionHeader
            title="Seller Onboarding"
            help="The required HairGrab seller setup. Products are not required to finish registration."
          />

          {!seller.onboarding ? (
            <EmptyText>
              No onboarding record exists for this seller.
            </EmptyText>
          ) : (
            <>
              <InfoRow
                label="Overall Status"
                value={
                  formatStatus(
                    seller.onboarding.status,
                  )
                }
              />

              <InfoRow
                label="Current Step"
                value={
                  formatStatus(
                    seller.onboarding.currentStep,
                  )
                }
              />

              <CheckRow
                label="Business Details"
                complete={
                  seller.onboarding.businessComplete
                }
              />

              <CheckRow
                label="Storefront"
                complete={
                  seller.onboarding.storefrontComplete
                }
              />

              <CheckRow
                label="Shipping & Fulfillment"
                complete={
                  seller.onboarding.fulfillmentComplete
                }
              />

              <CheckRow
                label="Returns"
                complete={
                  seller.onboarding.returnsComplete
                }
              />

              <CheckRow
                label="Payouts"
                complete={
                  seller.onboarding.payoutsComplete
                }
              />

              <CheckRow
                label="Seller Agreement"
                complete={
                  seller.onboarding.agreementsComplete
                }
              />

              <InfoRow
                label="Agreement Accepted"
                value={
                  formatDate(
                    seller.onboarding
                      .agreementsCompletedAt,
                  )
                }
              />

              <InfoRow
                label="Setup Completed"
                value={
                  formatDate(
                    seller.onboarding
                      .completedAt,
                  )
                }
              />
            </>
          )}
        </div>


        {/* PAYOUT */}

        <div
          style={
            cardStyle
          }
        >
          <SectionHeader
            title="Stripe & Payouts"
            help="Stripe handles seller banking, identity and verification. HairGrab stores the connected account reference and payout status."
          />

          <InfoRow
            label="Payout Status"
            value={
              formatStatus(
                seller.payoutStatus,
              )
            }
          />

          <InfoRow
            label="Stripe Account"
            value={
              seller.stripeAccountId ||
              "Not connected"
            }
          />

          <InfoRow
            label="Payout Tier"
            value={
              formatStatus(
                seller.payoutTier,
              )
            }
          />

          <InfoRow
            label="Successful Delivered Orders"
            value={
              String(
                seller.successfulDeliveredOrders,
              )
            }
          />

          <InfoRow
            label="Fast Payout Eligible"
            value={
              formatDate(
                seller.fastPayoutEligibleAt,
              )
            }
          />

          <InfoRow
            label="Fast Payout Unlocked"
            value={
              formatDate(
                seller.fastPayoutUnlockedAt,
              )
            }
          />

          {seller.fastPayoutSuspendedAt && (
            <div
              style={
                warningBoxStyle
              }
            >
              Fast payouts are currently suspended for this seller.
            </div>
          )}
        </div>


        {/* FULFILLMENT */}

        <div
          style={
            cardStyle
          }
        >
          <SectionHeader
            title="Fulfillment & Returns"
            help="Seller options shoppers may see on HairGrab."
          />

          <InfoRow
            label="Ships Nationwide"
            value={
              yesNo(
                seller.sellsNationwide,
              )
            }
          />

          <InfoRow
            label="Local Pickup"
            value={
              yesNo(
                seller.offersLocalPickup,
              )
            }
          />

          <InfoRow
            label="Local Delivery"
            value={
              yesNo(
                seller.offersLocalDelivery,
              )
            }
          />

          <InfoRow
            label="HairGrab Same-Day Delivery"
            value={
              yesNo(
                seller.offersSameDayDelivery,
              )
            }
          />

          <InfoRow
            label="Return Policy"
            value={
              formatStatus(
                seller.returnPolicy,
              )
            }
          />

          <InfoRow
            label="Store Slug"
            value={
              displayValue(
                seller.storeSlug,
              )
            }
          />
        </div>


        {/* PORTAL ACCOUNT */}

        <div
          style={
            cardStyle
          }
        >
          <SectionHeader
            title="Seller Portal Access"
            help="People authorized to sign in to this seller account."
          />

          {seller.portalAccounts.length ===
          0 ? (
            <EmptyText>
              No seller portal account has been created.
            </EmptyText>
          ) : (
            seller.portalAccounts.map(
              (
                account,
              ) => (
                <div
                  key={
                    account.id
                  }
                  style={{
                    borderBottom:
                      "1px solid #eee7f2",
                    padding:
                      "11px 0",
                  }}
                >
                  <div
                    style={{
                      color:
                        "#2b1b35",
                      fontWeight:
                        "800",
                      fontSize:
                        "12px",
                    }}
                  >
                    {[
                      account.firstName,
                      account.lastName,
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                      account.email}
                  </div>

                  <div
                    style={{
                      color:
                        "#817787",
                      fontSize:
                        "10px",
                      marginTop:
                        "3px",
                    }}
                  >
                    {account.email}
                    {" • "}
                    {formatStatus(
                      account.role,
                    )}
                    {" • "}
                    {formatStatus(
                      account.status,
                    )}
                  </div>

                  <div
                    style={{
                      color:
                        "#95899a",
                      fontSize:
                        "9px",
                      marginTop:
                        "4px",
                    }}
                  >
                    Last login:{" "}
                    {formatDate(
                      account.lastLoginAt,
                    )}
                  </div>
                </div>
              ),
            )
          )}
        </div>
      </div>


      {/* PRODUCTS */}

      <div
        style={{
          ...cardStyle,
          marginTop:
            "20px",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "flex-start",
            gap:
              "12px",
            flexWrap:
              "wrap",
          }}
        >
          <SectionHeader
            title="Seller Products"
            help="Products are managed separately from onboarding. Drafts must never appear publicly."
          />

          <div
            style={{
              color:
                "#542378",
              fontSize:
                "11px",
              fontWeight:
                "800",
            }}
          >
            Active limit:{" "}
            {seller.activeProductLimit}
          </div>
        </div>


        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(135px, 1fr))",
            gap:
              "10px",
            marginTop:
              "15px",
          }}
        >
          <MiniStat
            label="Total"
            value={
              products.total
            }
          />

          <MiniStat
            label="Active"
            value={
              products.active
            }
          />

          <MiniStat
            label="Draft"
            value={
              products.draft
            }
          />

          <MiniStat
            label="Pending"
            value={
              products.pending
            }
          />

          <MiniStat
            label="Archived"
            value={
              products.archived
            }
          />

          <MiniStat
            label="Rejected"
            value={
              products.rejected
            }
          />
        </div>
      </div>


      {/* FINANCIAL SUMMARY */}

      <div
        style={{
          ...cardStyle,
          marginTop:
            "20px",
        }}
      >
        <SectionHeader
          title="Financial Summary"
          help="Live totals from the HairGrab seller ledger."
        />

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(160px, 1fr))",
            gap:
              "14px",
            marginTop:
              "18px",
          }}
        >
          <MoneyStat
            label="Gross Sales"
            cents={
              financials.grossSalesCents
            }
          />

          <MoneyStat
            label="HairGrab Commission"
            cents={
              financials.commissionCents
            }
          />

          <MoneyStat
            label="Seller Earnings"
            cents={
              financials.sellerEarningsCents
            }
          />

          <MoneyStat
            label="Refunds"
            cents={
              financials.refundsCents
            }
          />

          <MoneyStat
            label="Paid to Seller"
            cents={
              financials.paidToSellerCents
            }
          />

          <MoneyStat
            label="Payout Ready"
            cents={
              financials.payoutReadyCents
            }
          />
        </div>
      </div>


      {/* LEDGER */}

      <div
        style={{
          ...cardStyle,
          marginTop:
            "20px",
          marginBottom:
            "30px",
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
          }}
        >
          <SectionHeader
            title="Recent Seller Ledger"
            help="Sales, refunds, adjustments and payout activity recorded for this seller."
          />

          <Link
            to="/app/ledger"
            style={
              secondaryButtonStyle
            }
          >
            Full Ledger
          </Link>
        </div>


        {ledgerEntries.length ===
        0 ? (
          <div
            style={
              emptyStyle
            }
          >
            No seller ledger activity yet.
          </div>
        ) : (
          <div
            style={{
              overflowX:
                "auto",
              marginTop:
                "15px",
            }}
          >
            <table
              style={{
                width:
                  "100%",
                borderCollapse:
                  "collapse",
                minWidth:
                  "950px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background:
                      "#f8f1fc",
                  }}
                >
                  <th style={tableHeaderStyle}>
                    Date
                  </th>

                  <th style={tableHeaderStyle}>
                    Order
                  </th>

                  <th style={tableHeaderStyle}>
                    Type
                  </th>

                  <th style={tableHeaderStyle}>
                    Ledger Status
                  </th>

                  <th style={tableHeaderStyle}>
                    Funds
                  </th>

                  <th style={tableHeaderStyle}>
                    Gross
                  </th>

                  <th style={tableHeaderStyle}>
                    HairGrab
                  </th>

                  <th style={tableHeaderStyle}>
                    Seller
                  </th>

                  <th style={tableHeaderStyle}>
                    Payout
                  </th>
                </tr>
              </thead>

              <tbody>
                {ledgerEntries.map(
                  (
                    entry,
                  ) => (
                    <tr
                      key={
                        entry.id
                      }
                    >
                      <td style={tableCellStyle}>
                        {formatDate(
                          entry.shopifyCreatedAt ||
                            entry.createdAt,
                        )}
                      </td>

                      <td style={tableCellStyle}>
                        {entry.shopifyOrderName ||
                          entry.shopifyOrderId}
                      </td>

                      <td style={tableCellStyle}>
                        {formatStatus(
                          entry.entryType,
                        )}
                      </td>

                      <td style={tableCellStyle}>
                        {formatStatus(
                          entry.status,
                        )}
                      </td>

                      <td style={tableCellStyle}>
                        {formatStatus(
                          entry.fundsStatus,
                        )}
                      </td>

                      <td style={tableCellStyle}>
                        {formatMoney(
                          entry.grossAmountCents,
                          entry.currency,
                        )}
                      </td>

                      <td style={tableCellStyle}>
                        {formatMoney(
                          entry.commissionAmountCents,
                          entry.currency,
                        )}
                      </td>

                      <td style={tableCellStyle}>
                        {formatMoney(
                          entry.sellerEarningsCents,
                          entry.currency,
                        )}
                      </td>

                      <td style={tableCellStyle}>
                        {formatMoney(
                          entry.payoutAmountCents,
                          entry.currency,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>


      <Link
        to="/app/sellers"
        style={
          secondaryButtonStyle
        }
      >
        ← Back to Sellers
      </Link>
    </div>
  );
}


// ==========================================================
// COMPONENTS
// ==========================================================

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={
        cardStyle
      }
    >
      <div
        style={{
          color:
            "#817787",
          fontSize:
            "10px",
          fontWeight:
            "700",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color:
            "#542378",
          fontSize:
            "17px",
          fontWeight:
            "800",
          marginTop:
            "6px",
        }}
      >
        {value}
      </div>
    </div>
  );
}


function SectionHeader({
  title,
  help,
}: {
  title: string;
  help: string;
}) {
  return (
    <div>
      <h2
        style={{
          margin:
            0,
          color:
            "#542378",
          fontSize:
            "18px",
        }}
      >
        {title}
      </h2>

      <div
        style={{
          color:
            "#817787",
          fontSize:
            "10px",
          lineHeight:
            1.5,
          marginTop:
            "4px",
        }}
      >
        {help}
      </div>
    </div>
  );
}


function AdminField({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children:
    React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop:
          "17px",
      }}
    >
      <label
        style={{
          display:
            "block",
          color:
            "#542378",
          fontSize:
            "11px",
          fontWeight:
            "800",
          marginBottom:
            "5px",
        }}
      >
        {label}
      </label>

      {children}

      <div
        style={{
          color:
            "#95899a",
          fontSize:
            "9px",
          lineHeight:
            1.45,
          marginTop:
            "5px",
        }}
      >
        {help}
      </div>
    </div>
  );
}


function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        borderBottom:
          "1px solid #eee7f2",
        padding:
          "10px 0",
      }}
    >
      <div
        style={{
          color:
            "#817787",
          fontSize:
            "9px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color:
            "#2b1b35",
          fontSize:
            "12px",
          fontWeight:
            "700",
          marginTop:
            "3px",
          overflowWrap:
            "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}


function CheckRow({
  label,
  complete,
}: {
  label: string;
  complete: boolean;
}) {
  return (
    <div
      style={{
        display:
          "flex",
        justifyContent:
          "space-between",
        alignItems:
          "center",
        borderBottom:
          "1px solid #eee7f2",
        padding:
          "9px 0",
        gap:
          "10px",
      }}
    >
      <div
        style={{
          fontSize:
            "11px",
          color:
            "#4f4554",
        }}
      >
        {label}
      </div>

      <span
        style={{
          color:
            complete
              ? "#28743b"
              : "#805c12",

          background:
            complete
              ? "#edf8ef"
              : "#fff8e7",

          borderRadius:
            "20px",

          padding:
            "4px 7px",

          fontSize:
            "8px",

          fontWeight:
            "800",
        }}
      >
        {complete
          ? "✓ Complete"
          : "Incomplete"}
      </span>
    </div>
  );
}


function MiniStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        background:
          "#faf8fc",
        border:
          "1px solid #eee5f3",
        borderRadius:
          "10px",
        padding:
          "12px",
      }}
    >
      <div
        style={{
          color:
            "#817787",
          fontSize:
            "9px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color:
            "#542378",
          fontSize:
            "20px",
          fontWeight:
            "800",
          marginTop:
            "3px",
        }}
      >
        {value}
      </div>
    </div>
  );
}


function MoneyStat({
  label,
  cents,
}: {
  label: string;
  cents: number;
}) {
  return (
    <div>
      <div
        style={{
          color:
            "#817787",
          fontSize:
            "9px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color:
            "#542378",
          fontSize:
            "20px",
          fontWeight:
            "800",
          marginTop:
            "4px",
        }}
      >
        {formatMoney(
          cents,
        )}
      </div>
    </div>
  );
}


function EmptyText({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <div
      style={{
        color:
          "#817787",
        fontSize:
          "11px",
        padding:
          "20px 0",
      }}
    >
      {children}
    </div>
  );
}


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


const inputStyle = {
  width:
    "100%",

  boxSizing:
    "border-box" as const,

  border:
    "1px solid #d9c9e4",

  borderRadius:
    "8px",

  padding:
    "10px 11px",

  fontSize:
    "12px",

  background:
    "#ffffff",

  color:
    "#21152a",
};


const primaryButtonStyle = {
  display:
    "inline-block",

  background:
    "#542378",

  color:
    "#ffffff",

  borderRadius:
    "8px",

  padding:
    "10px 13px",

  textDecoration:
    "none",

  fontWeight:
    "800",

  fontSize:
    "11px",

  boxSizing:
    "border-box" as const,
};


const secondaryButtonStyle = {
  display:
    "inline-block",

  background:
    "#ffffff",

  color:
    "#542378",

  border:
    "1px solid #d8c8e2",

  borderRadius:
    "8px",

  padding:
    "9px 12px",

  textDecoration:
    "none",

  fontWeight:
    "800",

  fontSize:
    "10px",
};


const warningBoxStyle = {
  background:
    "#fff8e7",

  color:
    "#805c12",

  border:
    "1px solid #ead9a8",

  borderRadius:
    "9px",

  padding:
    "11px",

  marginTop:
    "12px",

  fontSize:
    "10px",

  fontWeight:
    "700",
};


const emptyStyle = {
  padding:
    "30px 20px",

  textAlign:
    "center" as const,

  color:
    "#817787",

  background:
    "#fcf9fe",

  border:
    "1px dashed #d9c9e4",

  borderRadius:
    "10px",

  fontSize:
    "11px",

  marginTop:
    "15px",
};


const tableHeaderStyle = {
  padding:
    "10px",

  textAlign:
    "left" as const,

  fontSize:
    "9px",

  color:
    "#542378",

  textTransform:
    "uppercase" as const,
};


const tableCellStyle = {
  padding:
    "11px 10px",

  fontSize:
    "10px",

  color:
    "#35273d",

  borderBottom:
    "1px solid #eee6f2",
};