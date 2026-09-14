export type ShopifyTransactionFee = {
  amount?: { amount?: string | number; currencyCode?: string | null } | null;
  type?: string | null;
  taxAmount?: { amount?: string | number; currencyCode?: string | null } | null;
};

export type ShopifyPaymentTransaction = {
  id?: string | null;
  kind?: string | null;
  status?: string | null;
  fees?: ShopifyTransactionFee[] | null;
};

export type ProcessingFeeResult =
  | {
      finalized: true;
      totalFeeCents: number;
      captureCount: number;
      feeCurrency: string | null;
    }
  | {
      finalized: false;
      reason: string;
    };

function cents(value: string | number | undefined) {
  const amount = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function classifyFee(type: string | null | undefined) {
  const normalized = String(type || "").trim().toLowerCase();

  // Shopify's transaction fees are payment fees. Exclude conversion/FX and
  // tax-only components so those are not charged as seller processing fees.
  if (/currency|conversion|foreign.?exchange|\bfx\b|tax/.test(normalized)) {
    return "ignore" as const;
  }

  if (
    normalized.length === 0 ||
    /processing|credit.?card|payment|shopify.?payments/.test(normalized)
  ) {
    return "include" as const;
  }

  return "unknown" as const;
}

export function extractCaptureProcessingFee(
  transactions: ShopifyPaymentTransaction[],
  expectedCurrency?: string | null,
): ProcessingFeeResult {
  const seen = new Set<string>();
  const captures = transactions.filter((transaction) => {
    const id = String(transaction.id || "");
    const kind = String(transaction.kind || "").toUpperCase();
    const status = String(transaction.status || "").toUpperCase();

    if (!id || seen.has(id) || kind !== "CAPTURE" || status !== "SUCCESS") {
      return false;
    }

    seen.add(id);
    return true;
  });

  if (captures.length === 0) {
    return {
      finalized: false,
      reason: "No successful capture transaction was returned.",
    };
  }

  let totalFeeCents = 0;
  let feeCurrency: string | null = null;

  for (const capture of captures) {
    if (!Array.isArray(capture.fees)) {
      return {
        finalized: false,
        reason: `Capture ${capture.id} did not include fee data.`,
      };
    }

    for (const fee of capture.fees) {
      const feeClass = classifyFee(fee.type);
      if (feeClass === "ignore") {
        continue;
      }
      if (feeClass === "unknown") {
        return {
          finalized: false,
          reason: `Capture ${capture.id} returned an unrecognized fee type.`,
        };
      }

      const amountCents = cents(fee.amount?.amount);
      const currency = fee.amount?.currencyCode || null;

      if (amountCents === null || amountCents < 0) {
        return {
          finalized: false,
          reason: `Capture ${capture.id} returned an invalid processing fee.`,
        };
      }

      if (expectedCurrency && currency && currency !== expectedCurrency) {
        return {
          finalized: false,
          reason: `Capture ${capture.id} fee currency ${currency} does not match ${expectedCurrency}.`,
        };
      }

      if (feeCurrency && currency && feeCurrency !== currency) {
        return {
          finalized: false,
          reason: "Capture fees returned mixed currencies.",
        };
      }

      feeCurrency = currency || feeCurrency;
      totalFeeCents += amountCents;
    }
  }

  return {
    finalized: true,
    totalFeeCents,
    captureCount: captures.length,
    feeCurrency,
  };
}

export type FeeAllocationEntry = {
  id: string;
  grossAmountCents: number;
};

export function allocateProcessingFeeCents(
  totalFeeCents: number,
  entries: FeeAllocationEntry[],
) {
  if (!Number.isInteger(totalFeeCents) || totalFeeCents < 0) {
    return { ok: false as const, reason: "Invalid total processing fee." };
  }

  const eligible = entries.filter(
    (entry) => Number.isInteger(entry.grossAmountCents) && entry.grossAmountCents > 0,
  );
  const totalGrossCents = eligible.reduce(
    (total, entry) => total + entry.grossAmountCents,
    0,
  );

  if (totalFeeCents > 0 && totalGrossCents <= 0) {
    return { ok: false as const, reason: "Positive fee with zero eligible gross." };
  }

  const allocations = new Map<string, number>();
  const remainders = eligible.map((entry) => {
    const numerator = totalFeeCents * entry.grossAmountCents;
    const wholeCents = totalGrossCents === 0 ? 0 : Math.floor(numerator / totalGrossCents);
    allocations.set(entry.id, wholeCents);
    return {
      id: entry.id,
      remainder: totalGrossCents === 0 ? 0 : numerator % totalGrossCents,
    };
  });

  let allocated = [...allocations.values()].reduce((total, amount) => total + amount, 0);
  remainders.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));

  for (let index = 0; allocated < totalFeeCents; index += 1) {
    const target = remainders[index % remainders.length];
    allocations.set(target.id, (allocations.get(target.id) || 0) + 1);
    allocated += 1;
  }

  const allocatedTotal = [...allocations.values()].reduce(
    (total, amount) => total + amount,
    0,
  );

  if (allocatedTotal !== totalFeeCents) {
    return { ok: false as const, reason: "Processing fee allocation did not balance." };
  }

  return { ok: true as const, allocations };
}

export function calculateFeeAdjustedSellerEarningsCents(
  grossAmountCents: number,
  commissionAmountCents: number,
  processingFeeCents: number,
) {
  if (
    !Number.isInteger(grossAmountCents) ||
    !Number.isInteger(commissionAmountCents) ||
    !Number.isInteger(processingFeeCents) ||
    grossAmountCents < 0 ||
    commissionAmountCents < 0 ||
    processingFeeCents < 0
  ) {
    return null;
  }

  const earnings =
    grossAmountCents - commissionAmountCents - processingFeeCents;
  return earnings >= 0 ? earnings : null;
}
