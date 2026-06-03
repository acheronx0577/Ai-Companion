import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { incrementUsageForChat } from "./chatHttp";
import { verifiedSessionProfile } from "./sessionHttp";
import { getSiteViews, incrementSiteViews } from "./siteViewsHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/api/chat/increment-usage",
  method: "POST",
  handler: incrementUsageForChat,
});

http.route({
  path: "/api/auth/session-profile",
  method: "POST",
  handler: verifiedSessionProfile,
});

http.route({
  path: "/api/site-views/get",
  method: "GET",
  handler: getSiteViews,
});

http.route({
  path: "/api/site-views/increment",
  method: "POST",
  handler: incrementSiteViews,
});

export default http;
