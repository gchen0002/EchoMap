/**
 * Geohash Spatial Indexing Utility
 *
 * Instead of calculating the distance from the user to every Echo in the
 * database (O(n) time), we encode GPS coordinates into a "Geohash" string
 * that represents a bounding box on Earth. Querying the database by Geohash
 * prefix gives us O(1) lookup time.
 *
 * Algorithm:
 * 1. Encode (lat, lng) → Geohash string at precision 7 (~150m x 150m box)
 * 2. Build a bounding box around the discovery radius
 * 3. Query every Geohash cell intersecting that box
 * 4. Refine results with exact Haversine distance filter
 */
import ngeohash from "ngeohash";

// Precision 7 keeps cells small enough for smooth nearby discovery.
const GEOHASH_PRECISION = 7;

// Maximum radius in meters for an Echo to be "discoverable"
export const DISCOVERY_RADIUS_METERS = 500;

/**
 * Encode latitude and longitude into a Geohash string.
 */
export function encodeGeohash(lat: number, lng: number): string {
  return ngeohash.encode(lat, lng, GEOHASH_PRECISION);
}

/**
 * Given a user's position, return every geohash cell that intersects the
 * discovery radius bounding box so larger radii still include all candidates.
 */
export function getQueryGeohashes(lat: number, lng: number): string[] {
  const latDelta = DISCOVERY_RADIUS_METERS / 111_320;
  const safeCosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const lngDelta = DISCOVERY_RADIUS_METERS / (111_320 * safeCosLat);
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;

  return Array.from(
    new Set(ngeohash.bboxes(minLat, minLng, maxLat, maxLng, GEOHASH_PRECISION))
  );
}

/**
 * Haversine formula — compute the great-circle distance in meters between
 * two GPS coordinates. Used as the final refinement step after the fast
 * Geohash filter to get exact distances.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
