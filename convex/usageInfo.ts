import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  CHAT_RATE_MAX_REQUESTS,
  CHAT_RATE_MIN_INTERVAL_SECONDS,
  CHAT_RATE_WINDOW_SECONDS,
  DAILY_MESSAGE_LIMIT,
} from "./constants";

/** Phase 4 — usage limits deployed (no login required). */
export const phase4Status = query({
  args: {},
  returns: v.object({
    phase: v.number(),
    functions: v.array(v.string()),
    tables: v.array(v.string()),
    limits: v.object({
      dailyMessageLimit: v.number(),
      chatRateMaxRequests: v.number(),
      chatRateWindowSeconds: v.number(),
      chatRateMinIntervalSeconds: v.number(),
    }),
    flaskFlag: v.string(),
  }),
  handler: async () => ({
    phase: 4,
    functions: ["usage.status", "usage.increment", "usage.checkDailyLimit"],
    tables: ["dailyUsage", "chatRateState"],
    limits: {
      dailyMessageLimit: DAILY_MESSAGE_LIMIT,
      chatRateMaxRequests: CHAT_RATE_MAX_REQUESTS,
      chatRateWindowSeconds: CHAT_RATE_WINDOW_SECONDS,
      chatRateMinIntervalSeconds: CHAT_RATE_MIN_INTERVAL_SECONDS,
    },
    flaskFlag: "USE_CONVEX_USAGE",
  }),
});
