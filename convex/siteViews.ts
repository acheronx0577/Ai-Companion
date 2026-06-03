import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const record = await ctx.db
      .query("siteViews")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    return record ? record.count : 0;
  },
});

export const increment = mutation({
  args: { incrementBy: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const bump = args.incrementBy ?? 1;
    const record = await ctx.db
      .query("siteViews")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    if (record) {
      const newCount = record.count + bump;
      await ctx.db.patch(record._id, { count: newCount });
      return newCount;
    } else {
      await ctx.db.insert("siteViews", { key: "global", count: bump });
      return bump;
    }
  },
});
