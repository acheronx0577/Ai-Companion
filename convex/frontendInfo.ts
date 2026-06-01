import { v } from "convex/values";
import { query } from "./_generated/server";

/** Phase 5 — main app reads auth + usage from Convex (Flask session bridge for /chat). */
export const phase5Status = query({
  args: {},
  returns: v.object({
    phase: v.number(),
    functions: v.array(v.string()),
    flaskFlags: v.array(v.string()),
    bridgeRoute: v.string(),
  }),
  handler: async () => ({
    phase: 5,
    functions: ["users.me", "users.upsertFromAuth", "usage.status", "usage.increment"],
    flaskFlags: ["USE_CONVEX_FRONTEND", "USE_CONVEX_USAGE"],
    bridgeRoute: "POST /auth/convex-bridge",
  }),
});
