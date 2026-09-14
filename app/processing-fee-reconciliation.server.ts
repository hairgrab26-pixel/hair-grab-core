import {
  allocateProcessingFeeCents,
  calculateFeeAdjustedSellerEarningsCents,
  extractCaptureProcessingFee,
  type ShopifyPaymentTransaction,
} from "./processing-fees.server.ts";

export const ORDER_TRANSACTIONS_QUERY = `#graphql
  query OrderTransactions($id: ID!) {
    order(id: $id) {
      transactions {
        id
        kind
        status
        fees {
          type
          amount { amount currencyCode }
          taxAmount { amount currencyCode }
        }
      }
    }
  }
`;

type OrderTransactionsResponse = {
  data?: { order?: { transactions?: ShopifyPaymentTransaction[] | null } | null };
  errors?: Array<{ message?: string }>;
};

type SaleEntry = {
  id: string;
  grossAmountCents: number;
  commissionAmountCents: number;
  currency: string;
  processingFeeCents: number;
  processingFeeStatus: string;
};

export type ReconciliationResult = {
  status: "FINALIZED" | "SKIPPED" | "PENDING";
  orderId: string;
  totalFeeCents: number;
  updatedEntryCount: number;
  reason?: string;
  changes?: Array<{
    entryId: string;
    processingFeeCents: number;
    sellerEarningsCents: number;
  }>;
};

type ReconciliationStore = {
  sellerLedgerEntry: {
    findMany: (args: any) => Promise<any[]>;
    update: (args: any) => Promise<unknown>;
  };
  $transaction: <T>(callback: (tx: ReconciliationStore) => Promise<T>) => Promise<T>;
};

async function loadOrderTransactions(shop: string, orderId: string) {
  // @ts-ignore Node's TypeScript stripping requires explicit local extensions.
  const { unauthenticated } = await import("./shopify.server.ts");
  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(ORDER_TRANSACTIONS_QUERY, {
    variables: { id: `gid://shopify/Order/${orderId}` },
  });
  const json = (await response.json()) as OrderTransactionsResponse;
  if (json.errors?.length) {
    throw new Error(
      json.errors.map((error) => error.message || "Unknown Shopify error").join("; "),
    );
  }
  const transactions = json.data?.order?.transactions;
  if (!Array.isArray(transactions)) {
    throw new Error("Shopify did not return order transactions.");
  }
  return transactions;
}

async function getDefaultStore() {
  // @ts-ignore Node's TypeScript stripping requires explicit local extensions.
  const { default: db } = await import("./db.server.ts");
  return db as unknown as ReconciliationStore;
}

export type ReconciliationDependencies = {
  store?: ReconciliationStore;
  loadTransactions?: (shop: string, orderId: string) => Promise<ShopifyPaymentTransaction[]>;
};

