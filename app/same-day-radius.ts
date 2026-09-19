export const DEFAULT_SAME_DAY_RADIUS_MILES = 10;
export const SHIPDAY_SAME_DAY_RADIUS_MILES = 30;

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export function configuredSameDayRadiusMiles(env: NodeJS.ProcessEnv = process.env) {
  const raw = Number(env.SHIPDAY_DELIVERY_RADIUS_MILES);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_SAME_DAY_RADIUS_MILES;
}

export function milesBetween(from: GeoPoint, to: GeoPoint) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.7613;
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithinSameDayRadius(
  seller: GeoPoint,
  buyer: GeoPoint,
  radiusMiles = configuredSameDayRadiusMiles(),
) {
  return milesBetween(seller, buyer) <= radiusMiles;
}
