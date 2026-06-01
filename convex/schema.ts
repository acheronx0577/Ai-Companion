import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Phase 1+2: Convex Auth tables + app tables.
 * Custom `users` extends auth defaults — see https://labs.convex.dev/auth/setup/schema
 */
export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    googleSub: v.optional(v.string()),
    picture: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_googleSub", ["googleSub"]),

  dailyUsage: defineTable({
    userId: v.id("users"),
    date: v.string(),
    messageCount: v.number(),
    updatedAt: v.number(),
  }).index("by_user_date", ["userId", "date"]),

  /** Sliding-window chat rate limits per user (Phase 4). */
  chatRateState: defineTable({
    userId: v.id("users"),
    timestamps: v.array(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

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
