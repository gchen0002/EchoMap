import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getMonthlyUsage = internalQuery({
  args: {
    period: v.string(),
  },
  handler: async (ctx, { period }) => {
    const usage = await ctx.db
      .query("ttsUsage")
      .withIndex("by_period", (q) => q.eq("period", period))
      .unique();

    return {
      period,
      usedCharacters: usage?.usedCharacters ?? 0,
      reservedCharacters: usage?.reservedCharacters ?? 0,
      successfulRequests: usage?.successfulRequests ?? 0,
      fallbackRequests: usage?.fallbackRequests ?? 0,
    };
  },
});

export const reserveMonthlyQuota = internalMutation({
  args: {
    period: v.string(),
    requestId: v.string(),
    characters: v.number(),
    limit: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, { period, requestId, characters, limit, expiresAt }) => {
    const now = Date.now();
    const existingReservation = await ctx.db
      .query("ttsReservations")
      .withIndex("by_request_id", (q) => q.eq("requestId", requestId))
      .unique();

    if (existingReservation) {
      return {
        allowed: existingReservation.status === "pending",
        reason:
          existingReservation.status === "pending"
            ? "already_reserved"
            : "already_finalized",
      };
    }

    const usage = await ctx.db
      .query("ttsUsage")
      .withIndex("by_period", (q) => q.eq("period", period))
      .unique();

    const usedCharacters = usage?.usedCharacters ?? 0;
    const reservedCharacters = usage?.reservedCharacters ?? 0;
    const nextTotal = usedCharacters + reservedCharacters + characters;

    if (nextTotal > limit) {
      if (usage) {
        await ctx.db.patch(usage._id, {
          fallbackRequests: usage.fallbackRequests + 1,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("ttsUsage", {
          period,
          usedCharacters: 0,
          reservedCharacters: 0,
          successfulRequests: 0,
          fallbackRequests: 1,
          updatedAt: now,
        });
      }

      return {
        allowed: false,
        reason: "monthly_quota_exceeded",
        usedCharacters,
        reservedCharacters,
        limit,
      };
    }

    if (usage) {
      await ctx.db.patch(usage._id, {
        reservedCharacters: reservedCharacters + characters,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("ttsUsage", {
        period,
        usedCharacters: 0,
        reservedCharacters: characters,
        successfulRequests: 0,
        fallbackRequests: 0,
        updatedAt: now,
      });
    }

    await ctx.db.insert("ttsReservations", {
      requestId,
      period,
      characters,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });

    return {
      allowed: true,
      reason: null,
      usedCharacters,
      reservedCharacters: reservedCharacters + characters,
      limit,
    };
  },
});

export const finishReservation = internalMutation({
  args: {
    requestId: v.string(),
    consumed: v.boolean(),
  },
  handler: async (ctx, { requestId, consumed }) => {
    const now = Date.now();
    const reservation = await ctx.db
      .query("ttsReservations")
      .withIndex("by_request_id", (q) => q.eq("requestId", requestId))
      .unique();

    if (!reservation) {
      return { status: "missing" as const };
    }

    if (reservation.status !== "pending") {
      return { status: "already_finalized" as const };
    }

    const usage = await ctx.db
      .query("ttsUsage")
      .withIndex("by_period", (q) => q.eq("period", reservation.period))
      .unique();

    if (usage) {
      await ctx.db.patch(usage._id, {
        reservedCharacters: Math.max(0, usage.reservedCharacters - reservation.characters),
        usedCharacters: consumed
          ? usage.usedCharacters + reservation.characters
          : usage.usedCharacters,
        successfulRequests: consumed
          ? usage.successfulRequests + 1
          : usage.successfulRequests,
        updatedAt: now,
      });
    }

    await ctx.db.patch(reservation._id, {
      status: consumed ? "consumed" : "released",
      updatedAt: now,
    });

    return {
      status: consumed ? ("consumed" as const) : ("released" as const),
    };
  },
});

export const cleanupExpiredReservations = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const expiredReservations = await ctx.db
      .query("ttsReservations")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .collect();

    let released = 0;

    for (const reservation of expiredReservations) {
      if (reservation.status !== "pending") {
        continue;
      }

      const usage = await ctx.db
        .query("ttsUsage")
        .withIndex("by_period", (q) => q.eq("period", reservation.period))
        .unique();

      if (usage) {
        await ctx.db.patch(usage._id, {
          reservedCharacters: Math.max(0, usage.reservedCharacters - reservation.characters),
          updatedAt: now,
        });
      }

      await ctx.db.patch(reservation._id, {
        status: "released",
        updatedAt: now,
      });

      released += 1;
    }

    return { released };
  },
});