export async function reconcileProcessingFeeOrder({
  orderId,
  shop,
  dryRun = false,
  store,
  loadTransactions = loadOrderTransactions,
}: {
  orderId: string;
  shop: string;
  dryRun?: boolean;
} & ReconciliationDependencies): Promise<ReconciliationResult> {
  const activeStore = store || (await getDefaultStore());
  const sales = (await activeStore.sellerLedgerEntry.findMany({
    where: { shopifyOrderId: orderId, entryType: "SALE" },
    select: {
      id: true,
      grossAmountCents: true,
      commissionAmountCents: true,
      currency: true,
      processingFeeCents: true,
      processingFeeStatus: true,
    },
  })) as SaleEntry[];

  if (sales.length === 0) {
    return { status: "SKIPPED", orderId, totalFeeCents: 0, updatedEntryCount: 0, reason: "No SALE entries." };
  }

  if (sales.every((sale) => sale.processingFeeStatus === "FINALIZED")) {
    return {
      status: "SKIPPED",
      orderId,
      totalFeeCents: sales.reduce((total, sale) => total + sale.processingFeeCents, 0),
      updatedEntryCount: 0,
      reason: "Already finalized.",
    };
  }

  if (sales.some((sale) => sale.processingFeeStatus === "FINALIZED")) {
    return { status: "PENDING", orderId, totalFeeCents: 0, updatedEntryCount: 0, reason: "Inconsistent finalized/pending SALE state." };
  }

  const currencies = new Set(sales.map((sale) => sale.currency));
  if (currencies.size !== 1) {
    return { status: "PENDING", orderId, totalFeeCents: 0, updatedEntryCount: 0, reason: "Mixed ledger currencies." };
  }

  let transactions: ShopifyPaymentTransaction[];
  try {
    transactions = await loadTransactions(shop, orderId);
  } catch (error) {
    return {
      status: "PENDING",
      orderId,
      totalFeeCents: 0,
      updatedEntryCount: 0,
      reason: `Shopify transaction query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  const feeResult = extractCaptureProcessingFee(transactions, sales[0].currency);
  if (!feeResult.finalized) {
    return { status: "PENDING", orderId, totalFeeCents: 0, updatedEntryCount: 0, reason: feeResult.reason };
  }
  if (feeResult.totalFeeCents > 0 && !feeResult.feeCurrency) {
    return { status: "PENDING", orderId, totalFeeCents: 0, updatedEntryCount: 0, reason: "Processing fee currency is missing." };
  }

  const allocation = allocateProcessingFeeCents(
    feeResult.totalFeeCents,
    sales.map((sale) => ({ id: sale.id, grossAmountCents: sale.grossAmountCents })),
  );
  if (!allocation.ok) {
    return { status: "PENDING", orderId, totalFeeCents: 0, updatedEntryCount: 0, reason: allocation.reason };
  }

  const updates = sales.map((sale) => {
    const processingFeeCents = allocation.allocations.get(sale.id) || 0;
    const sellerEarningsCents = calculateFeeAdjustedSellerEarningsCents(
      sale.grossAmountCents,
      sale.commissionAmountCents,
      processingFeeCents,
    );
    return { sale, processingFeeCents, sellerEarningsCents };
  });
  if (updates.some((update) => update.sellerEarningsCents === null)) {
    return { status: "PENDING", orderId, totalFeeCents: 0, updatedEntryCount: 0, reason: "Processing fee exceeds seller earnings." };
  }

  if (dryRun) {
    return {
      status: "FINALIZED",
      orderId,
      totalFeeCents: feeResult.totalFeeCents,
      updatedEntryCount: updates.length,
      changes: updates.map((update) => ({
        entryId: update.sale.id,
        processingFeeCents: update.processingFeeCents,
        sellerEarningsCents: update.sellerEarningsCents as number,
      })),
    };
  }

  const finalizedAt = new Date();
  await activeStore.$transaction(async (tx) => {
    const currentSales = (await tx.sellerLedgerEntry.findMany({
      where: { shopifyOrderId: orderId, entryType: "SALE" },
      select: { id: true, processingFeeStatus: true },
    })) as Array<{ id: string; processingFeeStatus: string }>;

    if (currentSales.length === 0 || currentSales.every((sale) => sale.processingFeeStatus === "FINALIZED")) return;
    if (currentSales.some((sale) => sale.processingFeeStatus === "FINALIZED")) {
      throw new Error("Processing fee state changed concurrently.");
    }
    if (
      currentSales.length !== sales.length ||
      currentSales.some((sale) => !sales.some((initial) => initial.id === sale.id))
    ) {
      throw new Error("SALE entries changed while processing the fee.");
    }

    for (const update of updates) {
      await tx.sellerLedgerEntry.update({
        where: { id: update.sale.id },
        data: {
          processingFeeCents: update.processingFeeCents,
          processingFeeStatus: "FINALIZED",
          processingFeeFinalizedAt: finalizedAt,
          sellerEarningsCents: update.sellerEarningsCents as number,
        },
      });
    }
  });

  return {
    status: "FINALIZED",
    orderId,
    totalFeeCents: feeResult.totalFeeCents,
    updatedEntryCount: updates.length,
    changes: updates.map((update) => ({
      entryId: update.sale.id,
      processingFeeCents: update.processingFeeCents,
      sellerEarningsCents: update.sellerEarningsCents as number,
    })),
  };
}
