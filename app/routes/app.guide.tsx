import { Link } from "react-router";


export default function HairGrabAdminGuidePage() {
  return (
    <div
      style={{
        maxWidth: "1050px",
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
          justifyContent: "space-between",
          alignItems: "flex-start",
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
              textTransform: "uppercase",
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
            Admin Guide
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
            A quick operating manual for managing HairGrab sellers,
            products, orders, commissions and payouts.
          </p>
        </div>

        <Link
          to="/app"
          style={secondaryButtonStyle}
        >
          ← HairGrab Core
        </Link>
      </div>


      {/* START HERE */}

      <GuideSection
        title="Start Here"
        intro="HairGrab Core is the marketplace operating system behind HairGrab."
      >
        <P>
          Shopify handles the customer storefront, checkout,
          products and orders.
        </P>

        <P>
          Stripe Connect handles seller identity verification,
          banking information and payout accounts.
        </P>

        <P>
          HairGrab Core controls seller applications, marketplace
          status, commission rules, seller onboarding, product
          ownership, payout calculations and marketplace oversight.
        </P>

        <Callout>
          The goal is to keep HairGrab Core simple. Administrators
          should not need to manage the same information in several
          different systems.
        </Callout>
      </GuideSection>


      {/* DAILY */}

      <GuideSection
        title="What Should I Check?"
        intro="These are the main things an administrator should review."
      >
        <Step
          number="1"
          title="Applications"
          text="Review new seller applications and approve or decline them."
        />

        <Step
          number="2"
          title="Sellers"
          text="Check sellers with incomplete onboarding, payout issues, suspensions or other account problems."
        />

        <Step
          number="3"
          title="Products"
          text="Review product status, drafts, pending approvals and Core/Shopify status mismatches."
        />

        <Step
          number="4"
          title="Orders"
          text="Use HairGrab order oversight when an order or seller fulfillment issue needs attention."
        />

        <Step
          number="5"
          title="Payouts"
          text="Review eligible seller earnings and payout batches before money is sent."
        />
      </GuideSection>


      {/* APPLICATIONS */}

      <GuideSection
        title="Seller Applications"
        intro="Applications are the front door to HairGrab."
      >
        <P>
          A seller applies through HairGrab. Administrators review
          the application before the seller receives marketplace
          access.
        </P>

        <Status
          name="Pending"
          text="Waiting for HairGrab review."
        />

        <Status
          name="Approved"
          text="Seller was accepted and a permanent HairGrab Seller ID was created."
        />

        <Status
          name="Declined"
          text="Seller was not accepted into the marketplace."
        />

        <Callout>
          HairGrab Seller IDs such as HG-0002 are permanent and
          should never be reused.
        </Callout>
      </GuideSection>


      {/* SELLERS */}

      <GuideSection
        title="Seller Registry"
        intro="The Sellers page is the main seller-management center."
      >
        <P>
          Use search and filters to locate sellers by Seller ID,
          business name, email, Shopify vendor, marketplace status,
          payout status or onboarding status.
        </P>

        <Status
          name="Active"
          text="Seller is currently allowed to participate in HairGrab."
        />

        <Status
          name="Suspended"
          text="Seller is temporarily restricted while an issue is reviewed or corrected."
        />

        <Status
          name="Inactive"
          text="Seller is disabled but not permanently closed."
        />

        <Status
          name="Closed"
          text="Seller is no longer participating in HairGrab."
        />

        <P>
          Use the Manage button to open the full seller record.
        </P>
      </GuideSection>


      {/* MANAGE */}

      <GuideSection
        title="Manage Seller"
        intro="The Manage Seller page contains the important marketplace-level controls for one seller."
      >
        <P>
          Administrators can change marketplace status, commission
          rate, active product limit and payout tier.
        </P>

        <P>
          The page also shows business information, onboarding
          completion, Stripe payout status, fulfillment options,
          product counts, seller portal access and ledger activity.
        </P>

        <Callout>
          Do not manually mark a seller as Stripe-connected.
          Stripe is the authority for payout account verification.
        </Callout>
      </GuideSection>


      {/* ONBOARDING */}

      <GuideSection
        title="Seller Onboarding"
        intro="Seller onboarding is intentionally short."
      >
        <Step
          number="1"
          title="Business Details"
          text="Confirm legal and business information HairGrab still needs."
        />

        <Step
          number="2"
          title="Storefront"
          text="Seller adds their logo, banner and shopper-facing description."
        />

        <Step
          number="3"
          title="Shipping & Fulfillment"
          text="Seller confirms nationwide shipping, local pickup, local delivery and fulfillment information."
        />

        <Step
          number="4"
          title="Returns"
          text="Seller selects the return policy HairGrab shoppers will see."
        />

        <Step
          number="5"
          title="Payouts"
          text="Seller connects and verifies their Stripe payout account."
        />

        <Step
          number="6"
          title="Seller Agreement"
          text="Seller reads and accepts the HairGrab Seller Agreement."
        />

        <Callout>
          Products are NOT required to complete seller registration.
          Sellers can add products after their account setup is complete.
        </Callout>
      </GuideSection>


      {/* PRODUCTS */}

      <GuideSection
        title="Product Management"
        intro="HairGrab Core and Shopify both track product status."
      >
        <Status
          name="Draft"
          text="Seller is still working on the listing. The product must not be visible to shoppers."
        />

        <Status
          name="Pending Approval"
          text="Waiting for HairGrab review. Shopify remains Draft."
        />

        <Status
          name="Active"
          text="Approved and eligible to appear publicly on HairGrab."
        />

        <Status
          name="Archived"
          text="Listing was intentionally removed from sale."
        />

        <Status
          name="Rejected"
          text="HairGrab did not approve the listing. It remains non-public."
        />

        <Callout>
          Public product rule: HairGrab Core must say ACTIVE and
          Shopify must also say ACTIVE. If either system says Draft
          or another non-public status, the product should not appear
          to shoppers.
        </Callout>
      </GuideSection>


      {/* COMMISSION */}

      <GuideSection
        title="Commission"
        intro="Commission is stored on each seller record."
      >
        <P>
          HairGrab's standard marketplace commission is currently
          7% unless a seller has a special rate.
        </P>

        <P>
          Founding sellers or promotional sellers may have a
          different rate. Their individual seller record should show
          the actual commission percentage that applies.
        </P>

        <P>
          Each transaction stores a snapshot of the commission rate
          used at the time of the transaction so historical
          accounting is not changed by a future rate update.
        </P>
      </GuideSection>


      {/* PAYOUTS */}

      <GuideSection
        title="Stripe & Seller Payouts"
        intro="Stripe Connect handles seller payout accounts."
      >
        <Status
          name="Not Connected"
          text="Seller has not completed Stripe payout onboarding."
        />

        <Status
          name="Pending"
          text="Stripe setup or verification is still incomplete."
        />

        <Status
          name="Connected"
          text="Seller is currently eligible to receive payouts, subject to HairGrab payout rules."
        />

        <Status
          name="Restricted"
          text="Stripe or HairGrab has identified an issue affecting payouts."
        />

        <P>
          HairGrab does not need to collect or store sellers'
          banking credentials. Sellers enter sensitive payout
          information directly through Stripe.
        </P>
      </GuideSection>


      {/* PAYOUT TIERS */}

      <GuideSection
        title="Payout Tiers"
        intro="Payout tiers control payout timing, not commission."
      >
        <Status
          name="Standard"
          text="Normal HairGrab payout timing."
        />

        <Status
          name="Fast"
          text="Faster payout timing for sellers that meet HairGrab qualification requirements."
        />

        <Status
          name="Trusted"
          text="Reserved for highly established sellers when HairGrab intentionally grants that status."
        />

        <Callout>
          Do not upgrade payout tiers simply because a seller asks.
          Use HairGrab's documented qualification rules.
        </Callout>
      </GuideSection>


      {/* ORDERS */}

      <GuideSection
        title="Orders & Ledger"
        intro="HairGrab Core records the marketplace financial side of seller orders."
      >
        <P>
          The seller ledger records sales, refunds, adjustments,
          payout eligibility and payouts.
        </P>

        <P>
          Gross sale, HairGrab commission and seller earnings are
          stored separately so HairGrab always knows what belongs to
          the marketplace and what belongs to the seller.
        </P>

        <P>
          Use the full Ledger page when transaction-level financial
          investigation is needed.
        </P>
      </GuideSection>


      {/* TROUBLESHOOTING */}

      <GuideSection
        title="Quick Troubleshooting"
        intro="Use these checks before changing data manually."
      >
        <Trouble
          problem="Seller cannot receive payouts"
          checks="Check Stripe payout status, onboarding payout completion and whether the account is restricted."
        />

        <Trouble
          problem="Seller says onboarding is stuck"
          checks="Open Manage Seller and check which onboarding step remains incomplete."
        />

        <Trouble
          problem="Draft product appears public"
          checks="Check both HairGrab Core and Shopify status. Public products require ACTIVE in both systems."
        />

        <Trouble
          problem="Product is missing from storefront"
          checks="Confirm seller is ACTIVE, HairGrab Core product is ACTIVE and Shopify product is ACTIVE."
        />

        <Trouble
          problem="Seller commission looks wrong"
          checks="Check the seller's current commission and the commission snapshot stored on the actual ledger entry."
        />

        <Trouble
          problem="Seller needs to be temporarily stopped"
          checks="Use SUSPENDED instead of deleting the seller."
        />
      </GuideSection>


      {/* RULE */}

      <div
        style={{
          ...cardStyle,
          background: "#f5eef9",
          marginBottom: "25px",
        }}
      >
        <div
          style={{
            color: "#542378",
            fontWeight: "800",
            fontSize: "16px",
          }}
        >
          HairGrab Core rule of thumb
        </div>

        <div
          style={{
            marginTop: "8px",
            color: "#4f4554",
            fontSize: "12px",
            lineHeight: 1.7,
          }}
        >
          If Shopify already handles it well, let Shopify handle it.
          If Stripe needs sensitive financial information, let Stripe
          handle it. HairGrab Core should focus on HairGrab marketplace
          rules, seller management, commissions, payouts and oversight.
        </div>
      </div>


      <Link
        to="/app"
        style={secondaryButtonStyle}
      >
        ← Back to HairGrab Core
      </Link>
    </div>
  );
}


function GuideSection({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
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
          color: "#542378",
          margin: 0,
          fontSize: "20px",
        }}
      >
        {title}
      </h2>

      <div
        style={{
          color: "#817787",
          fontSize: "11px",
          marginTop: "5px",
          marginBottom: "14px",
          lineHeight: 1.5,
        }}
      >
        {intro}
      </div>

      {children}
    </section>
  );
}


