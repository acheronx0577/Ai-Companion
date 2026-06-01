import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { DAILY_MESSAGE_LIMIT } from "./constants";
import { getAuthUserIdOrNull, syncUserFromAuth } from "./userSync";
import {
  computeUsageStatusForUser,
  guestUsageStatus,
  incrementDailyUsage,
  todayKey,
} from "./usageLogic";
import { usageStatusValidator } from "./usageTypes";

/** Read-only usage (no increment). Guests get full trial allowance (IP limits stay on Flask). */
export const status = query({
  args: {},
  returns: usageStatusValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserIdOrNull(ctx);
    if (userId === null) {
      return guestUsageStatus();
    }
    return await computeUsageStatusForUser(ctx, userId);
  },
});

/** Increment daily message count when allowed. Returns current status when blocked. */
export const increment = mutation({
  args: {},
  returns: usageStatusValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    await syncUserFromAuth(ctx, userId);
    const nowMs = Date.now();
    const before = await computeUsageStatusForUser(ctx, userId, nowMs);
    if (!before.canSend) {
      return before;
    }

    const date = todayKey(nowMs);
    await incrementDailyUsage(ctx, userId, date, nowMs);
    return await computeUsageStatusForUser(ctx, userId, nowMs);
  },
});

/** Phase 4 test helper — daily cap math without auth (used: 10 → not allowed). */
export const checkDailyLimit = query({
  args: { used: v.number() },
  returns: v.object({
    limit: v.number(),
    used: v.number(),
    remaining: v.number(),
    allowed: v.boolean(),
  }),
  handler: async (_ctx, { used }) => {
    const safeUsed = Math.max(0, Math.floor(used));
    const remaining = Math.max(0, DAILY_MESSAGE_LIMIT - safeUsed);
    return {
      limit: DAILY_MESSAGE_LIMIT,
      used: safeUsed,
      remaining,
      allowed: remaining > 0,
    };
  },
});
