import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * Phase 6 — Flask `/chat` calls this with the user's Convex Auth JWT.
 * Runs the same logic as `usage.increment` (daily message cap).
 */
export const incrementUsageForChat = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const usage = await ctx.runMutation(api.usage.increment, {});
    return new Response(JSON.stringify({ ok: true, usage }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("Not authenticated") ? 401 : 400;
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
});
