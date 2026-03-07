import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

async function requireIdentity(ctx: { auth: { getUserIdentity(): Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Not authenticated");
  }

  return identity;
}

/**
 * Get or create a user from their Clerk identity.
 * Called on first login to ensure user exists in Convex.
 */
export const upsertUser = mutation({
  args: {
    name: v.string(),
    avatarUrl: v.string(),
  },
  handler: async (ctx, { name, avatarUrl }) => {
    const identity = await requireIdentity(ctx);
    const clerkId = identity.subject;

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
    const identity = await requireIdentity(ctx);

    if (identity.subject !== clerkId) {
      throw new Error("Unauthorized");
    }

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});
