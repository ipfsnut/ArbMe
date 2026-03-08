import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../lib/config.js";
import { CN_BASE_URL, CHAIN_ID, REGISTRY, AGENT_ID } from "../lib/config.js";
import { createAuthHeader, postWithPayment } from "../lib/auth.js";
import { fetchWithTimeout, safeJson } from "../lib/fetch.js";

function requireAgentKey(config: ServerConfig) {
  if (!config.agentKey) {
    throw new Error(
      "CN_AGENT_PRIVATE_KEY env var is required for this tool. Set it and restart the server.",
    );
  }
  return config.agentKey;
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

function textErr(t: string) {
  return { content: [{ type: "text" as const, text: t }], isError: true as const };
}

export function registerClankerNewsTools(server: McpServer, config: ServerConfig) {
  const tool = server.tool.bind(server) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  // ── clanker_news_feed ─────────────────────────────────────────────
  tool(
    "clanker_news_feed",
    "Fetch the Clanker News front page. Returns top posts with titles, URLs, vote counts, and agent info.",
    { page: z.number().int().positive().optional(), limit: z.number().int().min(1).max(50).optional() },
    async ({ page, limit }: { page?: number; limit?: number }) => {
      const p = page ?? 1;
      const l = limit ?? 15;

      const response = await fetchWithTimeout(`${CN_BASE_URL}/?p=${p}`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        return text(`CN feed error: ${response.status} ${await response.text()}`);
      }

      const data = await safeJson<{ posts: Array<{ id: string; title: string; url: string; votes: number; agent: { name?: string; id: string } }> }>(response);
      if (!data?.posts) return textErr("Failed to parse CN feed response");
      const posts = data.posts.slice(0, l);

      const lines: string[] = [];
      for (const post of posts) {
        let domain = "";
        try { domain = new URL(post.url).hostname.replace("www.", ""); } catch { domain = ""; }
        const agentName = post.agent?.name || post.agent?.id?.split(":").pop() || "unknown";
        lines.push(
          `${post.votes}▲ ${post.title}`,
          `   (${domain}) by ${agentName}`,
          `   ${CN_BASE_URL}/post/${post.id}`,
          "",
        );
      }

      return text(lines.join("\n") || "No posts found.");
    },
  );

  // ── clanker_news_post ─────────────────────────────────────────────
  tool(
    "clanker_news_post",
    "Submit a new post to Clanker News. Requires auth and USDC payment (auto-handled via x402).",
    { title: z.string().min(1), url: z.string().url(), comment: z.string().min(1) },
    async ({ title, url, comment }: { title: string; url: string; comment: string }) => {
      const account = requireAgentKey(config);
      const body = JSON.stringify({ url, title, comment });
      const response = await postWithPayment(account, "submit", body);
      const result = await safeJson<{ id?: string; error?: string }>(response);

      if (response.status === 201 && result?.id) {
        return text(`Post submitted! ${CN_BASE_URL}/post/${result.id}`);
      }
      return textErr(`Error (${response.status}): ${JSON.stringify(result)}`);
    },
  );

  // ── clanker_news_comment ──────────────────────────────────────────
  tool(
    "clanker_news_comment",
    "Post a comment on a Clanker News post. Requires auth and USDC payment (auto-handled via x402).",
    { post_id: z.string().min(1), text: z.string().min(1) },
    async ({ post_id, text: commentText }: { post_id: string; text: string }) => {
      const account = requireAgentKey(config);
      const body = JSON.stringify({ post_id, text: commentText });
      const response = await postWithPayment(account, "comment/agent", body);
      const result = await safeJson<{ error?: string }>(response);

      if (response.status === 201) {
        return text(`Comment posted! ${CN_BASE_URL}/post/${post_id}`);
      }
      return textErr(`Error (${response.status}): ${JSON.stringify(result)}`);
    },
  );

  // ── clanker_news_check_replies ────────────────────────────────────
  tool(
    "clanker_news_check_replies",
    "Check replies and conversations for the agent on Clanker News. Optionally filter by timestamp.",
    { since: z.string().optional() },
    async ({ since }: { since?: string }) => {
      const account = requireAgentKey(config);

      const agentPath = `/agent/eip155:${CHAIN_ID}:${REGISTRY.toLowerCase()}:${AGENT_ID}/conversations`;
      const url = since
        ? `${CN_BASE_URL}${agentPath}?since=${encodeURIComponent(since)}`
        : `${CN_BASE_URL}${agentPath}`;

      const authHeader = await createAuthHeader(account, "GET", agentPath, "");

      const response = await fetchWithTimeout(url, {
        headers: { Accept: "application/json", Authorization: authHeader },
      });

      if (!response.ok) {
        return textErr(`Error: ${response.status} ${await response.text()}`);
      }

      const data = await safeJson<{
        comments: Array<{
          post_id: string; post_title: string; author_name: string;
          author_type: string; text: string; created_at: string;
        }>;
      }>(response);

      if (!data?.comments || data.comments.length === 0) {
        return text("No new replies.");
      }

      const lines: string[] = [`${data.comments.length} new replies:`, ""];
      for (const c of data.comments) {
        const snippet = c.text.length > 100 ? c.text.substring(0, 100) + "..." : c.text;
        lines.push(
          `Reply on "${c.post_title}"`,
          `  From: ${c.author_name} (${c.author_type})`,
          `  "${snippet}"`,
          `  ${CN_BASE_URL}/post/${c.post_id}`,
          `  ${c.created_at}`,
          "",
        );
      }

      lines.push("---", `Next check: since="${data.comments[0].created_at}"`);

      return text(lines.join("\n"));
    },
  );
}
