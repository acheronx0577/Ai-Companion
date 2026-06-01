import { v } from "convex/values";
import { query } from "./_generated/server";
import { DAILY_MESSAGE_LIMIT } from "./constants";

/** Phase 4 — usage limits deployed (no login required). */
export const phase4Status = query({
  args: {},
  returns: v.object({
    phase: v.number(),
    functions: v.array(v.string()),
    tables: v.array(v.string()),
    limits: v.object({
      dailyMessageLimit: v.number(),
    }),
    flaskFlag: v.string(),
  }),
  handler: async () => ({
    phase: 4,
    functions: ["usage.status", "usage.increment", "usage.checkDailyLimit"],
    tables: ["dailyUsage", "chatRateState"],
    limits: {
      dailyMessageLimit: DAILY_MESSAGE_LIMIT,
    },
    flaskFlag: "USE_CONVEX_USAGE",
  }),
});
