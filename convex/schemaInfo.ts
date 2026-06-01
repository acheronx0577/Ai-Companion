import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  CHAT_RATE_MAX_REQUESTS,
  CHAT_RATE_MIN_INTERVAL_SECONDS,
  CHAT_RATE_WINDOW_SECONDS,
  DAILY_MESSAGE_LIMIT,
} from "./constants";

/** Phase 1 — verify schema deployed and constants match Flask usage_limit.py */
export const phase1Status = query({
  args: {},
  returns: v.object({
    phase: v.number(),
    tables: v.array(v.string()),
    limits: v.object({
      dailyMessageLimit: v.number(),
      chatRateMaxRequests: v.number(),
      chatRateWindowSeconds: v.number(),
      chatRateMinIntervalSeconds: v.number(),
    }),
  }),
  handler: async () => ({
    phase: 1,
    tables: ["users", "dailyUsage", "chatSessions", "chatMessages"],
    limits: {
      dailyMessageLimit: DAILY_MESSAGE_LIMIT,
      chatRateMaxRequests: CHAT_RATE_MAX_REQUESTS,
      chatRateWindowSeconds: CHAT_RATE_WINDOW_SECONDS,
      chatRateMinIntervalSeconds: CHAT_RATE_MIN_INTERVAL_SECONDS,
    },
  }),
});
