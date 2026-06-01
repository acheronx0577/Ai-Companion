/**
 * Headless Convex Auth + usage bridge for vanilla app.js (Phase 5).
 */
import React, { useEffect } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { ConvexReactClient, useMutation, useQuery } from "https://esm.sh/convex@1.39.1/react?deps=react@18.3.1";
import {
  ConvexAuthProvider,
  useAuthActions,
  useAuthToken,
  useConvexAuth,
} from "https://esm.sh/@convex-dev/auth@0.0.92/react?deps=react@18.3.1,convex@1.39.1";
import { api } from "./convex_client_api.js";

const listeners = new Set();
const actionsRef = { current: null };
const tokenRef = { current: null };
let ready = false;
let client = null;

const snapshot = {
  loading: true,
  authenticated: false,
  convexConfigured: false,
  user: null,
  usage: null,
};

function profileToUser(profile) {
  if (!profile) {
    return null;
  }
  return {
    id: profile.googleSub || String(profile.userId),
    email: profile.email || "",
    name: profile.name || profile.email || "Google user",
    picture: profile.picture || "",
  };
}

function notify() {
  for (const listener of listeners) {
    try {
      listener({ ...snapshot });
    } catch (_error) {
      // ignore subscriber errors
    }
  }
}

function BridgeInner() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const authToken = useAuthToken();
  const profile = useQuery(api.users.me);
  const usage = useQuery(api.usage.status);
  const upsert = useMutation(api.users.upsertFromAuth);
  const increment = useMutation(api.usage.increment);
  useEffect(() => {
    actionsRef.current = { signIn, signOut, increment, upsert };
  }, [signIn, signOut, increment, upsert]);

  useEffect(() => {
    tokenRef.current = authToken;
  }, [authToken]);

  useEffect(() => {
    if (!isAuthenticated || isLoading || profile !== null) {
      return;
    }
    void upsert({}).catch(() => {});
  }, [isAuthenticated, isLoading, profile, upsert]);

  useEffect(() => {
    snapshot.loading = isLoading;
    snapshot.authenticated = Boolean(isAuthenticated);
    snapshot.convexConfigured = true;
    snapshot.user = isAuthenticated ? profileToUser(profile) : null;
    snapshot.usage = usage ?? null;
    notify();
  }, [isLoading, isAuthenticated, profile, usage]);

  return null;
}

export async function initWakuConvexBridge(convexUrl) {
  if (!convexUrl || ready) {
    return;
  }

  const host = document.getElementById("convex-bridge-root");
  if (!host) {
    return;
  }

  client = new ConvexReactClient(convexUrl);
  snapshot.convexConfigured = true;
  snapshot.loading = true;

  const root = createRoot(host);
  root.render(
    React.createElement(
      ConvexAuthProvider,
      { client },
      React.createElement(BridgeInner),
    ),
  );

  ready = true;
  window.dispatchEvent(new CustomEvent("waku-convex-ready"));

  window.WakuConvex = {
    isReady: () => ready,
    getAuthToken: () => tokenRef.current,
    getSnapshot: () => ({ ...snapshot }),
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...snapshot });
      return () => listeners.delete(listener);
    },
    async signInGoogle() {
      const actions = actionsRef.current;
      if (!actions?.signIn) {
        throw new Error("Convex Auth is not ready");
      }
      await actions.signIn("google", { redirectTo: window.location.href });
    },
    async signOut() {
      const actions = actionsRef?.current;
      if (actions?.signOut) {
        await actions.signOut();
      }
      try {
        await fetch("/auth/logout", { method: "POST" });
      } catch (_error) {
        // ignore
      }
    },
    async syncFlaskSession() {
      const user = snapshot.user;
      if (!user?.id) {
        return;
      }
      await fetch("/auth/convex-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleSub: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
        }),
      });
    },
    async incrementUsage() {
      const actions = actionsRef?.current;
      if (!actions?.increment) {
        return null;
      }
      return await actions.increment({});
    },
    async refresh() {
      const actions = actionsRef?.current;
      if (snapshot.authenticated && actions?.upsert) {
        try {
          await actions.upsert({});
        } catch (_error) {
          // ignore
        }
      }
    },
  };
}
