import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./lib/config.js";
import { registerClankerNewsTools } from "./tools/clanker-news.js";
import { registerFarcasterTools } from "./tools/farcaster.js";
import { registerDefiTools } from "./tools/defi.js";

const config = loadConfig();

const server = new McpServer({
  name: "arbme",
  version: "1.0.0",
});

registerClankerNewsTools(server, config);
registerFarcasterTools(server, config);
registerDefiTools(server, config);

const transport = new StdioServerTransport();
await server.connect(transport);
