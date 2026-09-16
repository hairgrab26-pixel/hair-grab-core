// Test-only fixtures; no database or network dependencies.
export function readyMapping(id: string) {
  return { sameDayProvisioningStatus: "READY", shopifyFulfillmentServiceId: `fs-${id}`, shopifyFulfillmentLocationId: `loc-${id}`,
    sameDayProvisioningData: { version: 1, shop: "hairgrab.myshopify.com", operationId: "verified", owner: null,
      startedAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z", leaseUntil: "2026-09-15T00:00:00Z", action: "provision",
      completed: ["eligibility", "service", "location", "address", "inventory", "delivery", "carrier", "lifecycle", "reconciliation"],
      lastVerifiedStep: "reconciliation", pending: null, retries: { count: 0, nextAttemptAt: null }, fingerprints: {} } };
}
