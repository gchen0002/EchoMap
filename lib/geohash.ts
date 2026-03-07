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
 * 2. Compute the 8 neighboring Geohash boxes
 * 3. Query DB for all 9 Geohashes (self + 8 neighbors)
 * 4. Refine results with exact Haversine distance filter
 */
import ngeohash from "ngeohash";

// Precision 7 ≈ 150m x 150m cells — ideal for "nearby" discovery
const GEOHASH_PRECISION = 7;

// Maximum radius in meters for an Echo to be "discoverable"
export const DISCOVERY_RADIUS_METERS = 150;

/**
 * Encode latitude and longitude into a Geohash string.
 */
export function encodeGeohash(lat: number, lng: number): string {
  return ngeohash.encode(lat, lng, GEOHASH_PRECISION);
}

/**
 * Given a user's position, return the 9 Geohash strings (self + 8 neighbors)
 * required to query for all nearby Echoes without missing any at cell edges.
 */
export function getQueryGeohashes(lat: number, lng: number): string[] {
  const center = encodeGeohash(lat, lng);
  const neighbors = ngeohash.neighbors(center);

  // neighbors returns [n, ne, e, se, s, sw, w, nw]
  return [center, ...neighbors];
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
