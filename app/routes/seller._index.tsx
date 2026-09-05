import { Link } from "react-router";

export default function SellerDashboard() {
  // Temporary display data.
  // Next we will connect these values to the logged-in seller + Shopify.
  const seller = {
    businessName: "Crowned By Sacred",
    storeId: "HG-0002",
    activeProducts: 0,
    ordersToFulfill: 0,
    totalOrders: 0,
    sales: "$0.00",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf8fc",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#21152a",
      }}
    >
      {/* HEADER */}
      <header
        style={{
          background: "#4B1678",
          color: "white",
          padding: "18px 24px",
        }}
      >
        <div
          style={{
            maxWidth: "1180px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "1px",
                opacity: 0.8,
              }}
            >
              HAIRGRAB SELLER
            </div>

            <div
              style={{
                fontSize: "24px",
                fontWeight: 800,
                marginTop: "3px",
              }}
            >
              Seller Dashboard
            </div>
          </div>

          <Link
            to="/seller/add-product"
            style={{
              background: "white",
              color: "#4B1678",
              padding: "11px 18px",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: 800,
              fontSize: "14px",
            }}
          >
            + Add Product
          </Link>
        </div>
      </header>

      <main
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          padding: "30px 20px 60px",
        }}
      >
        {/* WELCOME */}
        <section style={{ marginBottom: "26px" }}>
          <div
            style={{
              color: "#4B1678",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.8px",
              marginBottom: "6px",
            }}
          >
            {seller.storeId}
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "30px",
              color: "#4B1678",
            }}
          >
            Welcome, {seller.businessName}
          </h1>

          <p
            style={{
              margin: "7px 0 0",
              color: "#6f6575",
              fontSize: "15px",
            }}
          >
            Here's what's happening with your HairGrab store.
          </p>
        </section>

        {/* ANNOUNCEMENT */}
        <section
          style={{
            background: "#f2eafa",
            border: "1px solid #e2d1ef",
            borderRadius: "12px",
            padding: "16px 18px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              color: "#4B1678",
              fontWeight: 800,
              fontSize: "14px",
              marginBottom: "4px",
            }}
          >
            HairGrab Announcement
          </div>

          <div style={{ fontSize: "14px", lineHeight: 1.5 }}>
            Welcome to HairGrab! Your seller dashboard is ready.
          </div>
        </section>

        {/* STATS */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "14px",
            marginBottom: "28px",
          }}
        >
          <StatCard
            label="Sales"
            value={seller.sales}
            subtext="Total sales"
          />

          <StatCard
            label="Orders"
            value={seller.totalOrders}
            subtext="Total orders"
          />

          <StatCard
            label="To Fulfill"
            value={seller.ordersToFulfill}
            subtext="Orders needing attention"
          />

          <StatCard
            label="Products"
            value={seller.activeProducts}
            subtext="Active products"
          />
        </section>

        {/* MAIN ACTIONS */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          <DashboardAction
            title="Products"
            description="Add new hair, update pricing, inventory, photos and product details."
            link="/seller/add-product"
            button="+ Add Product"
          />

          <DashboardAction
            title="Orders"
            description="See new orders and quickly find what needs to be shipped or fulfilled."
            link="/seller/orders"
            button="View Orders"
          />

          <DashboardAction
            title="My Store"
            description="Manage the information shoppers see about your HairGrab store."
            link="/seller/store"
            button="Manage Store"
          />
        </section>

        {/* ORDERS */}
        <section
          style={{
            background: "white",
            border: "1px solid #e5dce9",
            borderRadius: "14px",
            overflow: "hidden",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              padding: "18px 20px",
              borderBottom: "1px solid #eee5f1",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "15px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Orders To Fulfill
              </h2>

              <div
                style={{
                  fontSize: "13px",
                  color: "#817686",
                  marginTop: "3px",
                }}
              >
                New orders that need your attention.
              </div>
            </div>

            <Link
              to="/seller/orders"
              style={{
                color: "#4B1678",
                fontWeight: 800,
                textDecoration: "none",
                fontSize: "13px",
              }}
            >
              View All
            </Link>
          </div>

          <div
            style={{
              padding: "38px 20px",
              textAlign: "center",
              color: "#817686",
              fontSize: "14px",
            }}
          >
            No orders waiting to be fulfilled.
          </div>
        </section>

        {/* SELLER TOOLS */}
        <section>
          <h2
            style={{
              color: "#4B1678",
              fontSize: "20px",
              marginBottom: "14px",
            }}
          >
            Seller Tools
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            <ToolCard
              title="Messages"
              description="Chat with HairGrab support and customers."
              status="Coming Soon"
            />

            <ToolCard
              title="Notifications"
              description="Order and marketplace alerts."
              status="Coming Soon"
            />

            <ToolCard
              title="Announcements"
              description="Important HairGrab marketplace updates."
              status="Active"
            />

            <ToolCard
              title="Store Settings"
              description="Update your seller and storefront information."
              status="Coming Soon"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext: string;
}) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5dce9",
        borderRadius: "12px",
        padding: "18px",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          color: "#756b79",
          fontWeight: 700,
          marginBottom: "7px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: "26px",
          color: "#4B1678",
          fontWeight: 800,
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: "5px",
          color: "#938a97",
          fontSize: "12px",
        }}
      >
        {subtext}
      </div>
    </div>
  );
}

function DashboardAction({
  title,
  description,
  link,
  button,
}: {
  title: string;
  description: string;
  link: string;
  button: string;
}) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5dce9",
        borderRadius: "14px",
        padding: "20px",
      }}
    >
      <h2
        style={{
          margin: "0 0 8px",
          color: "#4B1678",
          fontSize: "19px",
        }}
      >
        {title}
      </h2>

      <p
        style={{
          color: "#746b78",
          fontSize: "14px",
          lineHeight: 1.5,
          minHeight: "63px",
          margin: "0 0 16px",
        }}
      >
        {description}
      </p>

      <Link
        to={link}
        style={{
          display: "inline-block",
          background: "#4B1678",
          color: "white",
          padding: "10px 15px",
          borderRadius: "7px",
          textDecoration: "none",
          fontSize: "13px",
          fontWeight: 800,
        }}
      >
        {button}
      </Link>
    </div>
  );
}

function ToolCard({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: string;
}) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5dce9",
        borderRadius: "12px",
        padding: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "10px",
        }}
      >
        <strong
          style={{
            color: "#4B1678",
            fontSize: "15px",
          }}
        >
          {title}
        </strong>

        <span
          style={{
            background: status === "Active" ? "#edf8ef" : "#f3edf7",
            color: status === "Active" ? "#28743b" : "#6d447e",
            padding: "4px 7px",
            borderRadius: "20px",
            fontSize: "10px",
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {status}
        </span>
      </div>

      <div
        style={{
          marginTop: "8px",
          color: "#817686",
          fontSize: "12px",
          lineHeight: 1.4,
        }}
      >
        {description}
      </div>
    </div>
  );
}