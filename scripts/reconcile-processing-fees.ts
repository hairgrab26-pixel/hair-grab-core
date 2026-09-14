// @ts-ignore Node's TypeScript stripping requires explicit local extensions.
import db from "../app/db.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit local extensions.
import { reconcileProcessingFeeOrder } from "../app/processing-fee-reconciliation.server.ts";

type Mode = "dry-run" | "execute";

function readOption(name: string) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length).trim() : null;
}

function modeFromArgs(): Mode | null {
  const dryRun = process.argv.includes("--dry-run");
  const execute = process.argv.includes("--execute");
  if (dryRun === execute) return null;
  return dryRun ? "dry-run" : "execute";
}

const mode = modeFromArgs();
const shop = readOption("shop") || process.env.SHOPIFY_SHOP || process.env.SHOPIFY_STORE_DOMAIN;

if (!mode || !shop || process.argv.some((value) => value === "--help" || value === "-h")) {
  console.error(
    "Usage: npm run reconcile-processing-fees -- --dry-run --shop=store.myshopify.com",
  );
  console.error(
    "       npm run reconcile-processing-fees -- --execute --shop=store.myshopify.com",
  );
  console.error("Exactly one mode is required; --execute performs database updates.");
  process.exitCode = 1;
} else {
  const pendingOrders = await db.sellerLedgerEntry.findMany({
    where: { entryType: "SALE", processingFeeStatus: "PENDING" },
    select: { shopifyOrderId: true },
    distinct: ["shopifyOrderId"],
    orderBy: { shopifyOrderId: "asc" },
  });

  let finalized = 0;
  let skipped = 0;
  let pending = 0;
  let totalFeeCents = 0;
  const failures: Array<{ orderId: string; reason: string }> = [];

  for (const pendingOrder of pendingOrders) {
    const orderId = String(pendingOrder.shopifyOrderId);
    try {
      const result = await reconcileProcessingFeeOrder({
        orderId,
        shop,
        dryRun: mode === "dry-run",
      });

      if (result.status === "FINALIZED") {
        finalized += 1;
        totalFeeCents += result.totalFeeCents;
        console.log(
          `[${mode}] ${orderId}: ${result.totalFeeCents} cents across ${result.updatedEntryCount} SALE entries${mode === "dry-run" ? " would be finalized" : " finalized"}.`,
        );
        for (const change of result.changes || []) {
          console.log(
            `  ${change.entryId}: processing fee ${change.processingFeeCents} cents; seller earnings ${change.sellerEarningsCents} cents${mode === "dry-run" ? " would be written" : " written"}.`,
          );
        }
      } else if (result.status === "SKIPPED") {
        skipped += 1;
        totalFeeCents += result.totalFeeCents;
        console.log(`[${mode}] ${orderId}: skipped (${result.reason || "already finalized"}).`);
      } else {
        pending += 1;
        failures.push({ orderId, reason: result.reason || "Fee remains pending." });
        console.error(`[${mode}] ${orderId}: pending - ${result.reason || "Fee remains pending."}`);
      }
    } catch (error) {
      pending += 1;
      const reason = error instanceof Error ? error.message : "Unknown reconciliation error.";
      failures.push({ orderId, reason });
      console.error(`[${mode}] ${orderId}: error - ${reason}`);
    }
  }

  console.log("\nProcessing-fee reconciliation summary");
  console.log(`Shopify orders examined: ${pendingOrders.length}`);
  console.log(`Orders finalized: ${finalized}`);
  console.log(`Orders skipped because already finalized: ${skipped}`);
  console.log(`Orders remaining pending: ${pending}`);
  console.log(`Total processing fees allocated: ${totalFeeCents} cents`);
  if (failures.length > 0) {
    console.log("Failures/errors:");
    for (const failure of failures) console.log(`- ${failure.orderId}: ${failure.reason}`);
  }
}
