/** API boundary shared by provisioning and fulfillment reconciliation. No import-time IO. */
import { AsyncLocalStorage } from "node:async_hooks";
export type AdminClient = { graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<{ status?: number; headers?: { get(name: string): string | null }; json(): Promise<any> }> };
export class ShopifyFailure extends Error {
  code: string;
  uncertain: boolean;
  constructor(code: string, uncertain = false) { super(code); this.code = code; this.uncertain = uncertain; }
}
type Clock = { now(): number; sleep(ms: number): Promise<void>; random(): number };
const clock: Clock = { now: Date.now, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), random: Math.random };
export class ShopifyScheduler {
  private writeGuard = new AsyncLocalStorage<() => Promise<void>>();
  withWriteGuard<T>(guard: () => Promise<void>, work: () => Promise<T>): Promise<T> {
    return this.writeGuard.run(guard, work);
  }
  private tail: Promise<unknown> = Promise.resolve();
  private available = 0;
  private restoreRate = 50;
  private observedAt = 0;
  private time: Clock;
  constructor(time: Clock = clock) { this.time = time; }
  async run<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  }
  async request(admin: AdminClient, query: string, variables: Record<string, unknown> = {}, write = false,
    onRetry: (attempt: number, delay: number) => Promise<void> = async () => {}) {
    return this.run(async () => {
      for (let attempt = 0; attempt <= 5; attempt++) {
        if (this.observedAt) {
          const available = this.available + (this.time.now() - this.observedAt) / 1000 * this.restoreRate;
          if (available < 100) await this.time.sleep(Math.ceil((100 - available) / this.restoreRate * 1000));
        }
        let response: Awaited<ReturnType<AdminClient["graphql"]>>;
        let body: any;
        // Fence after queue/backoff, immediately before every external write.
        // Guard errors must not be classified as an uncertain Shopify response.
        if (write) await this.writeGuard.getStore()?.();
        try {
          response = await admin.graphql(query, { variables });
          body = await response.json();
        } catch (error) {
          // Shopify's client throws for HTTP errors and GraphQL throttling.
          // Normalize only explicit rejection; transport/5xx writes remain unknown.
          const e = error as any;
          const status = e?.response?.status ?? e?.response?.code;
          const errors = e?.body?.errors?.graphQLErrors ?? e?.body?.errors;
          if (status === 429 || (Array.isArray(errors) && errors.some((x: any) => x.extensions?.code === "THROTTLED"))) {
            response = { status: 429, headers: { get: (name: string) => {
              const headers = e.response?.headers;
              const value = headers?.get?.(name) ?? headers?.[name.toLowerCase()];
              return Array.isArray(value) ? value[0] : value ?? null;
            } }, json: async () => ({}) };
            body = { errors: Array.isArray(errors) ? errors : [], extensions: e.body?.extensions };
          } else {
          if (write) throw new ShopifyFailure("SHOPIFY_WRITE_OUTCOME_UNKNOWN", true);
          if (attempt === 5) throw new ShopifyFailure("SHOPIFY_READ_RETRIES_EXHAUSTED");
          const delay = Math.min(16000, 1000 * 2 ** attempt) + Math.floor(this.time.random() * 250);
          await onRetry(attempt + 1, delay); await this.time.sleep(delay); continue;
          }
        }
        const cost = body.extensions?.cost;
        if (cost?.throttleStatus) {
          this.available = cost.throttleStatus.currentlyAvailable;
          this.restoreRate = Math.max(1, cost.throttleStatus.restoreRate);
          this.observedAt = this.time.now();
        }
        const throttled = response.status === 429 || body.errors?.some((e: any) => e.extensions?.code === "THROTTLED");
        const transient = (response.status || 200) >= 500;
        if (transient && write) throw new ShopifyFailure("SHOPIFY_WRITE_OUTCOME_UNKNOWN", true);
        if (throttled || transient) {
          if (attempt === 5) throw new ShopifyFailure("SHOPIFY_RETRIES_EXHAUSTED");
          const retry = response.headers?.get("Retry-After");
          const retryMs = retry ? (/^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - this.time.now()) : 0;
          const deficit = cost ? Math.max(0, cost.requestedQueryCost - this.available) / this.restoreRate * 1000 : 0;
          const delay = Math.max(Number.isFinite(retryMs) ? retryMs : 0, deficit, Math.min(16000, 1000 * 2 ** attempt)) + Math.floor(this.time.random() * 250);
          await onRetry(attempt + 1, delay); await this.time.sleep(delay); continue;
        }
        if ((response.status || 200) >= 400 || body.errors?.length || !body.data) throw new ShopifyFailure("SHOPIFY_REQUEST_REJECTED", write);
        const errors = Object.values(body.data).flatMap((v: any) => v?.userErrors || []);
        if (errors.length) throw new ShopifyFailure("SHOPIFY_USER_ERROR");
        return body.data;
      }
      throw new ShopifyFailure("SHOPIFY_RETRIES_EXHAUSTED");
    });
  }
}
const schedulers = new Map<string, ShopifyScheduler>();
export function schedulerForShop(shop: string) {
  if (!schedulers.has(shop)) schedulers.set(shop, new ShopifyScheduler());
  return schedulers.get(shop)!;
}

