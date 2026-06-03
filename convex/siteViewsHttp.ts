import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

export const getSiteViews = httpAction(async (ctx) => {
  try {
    const count = await ctx.runQuery(api.siteViews.get, {});
    return new Response(JSON.stringify({ ok: true, count }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});

export const incrementSiteViews = httpAction(async (ctx) => {
  try {
    const count = await ctx.runMutation(api.siteViews.increment, { incrementBy: 1 });
    return new Response(JSON.stringify({ ok: true, count }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
