import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";

import { requireSellerSession } from "../seller-session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { seller } = await requireSellerSession(request);

  return {
    seller: {
      businessName: seller.businessName,
      sellerCode: seller.sellerCode,
    },
  };
};

export default function SellerHelp() {
  const { seller } = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf8fc",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#21152a",
      }}
    >
      <header
        style={{
          background: "#4B1678",
          color: "white",
          padding: "16px 20px",
        }}
      >
        <div
          style={{
            maxWidth: "980px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "14px",
            flexWrap: "wrap",
          }}
        >
          <Link
            to="/seller"
            aria-label="Back to HairGrab Seller Dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "11px",
              color: "white",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                background: "white",
                borderRadius: "9px",
                padding: "4px 7px",
              }}
            >
              <img
                src="/hairgrab-logo.png"
                alt="HairGrab"
                style={{
                  width: "140px",
                  maxWidth: "42vw",
                  height: "40px",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </span>
            <span>
              <span
                style={{
                  display: "block",
                  fontSize: "9px",
                  fontWeight: 800,
                  letterSpacing: ".9px",
                  opacity: .82,
                }}
              >
                SELLER HELP
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: "18px",
                  fontWeight: 900,
                  marginTop: "2px",
                }}
              >
                Dashboard Guide
              </span>
            </span>
          </Link>

          <Link
            to="/seller"
            style={{
              color: "#4B1678",
              background: "white",
              borderRadius: "8px",
              padding: "9px 13px",
              textDecoration: "none",
              fontSize: "11px",
              fontWeight: 900,
            }}
          >
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main
        style={{
          maxWidth: "980px",
          margin: "0 auto",
          padding: "26px 18px 50px",
        }}
      >
        <section
          style={{
            background: "white",
            border: "1px solid #e5dce9",
            borderRadius: "15px",
            padding: "22px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              color: "#4B1678",
              fontSize: "10px",
              fontWeight: 900,
              letterSpacing: ".8px",
            }}
          >
            {seller.sellerCode} · {seller.businessName}
          </div>
          <h1
            style={{
              color: "#4B1678",
              fontSize: "26px",
              lineHeight: 1.15,
              margin: "7px 0 7px",
            }}
          >
            How to Use Your HairGrab Seller Dashboard
          </h1>
          <p
            style={{
              color: "#6f6575",
              fontSize: "13px",
              lineHeight: 1.6,
              margin: 0,
              maxWidth: "760px",
            }}
          >
            Your dashboard is the home base for running your HairGrab store. Use it to manage products, fulfill orders, review earnings, update store settings and keep up with HairGrab messages and alerts.
          </p>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "14px",
          }}
        >
          <GuideCard
            number="1"
            title="Products"
            text="Open Products to review active listings, edit products, manage inventory and add new items. Use Add Product for a single listing. Use the catalog import tools when bringing in an existing catalog."
            link="/seller/products"
            linkText="Open Products"
          />

          <GuideCard
            number="2"
            title="Orders & Shipping"
            text="Open Orders & Shipping when an order comes in. Review only the items assigned to your store, prepare the order, add the required shipment or fulfillment information, and keep the order moving until delivery."
            link="/seller/orders"
            linkText="Open Orders"
          />

          <GuideCard
            number="3"
            title="Financials"
            text="Gross Sales is the value of your HairGrab sales. HairGrab Fee is the marketplace commission. Your Earnings is your seller share after HairGrab commission. Payout Ready is the amount that has reached payout eligibility."
          />

          <GuideCard
            number="4"
            title="Store Settings"
            text="Use Store Settings to keep your storefront and selling information current, including business details, shipping, fulfillment and other seller preferences."
            link="/seller/settings"
            linkText="Open Store Settings"
          />

          <GuideCard
            number="5"
            title="Shopify Catalog"
            text="If you sell on Shopify, use Shopify Catalog to connect your store and review active Shopify products available for HairGrab import. HairGrab keeps seller-source catalog data separate from marketplace product ownership."
            link="/seller/shopify"
            linkText="Open Shopify Catalog"
          />

          <GuideCard
            number="6"
            title="Help, Messages & Notifications"
            text="Use Help & Updates at the top of the dashboard. Messages is your private communication with HairGrab support. Notifications contains order, shipping, payout and marketplace alerts. Unread counts appear in the Help & Updates menu."
          />
        </div>

        <section
          style={{
            marginTop: "16px",
            background: "#f2eafa",
            border: "1px solid #e2d1ef",
            borderRadius: "14px",
            padding: "18px 20px",
          }}
        >
          <h2
            style={{
              color: "#4B1678",
              fontSize: "16px",
              margin: "0 0 8px",
            }}
          >
            New-order alerts
          </h2>
          <p
            style={{
              color: "#4b3f50",
              fontSize: "12px",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            The Order Ding control at the top of your dashboard turns the HairGrab new-order sound on or off for the device you are using. If your browser allows notifications, HairGrab can also show a browser alert when a new order is detected.
          </p>
        </section>

        <section
          style={{
            marginTop: "16px",
            background: "white",
            border: "1px solid #e5dce9",
            borderRadius: "14px",
            padding: "18px 20px",
          }}
        >
          <h2
            style={{
              color: "#4B1678",
              fontSize: "16px",
              margin: "0 0 9px",
            }}
          >
            Quick seller routine
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "10px",
            }}
          >
            <QuickStep text="Check new orders and shipping needs." />
            <QuickStep text="Review notifications and HairGrab messages." />
            <QuickStep text="Keep product inventory and listings current." />
            <QuickStep text="Review earnings and payout-ready balance." />
          </div>
        </section>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginTop: "18px",
          }}
        >
          <Link
            to="/seller/messages"
            style={primaryButton}
          >
            Message HairGrab Support
          </Link>
          <Link
            to="/seller/notifications"
            style={secondaryButton}
          >
            View Notifications
          </Link>
        </div>
      </main>
    </div>
  );
}

