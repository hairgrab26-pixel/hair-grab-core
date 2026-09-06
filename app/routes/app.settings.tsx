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
// LOADER
// ==========================================================

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const settings =
    await db.marketplaceSettings.upsert({
      where: {
        id: "hairgrab",
      },

      update: {},

      create: {
        id: "hairgrab",

        standardCommissionRate:
          7,

        foundingSellerCommissionRate:
          5,

        defaultActiveProductLimit:
          50,

        sellerApplicationsOpen:
          true,

        requireSellerApproval:
          true,

        requireProductApproval:
          true,

        productPublishingPaused:
          false,

        defaultShippingSlaHours:
          48,

        defaultReturnPolicy:
          "14_DAY_RETURNS",

        localPickupEnabled:
          true,

        localDeliveryEnabled:
          true,
      },
    });


  return {
    settings: {
      standardCommissionRate:
        settings.standardCommissionRate,

      foundingSellerCommissionRate:
        settings.foundingSellerCommissionRate,

      defaultActiveProductLimit:
        settings.defaultActiveProductLimit,

      sellerApplicationsOpen:
        settings.sellerApplicationsOpen,

      requireSellerApproval:
        settings.requireSellerApproval,

      requireProductApproval:
        settings.requireProductApproval,

      productPublishingPaused:
        settings.productPublishingPaused,

      defaultShippingSlaHours:
        settings.defaultShippingSlaHours,

      defaultReturnPolicy:
        settings.defaultReturnPolicy,

      localPickupEnabled:
        settings.localPickupEnabled,

      localDeliveryEnabled:
        settings.localDeliveryEnabled,

      supportEmail:
        settings.supportEmail || "",

      updatedAt:
        settings.updatedAt.toISOString(),
    },
  };
};


// ==========================================================
// ACTION
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData =
    await request.formData();


  const standardCommissionRate =
    Number(
      formData.get(
        "standardCommissionRate",
      ) || 0,
    );


  const foundingSellerCommissionRate =
    Number(
      formData.get(
        "foundingSellerCommissionRate",
      ) || 0,
    );


  const defaultActiveProductLimit =
    Number(
      formData.get(
        "defaultActiveProductLimit",
      ) || 0,
    );


  const defaultShippingSlaHours =
    Number(
      formData.get(
        "defaultShippingSlaHours",
      ) || 0,
    );


  const defaultReturnPolicy =
    String(
      formData.get(
        "defaultReturnPolicy",
      ) ||
        "14_DAY_RETURNS",
    );


  const supportEmail =
    String(
      formData.get(
        "supportEmail",
      ) || "",
    ).trim();


  const sellerApplicationsOpen =
    formData.get(
      "sellerApplicationsOpen",
    ) === "on";


  const requireSellerApproval =
    formData.get(
      "requireSellerApproval",
    ) === "on";


  const requireProductApproval =
    formData.get(
      "requireProductApproval",
    ) === "on";


  const productPublishingPaused =
    formData.get(
      "productPublishingPaused",
    ) === "on";


  const localPickupEnabled =
    formData.get(
      "localPickupEnabled",
    ) === "on";


  const localDeliveryEnabled =
    formData.get(
      "localDeliveryEnabled",
    ) === "on";


  if (
    Number.isNaN(
      standardCommissionRate,
    ) ||
    standardCommissionRate < 0 ||
    standardCommissionRate > 100
  ) {
    return {
      success: false,

      message:
        "Standard commission must be between 0% and 100%.",
    };
  }


  if (
    Number.isNaN(
      foundingSellerCommissionRate,
    ) ||
    foundingSellerCommissionRate < 0 ||
    foundingSellerCommissionRate > 100
  ) {
    return {
      success: false,

      message:
        "Founding Seller commission must be between 0% and 100%.",
    };
  }


  if (
    !Number.isInteger(
      defaultActiveProductLimit,
    ) ||
    defaultActiveProductLimit < 1 ||
    defaultActiveProductLimit > 500
  ) {
    return {
      success: false,

      message:
        "Default active product limit must be between 1 and 500.",
    };
  }


  if (
    !Number.isInteger(
      defaultShippingSlaHours,
    ) ||
    defaultShippingSlaHours < 1 ||
    defaultShippingSlaHours > 168
  ) {
    return {
      success: false,

      message:
        "Shipping SLA must be between 1 and 168 hours.",
    };
  }


  const allowedReturnPolicies =
    [
      "14_DAY_RETURNS",
      "FINAL_SALE",
    ];


  if (
    !allowedReturnPolicies.includes(
      defaultReturnPolicy,
    )
  ) {
    return {
      success: false,

      message:
        "Invalid default return policy.",
    };
  }


  await db.marketplaceSettings.upsert({
    where: {
      id: "hairgrab",
    },

    update: {
      standardCommissionRate,

      foundingSellerCommissionRate,

      defaultActiveProductLimit,

      sellerApplicationsOpen,

      requireSellerApproval,

      requireProductApproval,

      productPublishingPaused,

      defaultShippingSlaHours,

      defaultReturnPolicy,

      localPickupEnabled,

      localDeliveryEnabled,

      supportEmail:
        supportEmail ||
        null,
    },

    create: {
      id: "hairgrab",

      standardCommissionRate,

      foundingSellerCommissionRate,

      defaultActiveProductLimit,

      sellerApplicationsOpen,

      requireSellerApproval,

      requireProductApproval,

      productPublishingPaused,

      defaultShippingSlaHours,

      defaultReturnPolicy,

      localPickupEnabled,

      localDeliveryEnabled,

      supportEmail:
        supportEmail ||
        null,
    },
  });


  return {
    success: true,

    message:
      "HairGrab marketplace settings saved.",
  };
};