function P({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p
      style={{
        color: "#514755",
        fontSize: "12px",
        lineHeight: 1.7,
        margin: "9px 0",
      }}
    >
      {children}
    </p>
  );
}


function Step({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "30px 1fr",
        gap: "10px",
        padding: "9px 0",
        borderBottom: "1px solid #eee7f2",
      }}
    >
      <div
        style={{
          width: "25px",
          height: "25px",
          borderRadius: "50%",
          background: "#f0e6f7",
          color: "#542378",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "10px",
          fontWeight: "800",
        }}
      >
        {number}
      </div>

      <div>
        <div
          style={{
            color: "#542378",
            fontSize: "12px",
            fontWeight: "800",
          }}
        >
          {title}
        </div>

        <div
          style={{
            color: "#6f6675",
            fontSize: "11px",
            lineHeight: 1.55,
            marginTop: "3px",
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}


function Status({
  name,
  text,
}: {
  name: string;
  text: string;
}) {
  return (
    <div
      style={{
        padding: "8px 0",
        borderBottom: "1px solid #eee7f2",
      }}
    >
      <span
        style={{
          color: "#542378",
          fontWeight: "800",
          fontSize: "11px",
        }}
      >
        {name}
      </span>

      <span
        style={{
          color: "#6f6675",
          fontSize: "11px",
        }}
      >
        {" — "}
        {text}
      </span>
    </div>
  );
}


function Trouble({
  problem,
  checks,
}: {
  problem: string;
  checks: string;
}) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: "1px solid #eee7f2",
      }}
    >
      <div
        style={{
          color: "#542378",
          fontSize: "11px",
          fontWeight: "800",
        }}
      >
        {problem}
      </div>

      <div
        style={{
          color: "#6f6675",
          fontSize: "11px",
          lineHeight: 1.55,
          marginTop: "3px",
        }}
      >
        {checks}
      </div>
    </div>
  );
}


function Callout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#faf7fc",
        border: "1px solid #e5d8ef",
        borderRadius: "9px",
        padding: "12px",
        color: "#542378",
        fontSize: "11px",
        fontWeight: "700",
        lineHeight: 1.6,
        marginTop: "13px",
      }}
    >
      {children}
    </div>
  );
}


const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5d8ef",
  borderRadius: "14px",
  padding: "20px",
  boxShadow:
    "0 2px 8px rgba(84, 35, 120, 0.06)",
};


const secondaryButtonStyle = {
  display: "inline-block",
  background: "#ffffff",
  color: "#542378",
  border: "1px solid #d8c8e2",
  borderRadius: "8px",
  padding: "9px 12px",
  textDecoration: "none",
  fontWeight: "800",
  fontSize: "10px",
};