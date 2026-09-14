import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore Node's TypeScript stripping requires the explicit extension.
import {
  reconcileProcessingFeeOrder,
  type ReconciliationDependencies,
} from "./processing-fee-reconciliation.server.ts";

type MockSale = {
  id: string;
  grossAmountCents: number;
  commissionAmountCents: number;
  currency: string;
  processingFeeCents: number;
  processingFeeStatus: string;
};

function mockStore(initialSales: MockSale[]) {
  const sales = initialSales.map((sale) => ({ ...sale }));
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  let transactionCount = 0;

  const store = {
    sellerLedgerEntry: {
      async findMany(args: { select?: Record<string, boolean> }) {
        return sales.map((sale) => {
          if (args.select?.processingFeeStatus && !args.select.processingFeeCents) {
            return { id: sale.id, processingFeeStatus: sale.processingFeeStatus };
          }
          return { ...sale };
        });
      },
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        const sale = sales.find((candidate) => candidate.id === args.where.id);
        if (!sale) throw new Error("Sale not found");
        Object.assign(sale, args.data);
        updates.push({ id: args.where.id, data: args.data });
        return sale;
      },
    },
    async $transaction<T>(callback: (tx: typeof store) => Promise<T>) {
      transactionCount += 1;
      return callback(store);
    },
  };

  return { store, sales, updates, get transactionCount() { return transactionCount; } };
}

function deps(
  store: ReturnType<typeof mockStore>["store"],
  transactions: unknown,
): ReconciliationDependencies {
  return {
    store,
    loadTransactions: async () => transactions as any,
  };
}

test("reconciles one seller from a successful capture", async () => {
  const mock = mockStore([
    {
      id: "sale-1",
      grossAmountCents: 10000,
      commissionAmountCents: 700,
      currency: "USD",
      processingFeeCents: 0,
      processingFeeStatus: "PENDING",
    },
  ]);

  const result = await reconcileProcessingFeeOrder({
    orderId: "1002",
    shop: "test.myshopify.com",
    ...deps(mock.store, [
      { id: "auth", kind: "AUTHORIZATION", status: "SUCCESS", fees: [] },
      { id: "capture", kind: "CAPTURE", status: "SUCCESS", fees: [{ type: "processing_fee", amount: { amount: "3.17", currencyCode: "USD" } }] },
    ]),
  });

  assert.equal(result.status, "FINALIZED");
  assert.equal(mock.sales[0].processingFeeCents, 317);
  assert.equal(mock.sales[0].sellerEarningsCents, 8983);
});

test("allocates multiple captures across sellers with deterministic cents", async () => {
  const mock = mockStore([
    { id: "a", grossAmountCents: 7500, commissionAmountCents: 525, currency: "USD", processingFeeCents: 0, processingFeeStatus: "PENDING" },
    { id: "b", grossAmountCents: 2500, commissionAmountCents: 175, currency: "USD", processingFeeCents: 0, processingFeeStatus: "PENDING" },
  ]);

  const result = await reconcileProcessingFeeOrder({
    orderId: "1003",
    shop: "test.myshopify.com",
    ...deps(mock.store, [
      { id: "capture-a", kind: "CAPTURE", status: "SUCCESS", fees: [{ type: "processing_fee", amount: { amount: "1.50", currencyCode: "USD" } }] },
      { id: "capture-b", kind: "CAPTURE", status: "SUCCESS", fees: [{ type: "processing_fee", amount: { amount: "2.50", currencyCode: "USD" } }] },
      { id: "failed", kind: "CAPTURE", status: "FAILURE", fees: [{ type: "processing_fee", amount: { amount: "99.00", currencyCode: "USD" } }] },
    ]),
  });

  assert.equal(result.totalFeeCents, 400);
  assert.deepEqual(mock.updates.map((update) => update.data.processingFeeCents), [300, 100]);
});

test("confirmed zero fee finalizes and malformed or missing data remains pending", async () => {
  const zero = mockStore([
    { id: "zero", grossAmountCents: 10000, commissionAmountCents: 700, currency: "USD", processingFeeCents: 0, processingFeeStatus: "PENDING" },
  ]);
  const zeroResult = await reconcileProcessingFeeOrder({
    orderId: "zero",
    shop: "test.myshopify.com",
    ...deps(zero.store, [{ id: "capture", kind: "CAPTURE", status: "SUCCESS", fees: [] }]),
  });
  assert.equal(zeroResult.status, "FINALIZED");
  assert.equal(zero.sales[0].processingFeeStatus, "FINALIZED");

  const missing = mockStore([
    { id: "missing", grossAmountCents: 10000, commissionAmountCents: 700, currency: "USD", processingFeeCents: 0, processingFeeStatus: "PENDING" },
  ]);
  const missingResult = await reconcileProcessingFeeOrder({
    orderId: "missing",
    shop: "test.myshopify.com",
    ...deps(missing.store, [{ id: "capture", kind: "CAPTURE", status: "SUCCESS", fees: null }]),
  });
  assert.equal(missingResult.status, "PENDING");
  assert.equal(missing.updates.length, 0);
});

test("dry run performs no writes and reruns skip finalized orders", async () => {
  const mock = mockStore([
    { id: "sale", grossAmountCents: 10000, commissionAmountCents: 700, currency: "USD", processingFeeCents: 0, processingFeeStatus: "PENDING" },
  ]);
  const transactions = [{ id: "capture", kind: "CAPTURE", status: "SUCCESS", fees: [{ type: "processing_fee", amount: { amount: "2.59", currencyCode: "USD" } }] }];

  const dryRun = await reconcileProcessingFeeOrder({
    orderId: "dry",
    shop: "test.myshopify.com",
    dryRun: true,
    ...deps(mock.store, transactions),
  });
  assert.equal(dryRun.status, "FINALIZED");
  assert.equal(mock.updates.length, 0);
  assert.equal(mock.transactionCount, 0);

  await reconcileProcessingFeeOrder({ orderId: "dry", shop: "test.myshopify.com", ...deps(mock.store, transactions) });
  const rerun = await reconcileProcessingFeeOrder({
    orderId: "dry",
    shop: "test.myshopify.com",
    ...deps(mock.store, transactions),
    loadTransactions: async () => { throw new Error("must not query finalized order"); },
  });
  assert.equal(rerun.status, "SKIPPED");
  assert.equal(mock.updates.length, 1);
});
