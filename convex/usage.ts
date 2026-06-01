import { v } from "convex/values";
import { query } from "./_generated/server";
import { DAILY_MESSAGE_LIMIT } from "./constants";

/** Phase 4 preview — daily cap from shared constants (usage_limit.py parity). */
export const limitsPreview = query({
  args: {},
  returns: v.object({
    dailyLimit: v.number(),
    note: v.string(),
  }),
  handler: async () => ({
    dailyLimit: DAILY_MESSAGE_LIMIT,
    note: "Phase 4 will enforce limits in Convex mutations",
  }),
});
