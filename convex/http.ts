import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { incrementUsageForChat } from "./chatHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/api/chat/increment-usage",
  method: "POST",
  handler: incrementUsageForChat,
});

export default http;
