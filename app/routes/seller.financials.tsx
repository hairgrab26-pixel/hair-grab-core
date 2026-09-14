import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";

import db from "../db.server";
import { requireSellerSession } from "../seller-session.server";

const ENTRY_TYPES = ["ALL", "SALE", "REFUND", "ADJUSTMENT", "PAYOUT"] as const;

type EntryTypeFilter = (typeof ENTRY_TYPES)[number];

function validType(value: string | null): EntryTypeFilter {
  return ENTRY_TYPES.includes((value || "ALL") as EntryTypeFilter)
    ? ((value || "ALL") as EntryTypeFilter)
    : "ALL";
}

function parseStart(value: string | null) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseEnd(value: string | null) {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cents(value: number) {
  return (Number(value || 0) / 100).toFixed(2);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0) / 100);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { seller } = await requireSellerSession(request);
  const url = new URL(request.url);
  const start = url.searchParams.get("start") || "";
  const end = url.searchParams.get("end") || "";
  const type = validType(url.searchParams.get("type"));
  const exportCsv = url.searchParams.get("export") === "csv";

  const startDate = parseStart(start);
  const endDate = parseEnd(end);

  const entries = await db.sellerLedgerEntry.findMany({
    where: {
      sellerId: seller.id,
      ...(type !== "ALL" ? { entryType: type } : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      entryType: true,
      status: true,
      shopifyOrderName: true,
      shopifyOrderId: true,
      description: true,
      grossAmountCents: true,
      commissionAmountCents: true,
      processingFeeCents: true,
      sellerEarningsCents: true,
      refundAmountCents: true,
      payoutAmountCents: true,
      currency: true,
    },
  });

  if (exportCsv) {
    const header = [
      "Date",
      "Transaction Type",
      "Status",
      "Order",
      "Description",
      "Gross Sales",
      "HairGrab Fee",
      "Processing Fee",
      "Seller Earnings",
      "Refund",
      "Payout",
      "Currency",
    ];

    const rows = entries.map((entry) => [
      entry.createdAt.toISOString(),
      entry.entryType,
      entry.status,
      entry.shopifyOrderName || entry.shopifyOrderId,
      entry.description || "",
      cents(entry.grossAmountCents),
      cents(entry.commissionAmountCents),
      cents(entry.processingFeeCents),
      cents(entry.sellerEarningsCents),
      cents(entry.refundAmountCents),
      cents(entry.payoutAmountCents),
      entry.currency,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");

    const dateStamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="HairGrab-Financials-${seller.sellerCode}-${dateStamp}.csv"`,
      },
    });
  }

  const totals = entries.reduce(
    (sum, entry) => {
      sum.gross += entry.grossAmountCents;
      sum.fees += entry.commissionAmountCents;
      sum.processingFees += entry.processingFeeCents;
      sum.earnings += entry.sellerEarningsCents;
      sum.refunds += entry.refundAmountCents;
      sum.payouts += entry.payoutAmountCents;
      return sum;
    },
    { gross: 0, fees: 0, processingFees: 0, earnings: 0, refunds: 0, payouts: 0 },
  );

  return {
    seller: { businessName: seller.businessName, sellerCode: seller.sellerCode },
    filters: { start, end, type },
    totals,
    entries: entries.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
};

export default function SellerFinancialsPage() {
  const { seller, filters, totals, entries } = useLoaderData<typeof loader>();
  const exportParams = new URLSearchParams();
  if (filters.start) exportParams.set("start", filters.start);
  if (filters.end) exportParams.set("end", filters.end);
  if (filters.type) exportParams.set("type", filters.type);
  exportParams.set("export", "csv");

  return (
    <div style={{ minHeight: "100vh", background: "#faf8fc", fontFamily: "Arial, sans-serif", color: "#21152a" }}>
      <header style={{ background: "#4B1678", color: "white", padding: "18px 22px" }}>
        <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
          <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "1px", opacity: 0.82 }}>HAIRGRAB SELLER</div>
          <div style={{ fontSize: "24px", fontWeight: 800 }}>Financial Reports</div>
        </div>
      </header>

      <main style={{ maxWidth: "1180px", margin: "0 auto", padding: "26px 20px 60px" }}>
        <Link to="/seller" style={{ color: "#4B1678", fontWeight: 800, textDecoration: "none", fontSize: "12px" }}>← Back to Dashboard</Link>
        <h1 style={{ color: "#4B1678", margin: "12px 0 4px" }}>Financial Reports</h1>
        <div style={{ color: "#756b79", fontSize: "13px", marginBottom: "20px" }}>{seller.businessName} · {seller.sellerCode}</div>

        <section style={{ background: "white", border: "1px solid #e5dce9", borderRadius: "14px", padding: "18px", marginBottom: "18px" }}>
          <Form method="get" style={{ display: "flex", gap: "12px", alignItems: "end", flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: "5px", fontSize: "12px", fontWeight: 700 }}>
              Start date
              <input type="date" name="start" defaultValue={filters.start} style={{ padding: "9px", border: "1px solid #d8cfdd", borderRadius: "7px" }} />
            </label>
            <label style={{ display: "grid", gap: "5px", fontSize: "12px", fontWeight: 700 }}>
              End date
              <input type="date" name="end" defaultValue={filters.end} style={{ padding: "9px", border: "1px solid #d8cfdd", borderRadius: "7px" }} />
            </label>
            <label style={{ display: "grid", gap: "5px", fontSize: "12px", fontWeight: 700 }}>
              Transaction type
              <select name="type" defaultValue={filters.type} style={{ padding: "9px", border: "1px solid #d8cfdd", borderRadius: "7px" }}>
                <option value="ALL">All transactions</option>
                <option value="SALE">Sales</option>
                <option value="REFUND">Refunds</option>
                <option value="ADJUSTMENT">Adjustments</option>
                <option value="PAYOUT">Payouts</option>
              </select>
            </label>
            <button type="submit" style={{ background: "#4B1678", color: "white", border: 0, borderRadius: "8px", padding: "10px 15px", fontWeight: 800, cursor: "pointer" }}>Apply Filters</button>
            <Link to="/seller/financials" style={{ color: "#4B1678", fontWeight: 800, fontSize: "12px", padding: "10px 4px", textDecoration: "none" }}>Clear</Link>
            <a href={`/seller/financials?${exportParams.toString()}`} style={{ marginLeft: "auto", background: "#fff", color: "#4B1678", border: "1px solid #4B1678", borderRadius: "8px", padding: "9px 14px", fontWeight: 800, textDecoration: "none", fontSize: "12px" }}>Export CSV</a>
          </Form>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px", marginBottom: "18px" }}>
          <Summary label="Gross Sales" value={money(totals.gross)} />
          <Summary label="HairGrab Fees" value={money(totals.fees)} />
          <Summary label="Processing Fees" value={money(totals.processingFees)} />
          <Summary label="Seller Earnings" value={money(totals.earnings)} />
          <Summary label="Refunds" value={money(totals.refunds)} />
          <Summary label="Payouts" value={money(totals.payouts)} />
        </section>

        <section style={{ background: "white", border: "1px solid #e5dce9", borderRadius: "14px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px", fontSize: "12px" }}>
            <thead><tr style={{ background: "#f4eef8", color: "#4B1678" }}>
              {['Date','Type','Status','Order','Gross','HairGrab Fee','Processing Fee','Earnings','Refund','Payout'].map((h) => <th key={h} style={{ textAlign: "left", padding: "11px", borderBottom: "1px solid #e5dce9" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: "24px", textAlign: "center", color: "#756b79" }}>No transactions match these filters.</td></tr>
              ) : entries.map((entry) => (
                <tr key={entry.id}>
                  <td style={cell}>{new Date(entry.createdAt).toLocaleDateString()}</td>
                  <td style={cell}>{entry.entryType}</td>
                  <td style={cell}>{entry.status}</td>
                  <td style={cell}>{entry.shopifyOrderName || entry.shopifyOrderId}</td>
                  <td style={cell}>{money(entry.grossAmountCents)}</td>
                  <td style={cell}>{money(entry.commissionAmountCents)}</td>
                  <td style={cell}>{money(entry.processingFeeCents)}</td>
                  <td style={cell}>{money(entry.sellerEarningsCents)}</td>
                  <td style={cell}>{money(entry.refundAmountCents)}</td>
                  <td style={cell}>{money(entry.payoutAmountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

const cell = { padding: "11px", borderBottom: "1px solid #eee7f1", whiteSpace: "nowrap" } as const;

function Summary({ label, value }: { label: string; value: string }) {
  return <div style={{ background: "white", border: "1px solid #e5dce9", borderRadius: "12px", padding: "15px" }}><div style={{ color: "#756b79", fontSize: "11px", fontWeight: 700 }}>{label}</div><div style={{ color: "#4B1678", fontSize: "21px", fontWeight: 800, marginTop: "4px" }}>{value}</div></div>;
}
