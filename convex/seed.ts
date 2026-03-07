import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const DEMO_USERS = [
  {
    key: "alice",
    name: "Alice Chen",
    avatarUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Alice&backgroundColor=b6e3f4",
    clerkId: "demo_user_alice_001",
  },
  {
    key: "bob",
    name: "Bob Martinez",
    avatarUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Bob&backgroundColor=4caf50",
    clerkId: "demo_user_bob_002",
  },
  {
    key: "charlie",
    name: "Charlie Kim",
    avatarUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie&backgroundColor=d1d5e8",
    clerkId: "demo_user_charlie_003",
  },
] as const;

const DEMO_ECHOES = [
  {
    creatorKey: "alice",
    lat: 37.7749,
    lng: -122.4194,
    text: "Kicking off the EchoMap demo from downtown San Francisco. The city feels alive tonight.",
  },
  {
    creatorKey: "bob",
    lat: 37.7752,
    lng: -122.4188,
    text: "Just grabbed coffee nearby and found this corner buzzing with founders, tourists, and cyclists.",
  },
  {
    creatorKey: "charlie",
    lat: 37.7744,
    lng: -122.4201,
    text: "Fog is rolling in fast. It is the perfect soundtrack for a late-night walk through Market Street.",
  },
  {
    creatorKey: "alice",
    lat: 37.7756,
    lng: -122.4199,
    text: "If you are hearing this echo, you are right in the sweet spot of our geohash discovery radius.",
  },
  {
    creatorKey: "bob",
    lat: 37.7741,
    lng: -122.4186,
    text: "Testing the 500 meter proximity bubble. You should catch this one from farther out now.",
  },
  {
    creatorKey: "charlie",
    lat: 37.7750,
    lng: -122.4206,
    text: "This is one of our seeded demo echoes, generated with Google Cloud TTS so the map never feels empty.",
  },
  {
    creatorKey: "alice",
    lat: 37.7760,
    lng: -122.4183,
    text: "Imagine finding a hidden audio postcard like this while walking to your next event downtown.",
  },
  {
    creatorKey: "bob",
    lat: 37.7738,
    lng: -122.4197,
    text: "Drop your own echo nearby and you can compare the live recording flow against our seeded dataset.",
  },
  {
    creatorKey: "charlie",
    lat: 37.7754,
    lng: -122.4179,
    text: "Another seeded marker here to make the discovery cluster feel dense and intentional for the demo.",
  },
  {
    creatorKey: "alice",
    lat: 37.7746,
    lng: -122.4210,
    text: "EchoMap turns physical space into a lightweight social layer. This seeded trail helps show the concept instantly.",
  },
] as const;

export const hasSeedData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", "demo_user_alice_001"))
      .unique();

    return existingUser !== null;
  },
});

export const ensureDemoUser = internalMutation({
  args: {
    key: v.string(),
    name: v.string(),
    avatarUrl: v.string(),
    clerkId: v.string(),
  },
  handler: async (ctx, { name, avatarUrl, clerkId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { name, avatarUrl });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId,
      name,
      avatarUrl,
    });
  },
});

export const seedData = action({
  args: {},
  handler: async (ctx) => {
    const alreadySeeded = await ctx.runQuery(internal.seed.hasSeedData, {});

    if (alreadySeeded) {
      return {
        success: true,
        skipped: true,
        createdUsers: 0,
        createdEchoes: 0,
        failedEchoes: 0,
      };
    }

    const userIds: Record<string, Id<"users">> = {};

    for (const user of DEMO_USERS) {
      userIds[user.key] = await ctx.runMutation(internal.seed.ensureDemoUser, user);
    }

    let createdEchoes = 0;
    let failedEchoes = 0;
    const failures: string[] = [];

    for (const echo of DEMO_ECHOES) {
      const userId = userIds[echo.creatorKey];

      if (!userId) {
        failedEchoes += 1;
        failures.push(`Missing demo user for ${echo.creatorKey}`);
        continue;
      }

      try {
        await ctx.runAction(internal.tts.generateAndCreateSeedEcho, {
          userId,
          lat: echo.lat,
          lng: echo.lng,
          text: echo.text,
        });
        createdEchoes += 1;
      } catch (error) {
        failedEchoes += 1;
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    return {
      success: failedEchoes === 0,
      skipped: false,
      createdUsers: DEMO_USERS.length,
      createdEchoes,
      failedEchoes,
      failures,
    };
  },
});
