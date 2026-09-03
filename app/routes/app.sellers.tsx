import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const sellers = await db.seller.findMany({
    orderBy: {
      businessName: "asc",
    },
  });

  return { sellers };
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5d8ef",
  borderRadius: "14px",
  padding: "22px",
  boxShadow: "0 2px 8px rgba(84, 35, 120, 0.06)",
};

const sellerLinkStyle = {
  color: "#542378",
  fontWeight: "700",
  textDecoration: "none",
};

export default function SellersPage() {
  const { sellers } = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        maxWidth: "1200px",
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
          HairGrab Marketplace
        </div>

        <h1
          style={{
            margin: "0",
            color: "#542378",
            fontSize: "32px",
          }}
        >
          Sellers
        </h1>

        <p
          style={{
            color: "#6f6675",
            fontSize: "15px",
            marginTop: "8px",
          }}
        >
          Seller registry, marketplace status, commission and payout setup.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={cardStyle}>
          <div style={{ fontSize: "13px", color: "#6f6675" }}>
            Total Sellers
          </div>

          <div
            style={{
              fontSize: "30px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "8px",
            }}
          >
            {sellers.length}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: "13px", color: "#6f6675" }}>
            Active Sellers
          </div>

          <div
            style={{
              fontSize: "30px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "8px",
            }}
          >
            {sellers.filter((seller) => seller.status === "ACTIVE").length}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: "13px", color: "#6f6675" }}>
            Payout Connected
          </div>

          <div
            style={{
              fontSize: "30px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "8px",
            }}
          >
            {
              sellers.filter(
                (seller) => seller.payoutStatus === "CONNECTED",
              ).length
            }
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
          Seller Registry
        </h2>

        {sellers.length === 0 ? (
          <div
            style={{
              padding: "35px",
              textAlign: "center",
              color: "#756b7b",
            }}
          >
            No HairGrab sellers have been registered yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "18px" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8f1fc",
                    color: "#542378",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "12px" }}>Seller ID</th>
                  <th style={{ padding: "12px" }}>Business</th>
                  <th style={{ padding: "12px" }}>Shopify Vendor</th>
                  <th style={{ padding: "12px" }}>Status</th>
                  <th style={{ padding: "12px" }}>Commission</th>
                  <th style={{ padding: "12px" }}>Payout Status</th>
                </tr>
              </thead>

              <tbody>
                {sellers.map((seller) => (
                  <tr
                    key={seller.id}
                    style={{
                      borderBottom: "1px solid #eee6f2",
                    }}
                  >
                    <td style={{ padding: "14px 12px" }}>
                      <Link
                        to={`/app/seller/${seller.sellerCode}`}
                        style={sellerLinkStyle}
                      >
                        {seller.sellerCode}
                      </Link>
                    </td>

                    <td style={{ padding: "14px 12px" }}>
                      <Link
                        to={`/app/seller/${seller.sellerCode}`}
                        style={sellerLinkStyle}
                      >
                        {seller.businessName}
                      </Link>
                    </td>

                    <td style={{ padding: "14px 12px" }}>
                      {seller.shopifyVendor}
                    </td>

                    <td style={{ padding: "14px 12px" }}>
                      {seller.status}
                    </td>

                    <td style={{ padding: "14px 12px" }}>
                      {seller.commissionRate}%
                    </td>

                    <td style={{ padding: "14px 12px" }}>
                      {seller.payoutStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}