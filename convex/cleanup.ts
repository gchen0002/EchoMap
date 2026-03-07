import { internalMutation } from "./_generated/server";

/**
 * Delete all Echoes whose expiresAt timestamp has passed.
 * Called by the cron job every hour.
 */
export const deleteExpiredEchoes = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    const expired = await ctx.db
      .query("echoes")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .collect();

    for (const echo of expired) {
      // Delete the stored audio file
      if (echo.audioStorageId) {
        await ctx.storage.delete(echo.audioStorageId);
      }
      // Delete the echo document
      await ctx.db.delete(echo._id);
    }

    return { deleted: expired.length };
  },
});