export const SERVICES_QUERY = `#graphql
query HairGrabFulfillmentServices {
  shop { fulfillmentServices { id serviceName inventoryManagement trackingSupport requiresShippingMethod callbackUrl
    location { id isActive isFulfillmentService addressVerified address { address1 address2 city provinceCode zip countryCode phone } }
  } }
}`;
export const SERVICE_CREATE = `#graphql
mutation HairGrabFulfillmentService($name: String!) {
  fulfillmentServiceCreate(name: $name, inventoryManagement: false, trackingSupport: false, requiresShippingMethod: true) {
    fulfillmentService { id location { id } } userErrors { field message }
  }
}`;
export const LOCATION_EDIT = `#graphql
mutation HairGrabLocationEdit($id: ID!, $input: LocationEditInput!) {
  locationEdit(id: $id, input: $input) { location { id } userErrors { field message } }
}`;
export const PRODUCT_INVENTORY_QUERY = `#graphql
query HairGrabSellerInventory($id: ID!, $after: String) {
  product(id: $id) { id variants(first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id deliveryProfile { id } inventoryItem { id tracked inventoryLevels(first: 250) {
      pageInfo { hasNextPage }
      nodes { location { id } quantities(names: ["available", "on_hand", "committed", "reserved", "incoming", "damaged", "safety_stock", "quality_control"]) { name quantity } }
    } } }
  } }
}`;
export const DELIVERY_QUERY = `#graphql
query HairGrabDeliveryConfiguration($id: ID!) {
  deliveryProfile(id: $id) { id profileLocationGroups {
    locationGroup { id locations(first: 250) { pageInfo { hasNextPage } nodes { id } } }
    locationGroupZones(first: 250) { pageInfo { hasNextPage } nodes { zone { id }
      methodDefinitions(first: 250) { pageInfo { hasNextPage } nodes { id name active rateProvider {
        ... on DeliveryRateDefinition { id price { amount currencyCode } }
        ... on DeliveryParticipant { id participantServices { name active } carrierService { id } }
      } } }
    } }
  } }
}`;
export const CARRIER_QUERY = `#graphql
query HairGrabCarrierConfiguration { carrierServices(first: 250) { pageInfo { hasNextPage } nodes { id name callbackUrl active supportsServiceDiscovery } } }
`;
export const DELIVERY_UPDATE = `#graphql
mutation HairGrabDeliveryLocation($id: ID!, $profile: DeliveryProfileInput!) {
  deliveryProfileUpdate(id: $id, profile: $profile) { profile { id } userErrors { field message } }
}`;
export const SCOPES_QUERY = `#graphql
query HairGrabProvisioningAccess { currentAppInstallation { accessScopes { handle } } shop { features { marketDrivenShipping } } }
`;
/** Single source of truth for the OAuth scopes Same-Day provisioning/dispatch require.
 * Both the production readiness gate and the read-only admin diagnostics route import
 * this constant so the two checks can never drift apart. */
export const REQUIRED_SAME_DAY_SCOPES = ["write_fulfillments", "write_assigned_fulfillment_orders", "write_shipping", "write_inventory"] as const;
export type SameDayScopeReadiness = Record<(typeof REQUIRED_SAME_DAY_SCOPES)[number], boolean>;
type ScopesQueryData = { currentAppInstallation?: { accessScopes?: { handle: string }[] } | null; shop?: { features?: { marketDrivenShipping?: boolean } } | null };
/** Pure formatting of a SCOPES_QUERY response. Never returns anything beyond the four
 * required scopes' granted/missing booleans and the public marketDrivenShipping flag —
 * no token, no other scope handles, no shop/session identifiers. */
export function summarizeSameDayReadiness(data: ScopesQueryData): { scopes: SameDayScopeReadiness; marketDrivenShipping: boolean | null } {
  const granted = new Set((data.currentAppInstallation?.accessScopes ?? []).map(s => s.handle));
  const scopes = Object.fromEntries(REQUIRED_SAME_DAY_SCOPES.map(scope => [scope, granted.has(scope)])) as SameDayScopeReadiness;
  return { scopes, marketDrivenShipping: data.shop?.features?.marketDrivenShipping ?? null };
}
/** Pure formatting of the three Same-Day safety-gate env vars as strict booleans.
 * Takes an env object rather than reading process.env so it stays unit-testable. */
export function summarizeSameDayFlags(env: Record<string, string | undefined>) {
  return {
    adminOperations: env.HAIRGRAB_SAME_DAY_ADMIN_OPERATIONS === "true",
    shopifyWrites: env.HAIRGRAB_SAME_DAY_SHOPIFY_WRITES === "true",
    lifecycleReady: env.HAIRGRAB_SAME_DAY_LIFECYCLE_READY === "true",
  };
}
