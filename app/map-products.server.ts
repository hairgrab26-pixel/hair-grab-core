// @ts-ignore Node's TypeScript stripping requires the explicit extension.
import { isSameDayShipsWithin } from "./product-attribute-tags.ts";
// @ts-ignore Node's TypeScript stripping requires the explicit extension.
import { isWithinSameDayRadius, type GeoPoint } from "./same-day-radius.ts";

export type MapProductInput = {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  priceCents: number;
  seller: string;
  sellerCode: string;
  city: string;
  state: string;
  shipsWithin: string | string[];
  tags?: string[];
  sameDayDelivery?: boolean;
  showOnMap?: boolean;
  latitude: number | null;
  longitude: number | null;
};

export function isSameDayMapProduct(product: Pick<MapProductInput, "shipsWithin" | "tags" | "sameDayDelivery">) {
  if (product.sameDayDelivery) return true;
  if (isSameDayShipsWithin(product.shipsWithin)) return true;
  return (product.tags || []).some((tag) => /same\s*-?\s*day/i.test(tag));
}

export function buildMapProductsGeoJson(
  products: MapProductInput[],
  buyer: GeoPoint | null,
  radiusMiles: number,
) {
  return {
    type: "FeatureCollection" as const,
    features: products
      .filter((product) => product.showOnMap !== false && product.latitude != null && product.longitude != null)
      .map((product) => {
        const isSameDayProduct = isSameDayMapProduct(product);
        const sellerPoint = { latitude: product.latitude!, longitude: product.longitude! };
        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [product.longitude!, product.latitude!] as [number, number],
          },
          properties: {
            id: product.id,
            title: product.title,
            handle: product.handle,
            imageUrl: product.imageUrl,
            priceCents: product.priceCents,
            seller: product.seller,
            sellerCode: product.sellerCode,
            city: product.city,
            state: product.state,
            isSameDayProduct,
            isSameDayEligible: Boolean(
              isSameDayProduct && buyer && isWithinSameDayRadius(sellerPoint, buyer, radiusMiles),
            ),
          },
        };
      }),
  };
}

export function parseBuyerLocation(url: URL): GeoPoint | null {
  const latitude = Number(url.searchParams.get("lat") || url.searchParams.get("buyerLat"));
  const longitude = Number(url.searchParams.get("lng") || url.searchParams.get("buyerLng"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
