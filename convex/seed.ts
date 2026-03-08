import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const DEMO_USERS = [
  {
    key: "alice",
    name: "Maya Park",
    avatarUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Maya&backgroundColor=b6e3f4",
    clerkId: "demo_user_alice_001",
  },
  {
    key: "bob",
    name: "Theo Alvarez",
    avatarUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Theo&backgroundColor=4caf50",
    clerkId: "demo_user_bob_002",
  },
  {
    key: "charlie",
    name: "Nina Patel",
    avatarUrl:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=Nina&backgroundColor=d1d5e8",
    clerkId: "demo_user_charlie_003",
  },
] as const;

const DEMO_ECHOES = [
  {
    creatorKey: "alice",
    lat: 37.7749,
    lng: -122.4194,
    text: "The air here is weirdly nice for downtown. Either the breeze is helping or someone nearby planted a secret eucalyptus tree.",
  },
  {
    creatorKey: "bob",
    lat: 37.7752,
    lng: -122.4188,
    text: "I paid eight dollars for coffee, so I am legally required to pretend this block is life-changing.",
  },
  {
    creatorKey: "charlie",
    lat: 37.7744,
    lng: -122.4201,
    text: "Fog just rolled in like it got a calendar invite. San Francisco weather loves making an entrance.",
  },
  {
    creatorKey: "alice",
    lat: 37.7756,
    lng: -122.4199,
    text: "This corner has three dogs, two scooters, and one guy explaining AI too loudly. Nature is healing.",
  },
  {
    creatorKey: "bob",
    lat: 37.7741,
    lng: -122.4186,
    text: "It smells like sourdough, bus brakes, and ambition. Honestly, that is the official city perfume.",
  },
  {
    creatorKey: "charlie",
    lat: 37.7750,
    lng: -122.4206,
    text: "The wind here keeps trying to edit my hairstyle, and I have to respect the confidence.",
  },
  {
    creatorKey: "alice",
    lat: 37.7760,
    lng: -122.4183,
    text: "A seagull just looked at me like I owed it startup equity. This city is getting way too competitive.",
  },
  {
    creatorKey: "bob",
    lat: 37.7738,
    lng: -122.4197,
    text: "This block somehow sounds like a meditation app and a fire truck at the exact same time.",
  },
  {
    creatorKey: "charlie",
    lat: 37.7754,
    lng: -122.4179,
    text: "It feels cooler by these buildings. San Francisco really invented natural AC and then added drama.",
  },
  {
    creatorKey: "alice",
    lat: 37.7746,
    lng: -122.4210,
    text: "If you stand here long enough, someone will offer you a tote bag, a beta invite, or both.",
  },
] as const;

export const clearDemoData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const demoUsers = await Promise.all(
      DEMO_USERS.map((user) =>
        ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", user.clerkId))
          .unique()
      )
    );

    const demoUserIds = new Set(
      demoUsers.filter((user): user is NonNullable<(typeof demoUsers)[number]> => user !== null).map((user) => user._id)
    );

    if (demoUserIds.size === 0) {
      return { deletedUsers: 0, deletedEchoes: 0 };
    }

    const allEchoes = await ctx.db.query("echoes").collect();
    let deletedEchoes = 0;

    for (const echo of allEchoes) {
      if (!demoUserIds.has(echo.userId)) {
        continue;
      }

      if (echo.audioStorageId) {
        await ctx.storage.delete(echo.audioStorageId);
      }

      await ctx.db.delete(echo._id);
      deletedEchoes += 1;
    }

    for (const user of demoUsers) {
      if (user) {
        await ctx.db.delete(user._id);
      }
    }

    return {
      deletedUsers: demoUsers.filter(Boolean).length,
      deletedEchoes,
    };
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
  handler: async (ctx): Promise<{
    success: boolean;
    skipped: boolean;
    cleared: {
      deletedUsers: number;
      deletedEchoes: number;
    };
    createdUsers: number;
    createdEchoes: number;
    failedEchoes: number;
    failures: string[];
  }> => {
    const cleared: {
      deletedUsers: number;
      deletedEchoes: number;
    } = await ctx.runMutation(internal.seed.clearDemoData, {});

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
      cleared,
      createdUsers: DEMO_USERS.length,
      createdEchoes,
      failedEchoes,
      failures,
    };
  },
});
