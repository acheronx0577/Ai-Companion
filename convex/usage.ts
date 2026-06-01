import { v } from "convex/values";
import { query } from "./_generated/server";

/** Phase 4 preview — mirrors DAILY_MESSAGE_LIMIT from usage_limit.py until usage.increment ships. */
export const limitsPreview = query({
  args: {},
  returns: v.object({
    dailyLimit: v.number(),
    note: v.string(),
  }),
  handler: async () => ({
    dailyLimit: 10,
    note: "Phase 4 will enforce limits in Convex mutations",
  }),
});
