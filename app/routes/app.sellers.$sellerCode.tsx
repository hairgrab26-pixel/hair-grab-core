import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const sellerCode = params.sellerCode;

  if (!sellerCode) {
    throw new Response("Seller code is required", { status: 400 });
  }

  const seller = await db.seller.findUnique({
    where: {
      sellerCode,
    },
  });

  if (!seller) {
    throw new Response("Seller not found", { status: 404 });
  }

  return { seller };
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5d8ef",
  borderRadius: "14px",
  padding: "22px",
  boxShadow: "0 2px 8px rgba(84, 35, 120, 0.06)",
};

const labelStyle = {
  fontSize: "12px",
  color: "#756b7b",
  marginBottom: "4px",
};

const valueStyle = {
  fontSize: "15px",
  fontWeight: "700",
  color: "#2b1b35",
};

export default function SellerDetailPage() {
  const { seller } = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "28px",
        fontFamily: "Arial, sans-serif",
        color: "#21152a",
      }}
    >
      <div style={{ marginBottom: "24px" }}>
        <div
          style={{
            color: "#7b3fa0",
            fontSize: "13px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            marginBottom: "6px",
          }}
        >
          HairGrab Seller
        </div>

        <h1
          style={{
            margin: "0",
            color: "#542378",
            fontSize: "32px",
          }}
        >
          {seller.businessName}
        </h1>

        <p
          style={{
            color: "#6f6675",
            fontSize: "15px",
            marginTop: "8px",
          }}
        >
          Seller profile, marketplace status, commission and payout setup.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={cardStyle}>
          <div style={labelStyle}>Seller ID</div>
          <div style={valueStyle}>{seller.sellerCode}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Status</div>
          <div style={valueStyle}>{seller.status}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Commission Rate</div>
          <div style={valueStyle}>{seller.commissionRate}%</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Payout Status</div>
          <div style={valueStyle}>{seller.payoutStatus}</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "18px",
        }}
      >
        <div style={cardStyle}>
          <h2
            style={{
              marginTop: "0",
              color: "#542378",
              fontSize: "20px",
            }}
          >
            Seller Information
          </h2>

          <div style={{ display: "grid", gap: "18px", marginTop: "18px" }}>
            <div>
              <div style={labelStyle}>Business Name</div>
              <div style={valueStyle}>{seller.businessName}</div>
            </div>

            <div>
              <div style={labelStyle}>Shopify Vendor</div>
              <div style={valueStyle}>{seller.shopifyVendor}</div>
            </div>

            <div>
              <div style={labelStyle}>Nexus Seller ID</div>
              <div style={valueStyle}>
                {seller.nexusSellerId || "Not connected"}
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h2
            style={{
              marginTop: "0",
              color: "#542378",
              fontSize: "20px",
            }}
          >
            Payout Setup
          </h2>

          <div style={{ display: "grid", gap: "18px", marginTop: "18px" }}>
            <div>
              <div style={labelStyle}>Payout Connection</div>
              <div style={valueStyle}>{seller.payoutStatus}</div>
            </div>

            <div>
              <div style={labelStyle}>Stripe Connected Account</div>
              <div style={valueStyle}>
                {seller.stripeAccountId || "Not connected"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: "18px" }}>
        <h2
          style={{
            marginTop: "0",
            color: "#542378",
            fontSize: "20px",
          }}
        >
          Seller Financial Summary
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "18px",
            marginTop: "18px",
          }}
        >
          <div>
            <div style={labelStyle}>Gross Sales</div>
            <div style={valueStyle}>$0.00</div>
          </div>

          <div>
            <div style={labelStyle}>HairGrab Commission</div>
            <div style={valueStyle}>$0.00</div>
          </div>

          <div>
            <div style={labelStyle}>Seller Earnings</div>
            <div style={valueStyle}>$0.00</div>
          </div>

          <div>
            <div style={labelStyle}>Payout Ready</div>
            <div style={valueStyle}>$0.00</div>
          </div>
        </div>
      </div>
    </div>
  );
}