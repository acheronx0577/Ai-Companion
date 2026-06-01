import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { DAILY_MESSAGE_LIMIT } from "./constants";
import type { UsageStatus } from "./usageTypes";

export function todayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Per-message rate limits disabled; daily cap only. */
export function rateLimitFromTimestamps(): UsageStatus["rate"] {
  return {
    allowed: true,
    retryAfterSeconds: 0,
    windowSeconds: 0,
    maxPerWindow: 0,
    minIntervalSeconds: 0,
    requestsInWindow: 0,
  };
}

export function buildUsageStatus(used: number, rate: UsageStatus["rate"]): UsageStatus {
  const remaining = Math.max(0, DAILY_MESSAGE_LIMIT - used);
  const dailyAllowed = remaining > 0;
  return {
    limit: DAILY_MESSAGE_LIMIT,
    used,
    remaining,
    allowed: dailyAllowed,
    rate,
    canSend: dailyAllowed && rate.allowed,
  };
}

export function guestUsageStatus(): UsageStatus {
  return buildUsageStatus(0, rateLimitFromTimestamps());
}

export async function getDailyUsageCount(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  date: string,
): Promise<number> {
  const row = await ctx.db
    .query("dailyUsage")
    .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
    .unique();
  return row?.messageCount ?? 0;
}

export async function computeUsageStatusForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  nowMs = Date.now(),
): Promise<UsageStatus> {
  const used = await getDailyUsageCount(ctx, userId, todayKey(nowMs));
  return buildUsageStatus(used, rateLimitFromTimestamps());
}

export async function incrementDailyUsage(
  ctx: MutationCtx,
  userId: Id<"users">,
  date: string,
  nowMs: number,
): Promise<number> {
  const existing = await ctx.db
    .query("dailyUsage")
    .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
    .unique();

  if (existing) {
    const next = existing.messageCount + 1;
    await ctx.db.patch(existing._id, {
      messageCount: next,
      updatedAt: nowMs,
    });
    return next;
  }

  await ctx.db.insert("dailyUsage", {
    userId,
    date,
    messageCount: 1,
    updatedAt: nowMs,
  });
  return 1;
}
