/**
 * Browser-safe Convex function references (no bundler).
 * Names match convex/_generated/api paths: `module:exportName`.
 */
const functionName = Symbol.for("functionName");

/** @param {string} name e.g. "users:me" */
function ref(name) {
  return { [functionName]: name };
}

export const api = {
  users: {
    upsertFromAuth: ref("users:upsertFromAuth"),
    me: ref("users:me"),
  },
  usage: {
    status: ref("usage:status"),
    increment: ref("usage:increment"),
  },
};
