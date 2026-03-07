import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  encodeGeohash,
  getQueryGeohashes,
  haversineDistance,
  DISCOVERY_RADIUS_METERS,
} from "../lib/geohash";

// ─── Queries ──────────────────────────────────────────────────────────────

/**
 * Get all Echoes near a given position.
 *
 * This is the core spatial query that uses our Geohash algorithm:
 * 1. Compute the 9 Geohash cells covering the user's area
 * 2. Query the indexed "by_geohash" index for each cell (O(1) per cell)
 * 3. Refine with Haversine distance to remove false positives at edges
 * 4. Filter out expired Echoes
 */
export const getNearbyEchoes = query({
  args: {
    userLat: v.number(),
    userLng: v.number(),
  },
  handler: async (ctx, { userLat, userLng }) => {
    const geohashes = getQueryGeohashes(userLat, userLng);
    const now = Date.now();

    // Query all 9 geohash cells in parallel
    const echoArrays = await Promise.all(
      geohashes.map((gh) =>
        ctx.db
          .query("echoes")
          .withIndex("by_geohash", (q) => q.eq("geohash", gh))
          .collect()
      )
    );

    // Flatten, deduplicate, filter expired, and refine by exact distance
    const allEchoes = echoArrays.flat();
    const seen = new Set<string>();

    const nearbyEchoes = allEchoes.filter((echo) => {
      // Deduplicate
      const id = echo._id.toString();
      if (seen.has(id)) return false;
      seen.add(id);

      // Remove expired
      if (echo.expiresAt <= now) return false;

      // Haversine refinement
      const dist = haversineDistance(userLat, userLng, echo.lat, echo.lng);
      return dist <= DISCOVERY_RADIUS_METERS;
    });

    // Enrich with user info and audio URL
    const enriched = await Promise.all(
      nearbyEchoes.map(async (echo) => {
        const user = await ctx.db.get(echo.userId);
        const audioUrl = await ctx.storage.getUrl(echo.audioStorageId);
        const distance = haversineDistance(userLat, userLng, echo.lat, echo.lng);

        return {
          ...echo,
          userName: user?.name ?? "Anonymous",
          userAvatar: user?.avatarUrl ?? "",
          audioUrl,
          distance: Math.round(distance),
        };
      })
    );

    // Sort by closest first
    return enriched.sort((a, b) => a.distance - b.distance);
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────

/**
 * Create a new Echo at a specific location.
 * Called after audio has been uploaded to Convex File Storage.
 */
export const createEcho = mutation({
  args: {
    userId: v.id("users"),
    lat: v.number(),
    lng: v.number(),
    audioStorageId: v.id("_storage"),
    text: v.optional(v.string()),
    isAiGenerated: v.boolean(),
  },
  handler: async (ctx, args) => {
    const geohash = encodeGeohash(args.lat, args.lng);
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    return await ctx.db.insert("echoes", {
      userId: args.userId,
      lat: args.lat,
      lng: args.lng,
      geohash,
      audioStorageId: args.audioStorageId,
      text: args.text,
      isAiGenerated: args.isAiGenerated,
      createdAt: now,
      expiresAt: now + TWENTY_FOUR_HOURS,
    });
  },
});

/**
 * Generate an upload URL for audio files (native recordings or ElevenLabs output).
 */
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
