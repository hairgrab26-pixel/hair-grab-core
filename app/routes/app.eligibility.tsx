import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const now = new Date();

  const [
    readyCandidates,
    awaitingClearance,
    futureHold,
    missingHoldDate,
    eligibleEntries,
  ] = await Promise.all([
    db.sellerLedgerEntry.count({
      where: {
        status: "PENDING",
        fundsStatus: "CLEARED",
        fundsClearedAt: {
          not: null,
        },
        availableOn: {
          not: null,
          lte: now,
        },
        sellerEarningsCents: {
          gt: 0,
        },
        processingFeeStatus: "FINALIZED",
      },
    }),

    db.sellerLedgerEntry.count({
      where: {
        status: "PENDING",
        fundsStatus: "AWAITING_CLEARANCE",
      },
    }),

    db.sellerLedgerEntry.count({
      where: {
        status: "PENDING",
        fundsStatus: "CLEARED",
        availableOn: {
          gt: now,
        },
      },
    }),

    db.sellerLedgerEntry.count({
      where: {
        status: "PENDING",
        fundsStatus: "CLEARED",
        availableOn: null,
      },
    }),

    db.sellerLedgerEntry.count({
      where: {
        status: "ELIGIBLE",
      },
    }),
  ]);

  return {
    readyCandidates,
    awaitingClearance,
    futureHold,
    missingHoldDate,
    eligibleEntries,
  };
};


export const action = async ({
  request,
}: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "run-eligibility") {
    return {
      success: false,
      message: "Unknown eligibility action.",
      updatedCount: 0,
    };
  }

  const now = new Date();

  const result =
    await db.sellerLedgerEntry.updateMany({
      where: {
        status: "PENDING",

        fundsStatus: "CLEARED",

        fundsClearedAt: {
          not: null,
        },

        availableOn: {
          not: null,
          lte: now,
        },

        sellerEarningsCents: {
          gt: 0,
        },
        processingFeeStatus: "FINALIZED",
      },

      data: {
        status: "ELIGIBLE",
        eligibilityCheckedAt: now,
      },
    });

  return {
    success: true,
    message:
      result.count === 1
        ? "1 seller ledger entry moved to payout ready."
        : `${result.count} seller ledger entries moved to payout ready.`,
    updatedCount: result.count,
  };
};


const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5d8ef",
  borderRadius: "14px",
  padding: "22px",
  boxShadow:
    "0 2px 8px rgba(84, 35, 120, 0.06)",
};


const numberStyle = {
  fontSize: "28px",
  fontWeight: "700",
  color: "#542378",
  marginTop: "8px",
};


