import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  CHAT_RATE_MAX_REQUESTS,
  CHAT_RATE_MIN_INTERVAL_SECONDS,
  CHAT_RATE_WINDOW_SECONDS,
  DAILY_MESSAGE_LIMIT,
} from "./constants";
import type { UsageStatus } from "./usageTypes";

export function todayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function pruneRateTimestamps(timestamps: number[], nowMs: number): number[] {
  const cutoff = nowMs - CHAT_RATE_WINDOW_SECONDS * 1000;
  return timestamps.filter((stamp) => stamp > cutoff);
}

export function rateLimitFromTimestamps(
  timestamps: number[],
  nowMs: number,
): UsageStatus["rate"] {
  const pruned = pruneRateTimestamps(timestamps, nowMs);
  let retryAfterSeconds = 0;
  let allowed = true;

  if (pruned.length > 0) {
    const sinceLastMs = nowMs - pruned[pruned.length - 1]!;
    if (sinceLastMs < CHAT_RATE_MIN_INTERVAL_SECONDS * 1000) {
      allowed = false;
      retryAfterSeconds = Math.max(
        1,
        Math.round(CHAT_RATE_MIN_INTERVAL_SECONDS - sinceLastMs / 1000),
      );
    }
  }

  if (pruned.length >= CHAT_RATE_MAX_REQUESTS) {
    allowed = false;
    const windowRetry = Math.max(
      1,
      Math.round(CHAT_RATE_WINDOW_SECONDS - (nowMs - pruned[0]!) / 1000),
    );
    retryAfterSeconds = Math.max(retryAfterSeconds, windowRetry);
  }

  return {
    allowed,
    retryAfterSeconds,
    windowSeconds: CHAT_RATE_WINDOW_SECONDS,
    maxPerWindow: CHAT_RATE_MAX_REQUESTS,
    minIntervalSeconds: CHAT_RATE_MIN_INTERVAL_SECONDS,
    requestsInWindow: pruned.length,
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

export function guestUsageStatus(nowMs = Date.now()): UsageStatus {
  return buildUsageStatus(0, rateLimitFromTimestamps([], nowMs));
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

export async function getRateTimestamps(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<number[]> {
  const row = await ctx.db
    .query("chatRateState")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return row?.timestamps ?? [];
}

export async function computeUsageStatusForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  nowMs = Date.now(),
): Promise<UsageStatus> {
  const used = await getDailyUsageCount(ctx, userId, todayKey(nowMs));
  const timestamps = await getRateTimestamps(ctx, userId);
  const rate = rateLimitFromTimestamps(timestamps, nowMs);
  return buildUsageStatus(used, rate);
}

export async function recordRateHit(
  ctx: MutationCtx,
  userId: Id<"users">,
  nowMs: number,
): Promise<void> {
  const existing = await ctx.db
    .query("chatRateState")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  const pruned = pruneRateTimestamps(existing?.timestamps ?? [], nowMs);
  pruned.push(nowMs);

  if (existing) {
    await ctx.db.patch(existing._id, {
      timestamps: pruned,
      updatedAt: nowMs,
    });
  } else {
    await ctx.db.insert("chatRateState", {
      userId,
      timestamps: pruned,
      updatedAt: nowMs,
    });
  }
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
