/**
 * Headless Convex Auth + usage bridge for vanilla app.js.
 * Bundled locally by scripts/build_frontend.mjs.
 */
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient, useMutation, useQuery } from "convex/react";
import {
  ConvexAuthProvider,
  useAuthActions,
  useAuthToken,
  useConvexAuth,
} from "@convex-dev/auth/react";
import { api } from "../static/convex_client_api.js";

const listeners = new Set();
const actionsRef = { current: null };
const tokenRef = { current: null };
let ready = false;

const snapshot = {
  loading: true,
  profileLoading: false,
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
      // Ignore subscriber errors.
    }
  }
}

async function authorizedFetch(input, init = {}) {
  const url = new URL(input, window.location.origin);
  if (url.origin !== window.location.origin) {
    throw new Error("Authenticated requests must stay on this origin");
  }
  const headers = new Headers(init.headers || {});
  const token = tokenRef.current;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${url.pathname}${url.search}`, { ...init, headers });
}

function BridgeInner() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const authToken = useAuthToken();
  const profile = useQuery(api.users.me);
  const usage = useQuery(api.usage.status);
  const siteViews = useQuery(api.siteViews.get);
  const upsert = useMutation(api.users.upsertFromAuth);

  useEffect(() => {
    actionsRef.current = { signIn, signOut, upsert };
  }, [signIn, signOut, upsert]);

  useEffect(() => {
    tokenRef.current = authToken;
  }, [authToken]);

  useEffect(() => {
    if (!isAuthenticated || isLoading || profile === undefined || profile !== null) {
      return;
    }
    let cancelled = false;
    const attemptUpsert = async (attempt) => {
      if (cancelled) {
        return;
      }
      try {
        await upsert({});
      } catch (_error) {
        if (!cancelled && attempt < 3) {
          window.setTimeout(() => {
            void attemptUpsert(attempt + 1);
          }, 800 * attempt);
        }
      }
    };
    void attemptUpsert(1);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, profile, upsert]);

  useEffect(() => {
    snapshot.loading = isLoading;
    snapshot.profileLoading = Boolean(
      isAuthenticated && (isLoading || profile === undefined),
    );
    snapshot.authenticated = Boolean(isAuthenticated);
    snapshot.convexConfigured = true;
    snapshot.user = isAuthenticated ? profileToUser(profile) : null;
    snapshot.usage = usage ?? null;
    snapshot.siteViews = siteViews ?? null;
    notify();
  }, [isLoading, isAuthenticated, profile, usage, siteViews]);

  return null;
}

function initWakuConvexBridge(convexUrl) {
  if (!convexUrl || ready) {
    return;
  }
  const host = document.getElementById("convex-bridge-root");
  if (!host) {
    return;
  }

  const client = new ConvexReactClient(convexUrl);
  snapshot.convexConfigured = true;
  snapshot.loading = true;
  createRoot(host).render(
    React.createElement(
      ConvexAuthProvider,
      { client },
      React.createElement(BridgeInner),
    ),
  );

  ready = true;
  window.WakuConvex = {
    isReady: () => ready,
    getSnapshot: () => ({ ...snapshot }),
    authorizedFetch,
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
      const actions = actionsRef.current;
      if (actions?.signOut) {
        await actions.signOut();
      }
      try {
        await fetch("/auth/logout", { method: "POST" });
      } catch (_error) {
        // Ignore local logout errors after the Convex session is gone.
      }
    },
    async syncFlaskSession() {
      if (!tokenRef.current) {
        throw new Error("Convex Auth token is not ready");
      }
      const response = await authorizedFetch("/auth/convex-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        throw new Error(`Flask session sync failed (${response.status})`);
      }
    },
    async refresh() {
      const actions = actionsRef.current;
      if (snapshot.authenticated && actions?.upsert) {
        try {
          await actions.upsert({});
        } catch (_error) {
          // The next Convex subscription update can retry.
        }
      }
    },
  };
  window.dispatchEvent(new CustomEvent("waku-convex-ready"));
}

const host = document.getElementById("convex-bridge-root");
if (host?.dataset.convexEnabled === "true" && host.dataset.convexUrl) {
  initWakuConvexBridge(host.dataset.convexUrl);
}