function GuideCard({
  number,
  title,
  text,
  link,
  linkText,
}: {
  number: string;
  title: string;
  text: string;
  link?: string;
  linkText?: string;
}) {
  return (
    <section
      style={{
        background: "white",
        border: "1px solid #e5dce9",
        borderRadius: "14px",
        padding: "18px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "9px",
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            width: "27px",
            height: "27px",
            borderRadius: "50%",
            background: "#4B1678",
            color: "white",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 900,
          }}
        >
          {number}
        </span>
        <h2
          style={{
            color: "#4B1678",
            fontSize: "16px",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      <p
        style={{
          color: "#665b6c",
          fontSize: "12px",
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {text}
      </p>
      {link && linkText && (
        <Link
          to={link}
          style={{
            display: "inline-block",
            color: "#4B1678",
            textDecoration: "none",
            fontSize: "11px",
            fontWeight: 900,
            marginTop: "10px",
          }}
        >
          {linkText} →
        </Link>
      )}
    </section>
  );
}

function QuickStep({ text }: { text: string }) {
  return (
    <div
      style={{
        border: "1px solid #eee5f1",
        borderRadius: "10px",
        padding: "11px 12px",
        color: "#5f5365",
        fontSize: "11px",
        lineHeight: 1.5,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: "#D4AF37",
          fontWeight: 900,
          marginRight: "6px",
        }}
      >
        ✓
      </span>
      {text}
    </div>
  );
}

const primaryButton = {
  background: "#4B1678",
  color: "white",
  textDecoration: "none",
  borderRadius: "9px",
  padding: "10px 14px",
  fontSize: "11px",
  fontWeight: 900,
};

const secondaryButton = {
  background: "white",
  color: "#4B1678",
  textDecoration: "none",
  border: "1px solid #d9c7e3",
  borderRadius: "9px",
  padding: "10px 14px",
  fontSize: "11px",
  fontWeight: 900,
};