// ==========================================================
// PAGE
// ==========================================================

export default function MarketplaceSettingsPage() {
  const {
    settings,
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


  return (
    <div
      style={{
        maxWidth: "1080px",
        margin: "0 auto",
        padding: "28px",
        fontFamily: "Arial, sans-serif",
        color: "#21152a",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "22px",
        }}
      >
        <div>
          <div
            style={{
              color: "#7b3fa0",
              fontSize: "11px",
              fontWeight: "800",
              textTransform:
                "uppercase",
              letterSpacing: "1.3px",
            }}
          >
            HairGrab Core
          </div>

          <h1
            style={{
              margin: "6px 0 5px",
              color: "#542378",
              fontSize: "32px",
            }}
          >
            Marketplace Settings
          </h1>

          <p
            style={{
              margin: 0,
              color: "#756b7b",
              fontSize: "13px",
              lineHeight: 1.6,
              maxWidth: "720px",
            }}
          >
            Manage the small number
            of marketplace-wide rules
            HairGrab actually needs.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <Link
            to="/app/guide"
            style={
              secondaryButtonStyle
            }
          >
            Admin Guide
          </Link>

          <Link
            to="/app"
            style={
              secondaryButtonStyle
            }
          >
            ← HairGrab Core
          </Link>
        </div>
      </div>


      {/* EXPLANATION */}

      <div
        style={{
          ...cardStyle,
          background: "#faf7fc",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            color: "#542378",
            fontWeight: "800",
            fontSize: "14px",
          }}
        >
          Keep this simple
        </div>

        <div
          style={{
            color: "#6f6675",
            fontSize: "11px",
            lineHeight: 1.7,
            marginTop: "7px",
          }}
        >
          These are HairGrab-wide
          defaults and operating
          controls. Individual seller
          commission rates and product
          limits can still be changed
          from that seller's Manage
          page. Changing a default here
          does not rewrite historical
          transactions or automatically
          overwrite existing seller
          exceptions.
        </div>
      </div>


      {/* SAVE RESULT */}

      {fetcher.data?.message && (
        <div
          style={{
            marginBottom: "18px",
            padding: "13px 15px",
            borderRadius: "10px",

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

            fontWeight: "700",
            fontSize: "12px",
          }}
        >
          {fetcher.data.message}
        </div>
      )}


      <fetcher.Form
        method="post"
      >
        {/* SELLER DEFAULTS */}

        <SettingsSection
          title="Seller Defaults"
          help="Defaults HairGrab can use when creating new seller accounts."
        >
          <FieldGrid>
            <Field
              label="Standard Commission %"
              help="Default HairGrab commission for standard sellers."
            >
              <input
                type="number"
                name="standardCommissionRate"
                min="0"
                max="100"
                step="0.01"
                defaultValue={
                  settings.standardCommissionRate
                }
                style={inputStyle}
              />
            </Field>

            <Field
              label="Founding Seller Commission %"
              help="Preferred reduced commission for approved Founding Sellers."
            >
              <input
                type="number"
                name="foundingSellerCommissionRate"
                min="0"
                max="100"
                step="0.01"
                defaultValue={
                  settings.foundingSellerCommissionRate
                }
                style={inputStyle}
              />
            </Field>

            <Field
              label="Default Active Product Limit"
              help="Default maximum number of active HairGrab listings per seller."
            >
              <input
                type="number"
                name="defaultActiveProductLimit"
                min="1"
                max="500"
                step="1"
                defaultValue={
                  settings.defaultActiveProductLimit
                }
                style={inputStyle}
              />
            </Field>
          </FieldGrid>
        </SettingsSection>


        {/* APPLICATIONS */}

        <SettingsSection
          title="Seller Applications"
          help="Controls who can enter the HairGrab seller pipeline."
        >
          <Toggle
            name="sellerApplicationsOpen"
            label="Seller applications are open"
            help="Turn this off when HairGrab temporarily does not want new seller applications."
            defaultChecked={
              settings.sellerApplicationsOpen
            }
          />

          <Toggle
            name="requireSellerApproval"
            label="Require HairGrab approval before seller activation"
            help="Recommended. A submitted application does not automatically make someone an active HairGrab seller."
            defaultChecked={
              settings.requireSellerApproval
            }
          />
        </SettingsSection>


        {/* PRODUCTS */}

        <SettingsSection
          title="Product Controls"
          help="Marketplace-level product publishing protection."
        >
          <Toggle
            name="requireProductApproval"
            label="Require product approval before public activation"
            help="Recommended while HairGrab is curated. Pending products remain non-public until approved."
            defaultChecked={
              settings.requireProductApproval
            }
          />

          <Toggle
            name="productPublishingPaused"
            label="Pause new product publishing"
            help="Emergency control. Existing active products remain unchanged, but new publishing can be temporarily stopped."
            defaultChecked={
              settings.productPublishingPaused
            }
            warning
          />

          <div
            style={{
              ...noticeStyle,
              marginTop: "12px",
            }}
          >
            Draft protection cannot be
            disabled here. A HairGrab
            Draft should never become
            publicly visible simply
            because another marketplace
            setting changes.
          </div>
        </SettingsSection>


        {/* FULFILLMENT */}

        <SettingsSection
          title="Fulfillment Defaults"
          help="Default marketplace expectations. Individual seller/product options may still vary."
        >
          <FieldGrid>
            <Field
              label="Default Shipping SLA"
              help="Number of hours sellers are generally expected to ship within."
            >
              <select
                name="defaultShippingSlaHours"
                defaultValue={
                  String(
                    settings.defaultShippingSlaHours,
                  )
                }
                style={inputStyle}
              >
                <option value="24">
                  24 hours
                </option>

                <option value="48">
                  48 hours
                </option>

                <option value="72">
                  72 hours
                </option>
              </select>
            </Field>

            <Field
              label="Default Return Policy"
              help="Default seller return policy when another allowed policy has not been selected."
            >
              <select
                name="defaultReturnPolicy"
                defaultValue={
                  settings.defaultReturnPolicy
                }
                style={inputStyle}
              >
                <option value="14_DAY_RETURNS">
                  14-Day Returns
                </option>

                <option value="FINAL_SALE">
                  Final Sale
                </option>
              </select>
            </Field>
          </FieldGrid>

          <Toggle
            name="localPickupEnabled"
            label="Local Pickup feature enabled"
            help="Allows HairGrab sellers to offer local pickup where supported."
            defaultChecked={
              settings.localPickupEnabled
            }
          />

          <Toggle
            name="localDeliveryEnabled"
            label="Local Delivery feature enabled"
            help="Allows local-delivery capability where HairGrab supports it."
            defaultChecked={
              settings.localDeliveryEnabled
            }
          />
        </SettingsSection>


        {/* SUPPORT */}

        <SettingsSection
          title="Marketplace Support"
          help="Basic HairGrab administrative contact information."
        >
          <Field
            label="Seller Support Email"
            help="Email HairGrab sellers should use when they need marketplace support."
          >
            <input
              type="email"
              name="supportEmail"
              defaultValue={
                settings.supportEmail
              }
              placeholder="support@hairgrab.com"
              style={inputStyle}
            />
          </Field>
        </SettingsSection>


        {/* SAVE */}

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginTop: "20px",
          }}
        >
          <div
            style={{
              color: "#95899a",
              fontSize: "9px",
            }}
          >
            Last updated:{" "}
            {new Date(
              settings.updatedAt,
            ).toLocaleString()}
          </div>

          <button
            type="submit"
            disabled={isSaving}
            style={{
              ...primaryButtonStyle,

              border: "none",

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
              : "Save Marketplace Settings"}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}


// ==========================================================
// COMPONENTS
// ==========================================================

function SettingsSection({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children:
    React.ReactNode;
}) {
  return (
    <section
      style={{
        ...cardStyle,
        marginBottom: "18px",
      }}
    >
      <h2
        style={{
          margin: 0,
          color: "#542378",
          fontSize: "19px",
        }}
      >
        {title}
      </h2>

      <div
        style={{
          color: "#817787",
          fontSize: "10px",
          lineHeight: 1.5,
          marginTop: "4px",
          marginBottom: "15px",
        }}
      >
        {help}
      </div>

      {children}
    </section>
  );
}


function FieldGrid({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "14px",
      }}
    >
      {children}
    </div>
  );
}


