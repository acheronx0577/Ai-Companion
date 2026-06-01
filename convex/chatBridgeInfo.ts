import { v } from "convex/values";
import { query } from "./_generated/server";

/** Phase 6 — Flask `/chat` + Convex HTTP usage bridge. */
export const phase6Status = query({
  args: {},
  returns: v.object({
    phase: v.number(),
    httpRoutes: v.array(v.string()),
    flaskFlags: v.array(v.string()),
  }),
  handler: async () => ({
    phase: 6,
    httpRoutes: ["POST /api/chat/increment-usage"],
    flaskFlags: ["USE_CONVEX_USAGE", "CONVEX_SITE_URL"],
  }),
});
