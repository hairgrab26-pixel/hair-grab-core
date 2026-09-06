import { Link } from "react-router";


export default function HairGrabSellerAgreementPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf8fc",
        padding: "28px 18px 70px",
        fontFamily: "Arial, sans-serif",
        color: "#2c2330",
      }}
    >
      <div
        style={{
          maxWidth: "820px",
          margin: "0 auto",
        }}
      >
        <Link
          to="/seller/onboarding/agreements"
          style={{
            color: "#4B1678",
            textDecoration: "none",
            fontWeight: "800",
            fontSize: "12px",
          }}
        >
          ← Back to Seller Agreement
        </Link>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5dce9",
            borderRadius: "16px",
            padding: "28px",
            marginTop: "12px",
          }}
        >
          <div
            style={{
              color: "#7b3fa0",
              fontSize: "11px",
              fontWeight: "800",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            HairGrab Marketplace
          </div>

          <h1
            style={{
              color: "#4B1678",
              margin: "6px 0 4px",
              fontSize: "30px",
            }}
          >
            HairGrab Seller Agreement
          </h1>

          <div
            style={{
              color: "#817787",
              fontSize: "12px",
              marginBottom: "24px",
            }}
          >
            Version 1.0 • Effective September 6, 2026
          </div>

          <Intro>
            This HairGrab Seller Agreement governs participation
            by businesses that list and sell products through the
            HairGrab marketplace. HairGrab is operated by Crowned
            Group LLC. By accepting this Agreement, you agree to
            the marketplace requirements below.
          </Intro>

          <Section title="1. Seller Account">
            <P>
              You must provide accurate, current and complete
              information when applying for and maintaining a
              HairGrab seller account.
            </P>

            <P>
              You are responsible for activity performed through
              your seller account and for keeping your account
              information current.
            </P>

            <P>
              HairGrab may approve, decline, suspend or deactivate
              a seller account when necessary to protect shoppers,
              sellers or the marketplace.
            </P>
          </Section>

          <Section title="2. Products and Listings">
            <P>
              Product titles, descriptions, photographs, prices,
              variants, inventory quantities and other listing
              information must accurately represent the item being
              sold.
            </P>

            <P>
              Sellers may not knowingly list counterfeit,
              misleading, stolen, prohibited or unlawful products.
            </P>

            <P>
              HairGrab may remove or temporarily hide a listing
              that violates marketplace requirements, contains
              inaccurate information or creates a material risk to
              shoppers or the marketplace.
            </P>

            <P>
              Sellers are responsible for ensuring that they have
              the legal right to use all photographs, trademarks,
              brand names and other content submitted with their
              listings.
            </P>
          </Section>

          <Section title="3. Inventory and Pricing">
            <P>
              Sellers are responsible for maintaining accurate
              inventory and pricing.
            </P>

            <P>
              A seller should not accept an order for an item that
              the seller cannot reasonably fulfill.
            </P>

            <P>
              If a pricing or inventory error occurs, the seller
              must notify HairGrab promptly and cooperate in
              resolving the affected order.
            </P>
          </Section>

          <Section title="4. Order Fulfillment">
            <P>
              Sellers must process and ship orders within the
              fulfillment timeframe shown on their HairGrab
              listings.
            </P>

            <P>
              Unless HairGrab has approved a different timeframe,
              sellers are expected to ship orders within 48 hours
              of receiving the order.
            </P>

            <P>
              Sellers must provide accurate shipment and tracking
              information when tracking is available.
            </P>

            <P>
              Sellers offering local pickup or local delivery are
              responsible for fulfilling those orders according to
              the method selected by the shopper.
            </P>
          </Section>

          <Section title="5. Returns, Refunds and Final Sale Items">
            <P>
              Sellers must honor the return policy selected for
              their HairGrab storefront and products.
            </P>

            <P>
              Products identified as eligible for 14-day returns
              must be handled consistently with that policy.
            </P>

            <P>
              Products clearly identified as Final Sale are not
              generally returnable unless required by law or the
              product received materially differs from the listing.
            </P>

            <P>
              HairGrab may issue or require a refund when
              reasonably necessary to resolve a shopper dispute,
              fraud concern, fulfillment failure or material
              listing discrepancy.
            </P>
          </Section>

          <Section title="6. Marketplace Fees and Commission">
            <P>
              HairGrab charges a marketplace commission on
              qualifying seller transactions.
            </P>

            <P>
              The commission rate applicable to a seller is the
              rate displayed in that seller's HairGrab account or
              otherwise agreed to by HairGrab and the seller.
            </P>

            <P>
              Promotional, founding-seller or other special rates
              may differ from HairGrab's standard commission rate.
            </P>

            <P>
              HairGrab may update marketplace fees prospectively.
              Sellers will be notified of material fee changes
              before the new rate applies to future transactions.
            </P>
          </Section>

          <Section title="7. Seller Payouts">
            <P>
              Seller payouts are processed through HairGrab's
              approved payment and payout providers, including
              Stripe Connect.
            </P>

            <P>
              Sellers must complete all identity, banking, tax and
              verification requirements required by the payout
              provider before receiving payouts.
            </P>

            <P>
              HairGrab does not store a seller's full bank account
              credentials when those credentials are submitted
              directly through Stripe or another approved payment
              provider.
            </P>

            <P>
              Seller earnings may remain pending until the order
              satisfies HairGrab's payout eligibility requirements,
              including applicable delivery, refund, dispute and
              fraud-review periods.
            </P>

            <P>
              HairGrab may temporarily delay a payout when there
              is a reasonable concern involving fraud, a disputed
              transaction, refund, chargeback, account restriction
              or other marketplace risk.
            </P>
          </Section>

          <Section title="8. Refunds, Disputes and Chargebacks">
            <P>
              Sellers agree to cooperate promptly with HairGrab
              when information is needed to respond to a refund
              request, payment dispute or chargeback.
            </P>

            <P>
              Amounts attributable to refunds, chargebacks,
              reversals or seller-caused losses may be deducted
              from current or future seller earnings when
              permitted by law and applicable payment-provider
              rules.
            </P>
          </Section>

          <Section title="9. Shopper Service">
            <P>
              Sellers must communicate professionally and
              accurately with shoppers and HairGrab.
            </P>

            <P>
              Sellers should respond promptly when HairGrab
              contacts them regarding an order, fulfillment issue,
              return, dispute or marketplace concern.
            </P>
          </Section>

          <Section title="10. Prohibited Conduct">
            <P>
              Sellers may not use HairGrab to engage in fraud,
              deceptive practices, harassment, unlawful
              discrimination, intellectual-property infringement
              or other illegal activity.
            </P>

            <P>
              Sellers may not intentionally manipulate reviews,
              transactions, marketplace metrics or seller
              eligibility requirements.
            </P>

            <P>
              Sellers may not attempt to misuse HairGrab payment,
              payout or promotional systems.
            </P>
          </Section>

          <Section title="11. Taxes and Legal Compliance">
            <P>
              Sellers are responsible for complying with laws and
              regulations applicable to their business and
              products.
            </P>

            <P>
              Sellers remain responsible for their own business
              registrations, licenses, tax obligations and income
              reporting except where HairGrab or a payment provider
              is legally required to collect, report or remit an
              amount on the seller's behalf.
            </P>

            <P>
              Sellers must provide accurate tax information when
              requested by HairGrab, Stripe or another authorized
              provider.
            </P>
          </Section>

          <Section title="12. Intellectual Property">
            <P>
              Sellers retain ownership of seller-created content
              submitted to HairGrab.
            </P>

            <P>
              By submitting listing content, the seller grants
              HairGrab permission to display, format, reproduce and
              promote that content as reasonably necessary to
              operate and market the HairGrab marketplace and the
              seller's listings.
            </P>
          </Section>

          <Section title="13. Marketplace Availability">
            <P>
              HairGrab may update marketplace features, seller
              tools, listing limits, policies and technical
              functionality as the marketplace develops.
            </P>

            <P>
              HairGrab does not guarantee uninterrupted platform
              availability or a minimum number of sales, views,
              orders or earnings.
            </P>
          </Section>

          <Section title="14. Suspension and Termination">
            <P>
              HairGrab may suspend listings, restrict seller
              privileges or suspend an account when reasonably
              necessary to investigate fraud, repeated fulfillment
              problems, prohibited activity, unresolved disputes
              or material violations of this Agreement.
            </P>

            <P>
              HairGrab may terminate a seller's participation for
              serious or repeated violations of marketplace rules.
            </P>

            <P>
              Amounts properly owed to a seller after termination
              remain subject to refunds, disputes, chargebacks and
              other valid adjustments.
            </P>
          </Section>

          <Section title="15. Independent Businesses">
            <P>
              Sellers participate in HairGrab as independent
              businesses. Nothing in this Agreement creates an
              employment, partnership, franchise or agency
              relationship between HairGrab and the seller.
            </P>

            <P>
              Sellers control their own business operations,
              product sourcing, inventory and fulfillment subject
              to the marketplace requirements in this Agreement.
            </P>
          </Section>

          <Section title="16. Limitation of Liability">
            <P>
              To the extent permitted by applicable law, HairGrab
              is not responsible for indirect, incidental,
              consequential or special damages arising from a
              seller's use of the marketplace.
            </P>

            <P>
              Nothing in this Agreement limits rights or
              obligations that cannot legally be limited.
            </P>
          </Section>

          <Section title="17. Changes to This Agreement">
            <P>
              HairGrab may update this Agreement as the marketplace
              evolves or when legal, payment-provider or
              operational requirements change.
            </P>

            <P>
              Sellers will receive notice of material changes when
              required, and continued use of HairGrab after an
              applicable effective date may constitute acceptance
              of the updated terms.
            </P>
          </Section>

          <Section title="18. Contact">
            <P>
              Questions about this Agreement or a seller account
              should be directed to HairGrab through the seller
              support channels provided in the marketplace.
            </P>
          </Section>

          <div
            style={{
              background: "#f6effa",
              border: "1px solid #dfd0e9",
              borderRadius: "11px",
              padding: "16px",
              marginTop: "28px",
              color: "#4B1678",
              fontSize: "12px",
              lineHeight: 1.6,
              fontWeight: "700",
            }}
          >
            By checking the acceptance box during HairGrab seller
            onboarding, the seller confirms that they have reviewed
            and agree to this HairGrab Seller Agreement.
          </div>

          <Link
            to="/seller/onboarding/agreements"
            style={{
              display: "block",
              marginTop: "22px",
              width: "100%",
              boxSizing: "border-box",
              textAlign: "center",
              background: "#4B1678",
              color: "#ffffff",
              borderRadius: "9px",
              padding: "13px 17px",
              textDecoration: "none",
              fontWeight: "800",
            }}
          >
            Return to Seller Agreement
          </Link>
        </div>
      </div>
    </div>
  );
}


function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        borderTop: "1px solid #eee7f2",
        paddingTop: "19px",
        marginTop: "19px",
      }}
    >
      <h2
        style={{
          color: "#4B1678",
          margin: "0 0 10px",
          fontSize: "17px",
        }}
      >
        {title}
      </h2>

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
        color: "#574e5c",
        fontSize: "13px",
        lineHeight: 1.75,
        margin: "8px 0",
      }}
    >
      {children}
    </p>
  );
}


function Intro({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#faf8fc",
        border: "1px solid #e5dce9",
        borderRadius: "11px",
        padding: "16px",
        color: "#574e5c",
        fontSize: "13px",
        lineHeight: 1.7,
      }}
    >
      {children}
    </div>
  );
}