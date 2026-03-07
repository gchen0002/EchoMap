"use node";

import { v } from "convex/values";
import { internalMutation, from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

import { encodeGeohash } from "../lib/geohash";

/**
 * Seed the database with dummy data for demos and testing.
 * 
 * This script creates:
 * - 3 demo users (Alice, Bob, Charlie)
 * - 10-15 strategic echoes at various locations
 * - All echoes use Google Cloud TTS for audio generation
 * - Echoes expire in 24 hours (like real ones)
 */

// Demo user data
const DEMO_USERS = [
  {
    name: "Alice Chen",
    avatarUrl: "https://api.dicebear.com/7.x/avataars/svg?seed=Alice&backgroundColor=b6e3f4",
    clerkId: "demo_user_alice_001",
  },
  {
    name: "Bob Martinez",
    avatarUrl: "https://api.dicebear.com/7.x/avataars/svg?seed=Bob&backgroundColor=4caf50",
    clerkId: "demo_user_bob_002",
  },
  {
    name: "Charlie Kim",
    avatarUrl: "https://api.dicebear.com/7.x/avataars/svg?seed=Charlie&backgroundColor=d1d5e8",
    clerkId: "demo_user_charlie_003",
  },
] as Array<{
  name: string;
  avatarUrl: string;
  clerkId: string;
}>;

// Strategic echo locations with content
const DEMO_ECHOES = [
  // Central Park, NYC
  {
    lat: 40.7829,
    lng: -73.9654,
    text: "Just walked through Central Park on a beautiful spring morning. The cherry blossoms are starting to bloom!",
    creator: "Alice",
  },
  // Times Square, NYC
  {
    lat: 40.7580,
    lng: -73.9855,
    text: "Standing in Times Square at night - the lights are incredible! Feeling like I'm in the heart of the city.",
    creator: "Bob",
  },
  // Brooklyn Bridge, NYC
  {
    lat: 40.7061,
    lng: -73.9969,
    text: "Walking across the Brooklyn Bridge at sunset. The Manhattan skyline looks amazing from here!",
    creator: "Charlie",
  },
  // Golden Gate Bridge, SF
  {
    lat: 37.8199,
    lng: -122.4783,
    text: "Fog rolling in over the Golden Gate Bridge. Classic San Francisco morning!",
    creator: "Alice",
  },
  // Fisherman's Wharf, SF
  {
    lat: 37.8080,
    lng: -122.4174,
    text: "Sea lions barking at Pier 39! Such a fun tourist spot.",
    creator: "Bob",
  },
  // Pike Place Market, Seattle
  {
    lat: 47.6097,
    lng: -122.3422,
    text: "Throwing fish at Pike Place! The salmon is so fresh here.",
    creator: "Charlie",
  },
  // Tower Bridge, London
  {
    lat: 51.5055,
    lng: -0.0754,
    text: "Crossing the Tower Bridge with a view of the Thames. London is beautiful!",
    creator: "Alice",
  },
  // Shibuya Crossing, Tokyo
  {
    lat: 35.6595,
    lng: 139.7004,
    text: "Crossed the famous Shibuya Crossing! The organized chaos is mesmerizing.",
    creator: "Bob",
  },
  // Sydney Opera House
  {
    lat: -33.8568,
    lng: 151.2153,
    text: "Sitting by the Opera House watching the harbor. Sydney never disappoints!",
    creator: "Charlie",
  },
] as Array<{
  lat: number;
  lng: number;
  text: string;
  creator: string;
}>;

/**
 * Seed the database with demo users and echoes.
 * Run this with: npx convex run convex/seed:seedData
 */
export const seedData = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if already seeded
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", "demo_user_alice_001"))
      .unique();

    if (existingUser) {
      console.log("Database already seeded - skipping");
      return;
    }

    console.log("Seeding database with dummy data...");

    // Create demo users
    const userIds: Record<string, Id<"users">> = {};
    
    for (const user of DEMO_USERS) {
      const userId = await ctx.db.insert("users", {
        clerkId: user.clerkId,
        name: user.name,
        avatarUrl: user.avatarUrl,
      });
      userIds[user.clerkId] = userId;
      console.log(`Created user: ${user.name}`);
    }

  }

    // Create demo echoes with Google TTS
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    for (const echo of DEMO_ECHOES) {
      const userId = userIds[`demo_user_${echo.creator.toLowerCase()}_001`];
      
      if (!userId) {
        console.error(`User not found for creator: ${echo.creator}`);
        continue;
      }

      console.log(`Creating echo by ${echo.creator}...`);
      console.log(`Text: "${echo.text}"`);

      // Call the TTS action to generate audio
      try {
        const result = await ctx.runAction(api.tts.generateAndCreateEcho, {
          userId,
          lat: echo.lat,
          lng: echo.lng,
          text: echo.text,
        });

        if (result.success) {
          console.log(`✓ Echo created successfully`);
        } else if (result.fallback) {
          console.log(`⚠ Echo created with fallback: ${result.reason}`);
        }
      } catch (error) {
        console.error(`Failed to create echo: ${error}`);
      }
    }

    console.log("Seeding complete! Created 3 users and 10 echoes.");
    return { success: true };
  },
});
