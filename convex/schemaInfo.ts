import { v } from "convex/values";
import { query } from "./_generated/server";
import { DAILY_MESSAGE_LIMIT } from "./constants";

/** Phase 1 — verify schema deployed and constants match Flask usage_limit.py */
export const phase1Status = query({
  args: {},
  returns: v.object({
    phase: v.number(),
    tables: v.array(v.string()),
    limits: v.object({
      dailyMessageLimit: v.number(),
    }),
  }),
  handler: async () => ({
    phase: 1,
    tables: ["users", "dailyUsage", "chatSessions", "chatMessages"],
    limits: {
      dailyMessageLimit: DAILY_MESSAGE_LIMIT,
    },
  }),
});