function Field({
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
        marginBottom: "13px",
      }}
    >
      <label
        style={{
          display: "block",
          color: "#542378",
          fontSize: "11px",
          fontWeight: "800",
          marginBottom: "5px",
        }}
      >
        {label}
      </label>

      {children}

      <div
        style={{
          color: "#95899a",
          fontSize: "9px",
          lineHeight: 1.45,
          marginTop: "5px",
        }}
      >
        {help}
      </div>
    </div>
  );
}


function Toggle({
  name,
  label,
  help,
  defaultChecked,
  warning = false,
}: {
  name: string;
  label: string;
  help: string;
  defaultChecked: boolean;
  warning?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",

        padding: "12px",

        border:
          warning
            ? "1px solid #ead9a8"
            : "1px solid #eee6f2",

        background:
          warning
            ? "#fffaf0"
            : "#faf8fc",

        borderRadius: "9px",

        marginBottom: "10px",

        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={
          defaultChecked
        }
        style={{
          marginTop: "2px",
        }}
      />

      <div>
        <div
          style={{
            color:
              warning
                ? "#805c12"
                : "#542378",

            fontSize: "11px",

            fontWeight: "800",
          }}
        >
          {label}
        </div>

        <div
          style={{
            color: "#756b7b",
            fontSize: "9px",
            lineHeight: 1.5,
            marginTop: "3px",
          }}
        >
          {help}
        </div>
      </div>
    </label>
  );
}


