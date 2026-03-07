import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    avatarUrl: v.string(),
  }).index("by_clerk_id", ["clerkId"]),

  echoes: defineTable({
    userId: v.id("users"),
    lat: v.number(),
    lng: v.number(),
    geohash: v.string(),
    audioStorageId: v.optional(v.id("_storage")),
    text: v.optional(v.string()),
    isAiGenerated: v.boolean(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_geohash", ["geohash"])
    .index("by_expires_at", ["expiresAt"]),
});
