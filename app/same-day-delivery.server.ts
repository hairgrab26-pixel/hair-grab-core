import type { Seller } from "@prisma/client";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { shipday } from "./shipday.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { priceSameDayDelivery } from "./delivery-pricing.server.ts";

export type SameDaySeller = Pick<Seller,
  "id" | "status" | "offersSameDayDelivery" | "businessName" | "phone" |
  "address1" | "address2" | "city" | "state" | "postalCode" | "country"> & {
    sameDayProvisioningStatus?: string; shopifyFulfillmentServiceId?: string | null;
    shopifyFulfillmentLocationId?: string | null; sameDayProvisioningData?: unknown;
  };
export type DeliveryDestination = {
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};
export type SameDayQuoteInput = {
  sellerId: string;
  destination: DeliveryDestination;
  pickupAt?: string;
  deliveryAt?: string;
};

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
function hasAddress(address: DeliveryDestination) {
  return [address.address1, address.city, address.state, address.postalCode, address.country].every(nonempty);
}
function formatAddress(address: DeliveryDestination) {
  return [address.address1, address.address2, address.city, address.state,
    address.postalCode, address.country].filter(nonempty).map((part) => part.trim()).join(", ");
}
function isUS(country: string) {
  return ["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(country.trim().toUpperCase());
}

export function sameDaySellerEligible(seller: SameDaySeller) {
  return seller.status === "ACTIVE" && seller.offersSameDayDelivery === true &&
    nonempty(seller.businessName) && nonempty(seller.phone) &&
    /^\+?[\d\s().-]+$/.test(seller.phone) &&
    seller.phone.replace(/\D/g, "").length >= 10 &&
    seller.phone.replace(/\D/g, "").length <= 15 &&
    [seller.address1, seller.city, seller.state, seller.postalCode, seller.country].every(nonempty);
}

async function loadSeller(sellerId: string): Promise<SameDaySeller | null> {
  // Lazy import keeps pure eligibility/pricing tests independent of a database.
  // @ts-ignore Node's TypeScript stripping requires explicit extensions.
  const { default: db } = await import("./db.server.ts");
  return db.seller.findUnique({
    where: { id: sellerId },
    select: {
      id: true, status: true, offersSameDayDelivery: true, businessName: true,
      phone: true, address1: true, address2: true, city: true, state: true,
      postalCode: true, country: true,
    },
  });
}

type Quote = ReturnType<typeof priceSameDayDelivery> & {
  provider: string;
  reference: string | null;
  pickupAt: string | null;
  deliveryAt: string | null;
};
export type SameDayQuoteResult =
  | { available: true; sellerId: string; quotedAt: string; quotes: Quote[] }
  | { available: false; reason: "INVALID_REQUEST" | "SELLER_INELIGIBLE" |
      "UNSUPPORTED_CURRENCY" | "UNAVAILABLE" | "SERVICE_ERROR"; quotes: [] };

/** Server-only dependency seam; production reads Seller and uses real HTTP.
 * No browser-supplied address for pickup, provider price, or seller object is used.
 * Quotes are estimates, not payment/dispatch authorization. Requote before future
 * dispatch; Shipday does not document a guaranteed validity period here.
 */
export function createSameDayQuoteService(readSeller: typeof loadSeller = loadSeller) {
  return async function quote(input: SameDayQuoteInput): Promise<SameDayQuoteResult> {
    if (!input || !nonempty(input.sellerId) || !input.destination ||
        !hasAddress(input.destination) ||
        [input.pickupAt, input.deliveryAt].some((value) => value !== undefined &&
          (typeof value !== "string" || !Number.isFinite(Date.parse(value)))) ||
        (input.pickupAt && input.deliveryAt && Date.parse(input.pickupAt) > Date.parse(input.deliveryAt))) {
      return { available: false, reason: "INVALID_REQUEST", quotes: [] };
    }
    try {
      const seller = await readSeller(input.sellerId);
      if (!seller || seller.id !== input.sellerId || !sameDaySellerEligible(seller)) {
        return { available: false, reason: "SELLER_INELIGIBLE", quotes: [] };
      }
      // Current HairGrab pricing is USD. Do not silently label foreign quotes USD.
      if (!isUS(seller.country) || !isUS(input.destination.country)) {
        return { available: false, reason: "UNSUPPORTED_CURRENCY", quotes: [] };
      }
      const pickup = formatAddress({ ...seller, address1: seller.address1!, city: seller.city!,
        state: seller.state!, postalCode: seller.postalCode! });
      const destination = formatAddress(input.destination);
      const estimates = await shipday.availability({
        pickupAddress: pickup,
        deliveryAddress: destination,
        ...(input.pickupAt ? { pickUpTime: new Date(input.pickupAt).toISOString() } : {}),
        ...(input.deliveryAt ? { deliveryTime: new Date(input.deliveryAt).toISOString() } : {}),
      });
      // Allowlist the response; never forward provider payloads or address echoes.
      const privateValues = [seller.address1!, input.destination.address1, pickup, destination];
      const safeIdentifier = (value: string | null) => value === null ||
        !privateValues.some((privateValue) => value.toLowerCase().includes(privateValue.trim().toLowerCase()));
      const quotes: Quote[] = [];
      for (const estimate of estimates) {
        if (!estimate.available || !estimate.provider || estimate.providerCostCents === null ||
            !safeIdentifier(estimate.provider) || !safeIdentifier(estimate.reference)) continue;
        quotes.push({
          ...priceSameDayDelivery(estimate.providerCostCents),
          provider: estimate.provider,
          reference: estimate.reference,
          pickupAt: estimate.pickupAt,
          deliveryAt: estimate.deliveryAt,
        });
      }
      if (!quotes.length) return { available: false, reason: "UNAVAILABLE", quotes: [] };
      return { available: true, sellerId: seller.id, quotedAt: new Date().toISOString(), quotes };
    } catch {
      // Includes storage, HTTP, malformed response, and pricing failures. No PII,
      // provider error body, credential, or original exception leaves this service.
      return { available: false, reason: "SERVICE_ERROR", quotes: [] };
    }
  };
}

export const quoteSellerSameDayDelivery = createSameDayQuoteService();
