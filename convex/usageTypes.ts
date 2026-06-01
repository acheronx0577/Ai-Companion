import { v } from "convex/values";

/** Matches Flask `usage_status_for_current_request()` JSON shape. */
export const usageStatusValidator = v.object({
  limit: v.number(),
  used: v.number(),
  remaining: v.number(),
  allowed: v.boolean(),
  rate: v.object({
    allowed: v.boolean(),
    retryAfterSeconds: v.number(),
    windowSeconds: v.number(),
    maxPerWindow: v.number(),
    minIntervalSeconds: v.number(),
    requestsInWindow: v.number(),
  }),
  canSend: v.boolean(),
});

export type UsageStatus = {
  limit: number;
  used: number;
  remaining: number;
  allowed: boolean;
  rate: {
    allowed: boolean;
    retryAfterSeconds: number;
    windowSeconds: number;
    maxPerWindow: number;
    minIntervalSeconds: number;
    requestsInWindow: number;
  };
  canSend: boolean;
};
