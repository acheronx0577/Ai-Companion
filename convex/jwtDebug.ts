import { v } from "convex/values";
import { query } from "./_generated/server";
import { importPKCS8 } from "jose";

declare const process: { env: Record<string, string | undefined> };

/**
 * Verification helper to test whether the JWT private key environment variable
 * is set and syntactically valid (can be imported by `jose` / Web Crypto).
 */
export const testJwtKey = query({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    valid: v.boolean(),
    error: v.optional(v.string()),
    keyLength: v.optional(v.number()),
  }),
  handler: async () => {
    const key = process.env.JWT_PRIVATE_KEY;
    if (!key) {
      return {
        configured: false,
        valid: false,
        error: "JWT_PRIVATE_KEY environment variable is not set.",
      };
    }

    try {
      // Standard PEM keys contain spaces instead of newlines when stored in Convex env.
      // importPKCS8 will handle both single-line and multiline PEM structures.
      await importPKCS8(key.trim(), "RS256");
      return {
        configured: true,
        valid: true,
        keyLength: key.length,
      };
    } catch (err: any) {
      return {
        configured: true,
        valid: false,
        error: err.message || String(err),
      };
    }
  },
});