export default function EligibilityPage() {
  const data =
    useLoaderData<typeof loader>();

  const actionData =
    useActionData<typeof action>();

  const navigation = useNavigation();

  const isRunning =
    navigation.state === "submitting";

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
      {/* HEADER */}

      <div
        style={{
          marginBottom: "26px",
        }}
      >
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
            margin: 0,
            color: "#542378",
            fontSize: "32px",
          }}
        >
          Payout Eligibility
        </h1>

        <p
          style={{
            color: "#6f6675",
            fontSize: "15px",
            marginTop: "8px",
          }}
        >
          Review pending seller earnings
          and move only qualified entries
          into the payout-ready queue.
        </p>
      </div>


      {/* RULE */}

      <div
        style={{
          background: "#f8f1fc",
          border: "1px solid #e5d8ef",
          borderRadius: "12px",
          padding: "18px",
          marginBottom: "24px",
          lineHeight: "1.6",
          color: "#5c4668",
          fontSize: "13px",
        }}
      >
        <strong>
          HairGrab eligibility rule:
        </strong>{" "}

        An earning can become payout ready
        only when its ledger status is
        PENDING, Shopify funds are CLEARED,
        a funds-cleared timestamp exists,
        the HairGrab hold date has arrived,
        and seller earnings are greater
        than $0.

        <div
          style={{
            marginTop: "8px",
            fontWeight: "700",
          }}
        >
          This process does not send money.
        </div>
      </div>


      {/* COUNTERS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              fontSize: "13px",
              color: "#6f6675",
            }}
          >
            Ready to Release
          </div>

          <div style={numberStyle}>
            {data.readyCandidates}
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#93899a",
              marginTop: "4px",
            }}
          >
            Meets every eligibility rule
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize: "13px",
              color: "#6f6675",
            }}
          >
            Awaiting Shopify Clearance
          </div>

          <div style={numberStyle}>
            {data.awaitingClearance}
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#93899a",
              marginTop: "4px",
            }}
          >
            Cannot be released
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize: "13px",
              color: "#6f6675",
            }}
          >
            Hold Not Reached
          </div>

          <div style={numberStyle}>
            {data.futureHold}
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#93899a",
              marginTop: "4px",
            }}
          >
            Funds cleared but still held
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize: "13px",
              color: "#6f6675",
            }}
          >
            Already Payout Ready
          </div>

          <div style={numberStyle}>
            {data.eligibleEntries}
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#93899a",
              marginTop: "4px",
            }}
          >
            Ledger status ELIGIBLE
          </div>
        </div>
      </div>


      {/* CONTROL */}

      <div style={cardStyle}>
        <h2
          style={{
            marginTop: 0,
            color: "#542378",
            fontSize: "20px",
          }}
        >
          Run Eligibility Check
        </h2>

        <p
          style={{
            color: "#756b7b",
            fontSize: "13px",
            lineHeight: "1.5",
          }}
        >
          HairGrab Core will evaluate the
          pending ledger and change only
          qualifying entries from PENDING
          to ELIGIBLE.
        </p>


        {actionData?.message && (
          <div
            style={{
              marginTop: "18px",
              marginBottom: "18px",
              padding: "14px",
              borderRadius: "10px",
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
              fontSize: "13px",
              fontWeight: "700",
            }}
          >
            {actionData.message}
          </div>
        )}


        {data.missingHoldDate > 0 && (
          <div
            style={{
              marginTop: "15px",
              marginBottom: "15px",
              padding: "12px",
              borderRadius: "10px",
              background: "#fff9eb",
              border: "1px solid #eadca9",
              color: "#7a5a16",
              fontSize: "12px",
            }}
          >
            {data.missingHoldDate} pending
            cleared transaction(s) do not
            have an eligibility date and
            will not be released.
          </div>
        )}


        <Form method="post">
          <input
            type="hidden"
            name="intent"
            value="run-eligibility"
          />

          <button
            type="submit"
            disabled={
              isRunning ||
              data.readyCandidates === 0
            }
            style={{
              marginTop: "12px",
              background:
                data.readyCandidates > 0
                  ? "#542378"
                  : "#b6aabd",
              color: "#ffffff",
              border: "none",
              borderRadius: "9px",
              padding: "12px 18px",
              fontWeight: "700",
              cursor:
                data.readyCandidates > 0
                  ? "pointer"
                  : "not-allowed",
            }}
          >
            {isRunning
              ? "Checking..."
              : `Release ${data.readyCandidates} Eligible ${
                  data.readyCandidates === 1
                    ? "Entry"
                    : "Entries"
                }`}
          </button>
        </Form>
      </div>


      {/* NAVIGATION */}

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginTop: "20px",
          flexWrap: "wrap",
        }}
      >
        <Link
          to="/app/payouts"
          style={{
            color: "#542378",
            textDecoration: "none",
            fontWeight: "700",
            fontSize: "13px",
          }}
        >
          View Payouts →
        </Link>

        <Link
          to="/app"
          style={{
            color: "#756b7b",
            textDecoration: "none",
            fontWeight: "700",
            fontSize: "13px",
          }}
        >
          Back to HairGrab Core
        </Link>
      </div>
    </div>
  );
}
