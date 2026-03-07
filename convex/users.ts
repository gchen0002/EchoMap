import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Get or create a user from their Clerk identity.
 * Called on first login to ensure user exists in Convex.
 */
export const upsertUser = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    avatarUrl: v.string(),
  },
  handler: async (ctx, { clerkId, name, avatarUrl }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      // Update name/avatar if changed
      await ctx.db.patch(existing._id, { name, avatarUrl });
      return existing._id;
    }

    return await ctx.db.insert("users", { clerkId, name, avatarUrl });
  },
});

/**
 * Get the current user's Convex document by their Clerk ID.
 */
export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});
