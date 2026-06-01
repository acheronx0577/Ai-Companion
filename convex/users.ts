import { v } from "convex/values";
import { query } from "./_generated/server";

/** Phase 0 health check — proves functions deploy. Phase 3 adds users.me / upsertFromAuth. */
export const bootstrapPing = query({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    phase: v.number(),
    project: v.string(),
  }),
  handler: async () => ({
    ok: true,
    phase: 0,
    project: "wakuwaku-companion",
  }),
});