// ==========================================================
// STYLES
// ==========================================================

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5d8ef",
  borderRadius: "14px",
  padding: "20px",
  boxShadow:
    "0 2px 8px rgba(84, 35, 120, 0.06)",
};


const inputStyle = {
  width: "100%",
  boxSizing:
    "border-box" as const,
  border:
    "1px solid #d9c9e4",
  borderRadius: "8px",
  padding: "10px 11px",
  fontSize: "11px",
  background: "#ffffff",
  color: "#21152a",
};


const primaryButtonStyle = {
  display: "inline-block",
  background: "#542378",
  color: "#ffffff",
  borderRadius: "8px",
  padding: "11px 15px",
  textDecoration: "none",
  fontWeight: "800",
  fontSize: "11px",
};


const secondaryButtonStyle = {
  display: "inline-block",
  background: "#ffffff",
  color: "#542378",
  border:
    "1px solid #d8c8e2",
  borderRadius: "8px",
  padding: "9px 12px",
  textDecoration: "none",
  fontWeight: "800",
  fontSize: "10px",
};


const noticeStyle = {
  background: "#edf8ef",
  color: "#28743b",
  border:
    "1px solid #cfe8d4",
  borderRadius: "9px",
  padding: "11px",
  fontSize: "10px",
  fontWeight: "700",
  lineHeight: 1.55,
};