import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Phase 1 data model — see ARCHITECTURE.md §2.
 * Rate limiting uses constants + mutation logic (Phase 4), not rateLimitEvents table.
 */
export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    googleSub: v.string(),
    email: v.string(),
    name: v.string(),
    picture: v.optional(v.string()),
    createdAt: v.number(),
    lastLoginAt: v.number(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_googleSub", ["googleSub"]),

  dailyUsage: defineTable({
    userId: v.id("users"),
    date: v.string(),
    messageCount: v.number(),
    updatedAt: v.number(),
  }).index("by_user_date", ["userId", "date"]),

  /** Phase 4b — optional server-side chat history */
  chatSessions: defineTable({
    userId: v.id("users"),
    clientSessionId: v.string(),
    language: v.string(),
    updatedAt: v.number(),
  }).index("by_user_client", ["userId", "clientSessionId"]),

  chatMessages: defineTable({
    sessionId: v.id("chatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId", "createdAt"]),
});
