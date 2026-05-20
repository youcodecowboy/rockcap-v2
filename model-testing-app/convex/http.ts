import { httpRouter } from "convex/server";
import { mcpHandler } from "./mcp";

// Convex HTTP router. Skills layer (Claude Code on operator laptops)
// connects to /mcp here, authenticated by per-user bearer tokens minted
// via the settings UI. See convex/mcp.ts for protocol details and
// convex/mcpTokens.ts for the token lifecycle.

const http = httpRouter();

http.route({
  path: "/mcp",
  method: "POST",
  handler: mcpHandler,
});

// CORS preflight for browser-based MCP clients. Claude Code does not need
// it but other testing clients (curl is fine; a browser-based debugger
// would benefit) might.
http.route({
  path: "/mcp",
  method: "OPTIONS",
  handler: async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  },
});

export default http;
