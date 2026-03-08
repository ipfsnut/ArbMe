import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../lib/config.js";
import { CN_BASE_URL } from "../lib/config.js";
import { fetchWithTimeout } from "../lib/fetch.js";

// ── Crosspost state management ──────────────────────────────────────

const STATE_DIR = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "arbme-mcp");
const STATE_FILE = join(STATE_DIR, "crosspost-state.json");

function loadState(): Set<string> {
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    return new Set(data.posted || []);
  } catch {
    return new Set();
  }
}

function saveState(posted: Set<string>): void {
  const ids = [...posted].slice(-500);
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ posted: ids, updated: new Date().toISOString() }),
  );
}

// ── Neynar cast helper ──────────────────────────────────────────────

async function castToFarcaster(
  apiKey: string,
  signerUuid: string,
  text: string,
  embedUrl?: string,
  channelId?: string | null,
): Promise<unknown> {
  const body: Record<string, unknown> = { signer_uuid: signerUuid, text };
  if (embedUrl) body.embeds = [{ url: embedUrl }];
  if (channelId) body.channel_id = channelId;

  const response = await fetchWithTimeout("https://api.neynar.com/v2/farcaster/cast", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Neynar ${response.status}: ${err}`);
  }
  return response.json();
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

function textErr(t: string) {
  return { content: [{ type: "text" as const, text: t }], isError: true as const };
}

// ── Tool registration ───────────────────────────────────────────────

export function registerFarcasterTools(server: McpServer, config: ServerConfig) {
  const tool = server.tool.bind(server) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  // ── farcaster_crosspost ───────────────────────────────────────────
  tool(
    "farcaster_crosspost",
    "Crosspost top Clanker News headlines to Farcaster via Neynar. Tracks already-posted items to avoid duplicates.",
    { max_posts: z.number().int().min(1).max(10).optional(), dry_run: z.boolean().optional() },
    async ({ max_posts, dry_run }: { max_posts?: number; dry_run?: boolean }) => {
      if (!config.neynarApiKey) {
        return textErr("NEYNAR_API_KEY env var is required. Get one at https://neynar.com");
      }
      if (!config.neynarSignerUuid) {
        return textErr("NEYNAR_SIGNER_UUID env var is required (paid Neynar plan).");
      }

      const maxCrosspost = max_posts ?? config.maxCrosspost;
      const isDryRun = dry_run ?? false;

      const feedResponse = await fetchWithTimeout(`${CN_BASE_URL}/?p=1`, {
        headers: { Accept: "application/json" },
      });

      if (!feedResponse.ok) {
        return textErr(`CN feed error: ${feedResponse.status} ${await feedResponse.text()}`);
      }

      const feedData = await feedResponse.json() as {
        posts: Array<{ id: string; title: string; url: string; agent?: { name?: string; id?: string } }>;
      };

      if (!feedData.posts || feedData.posts.length === 0) {
        return text("No posts on CN feed.");
      }

      const posted = loadState();
      let crossposted = 0;
      const lines: string[] = [];

      for (const post of feedData.posts) {
        if (crossposted >= maxCrosspost) break;
        if (posted.has(post.id)) continue;

        const agentName = post.agent?.name || post.agent?.id?.split(":").pop() || "unknown";
        const cnLink = `${CN_BASE_URL}/post/${post.id}`;
        const castText = `${post.title}\n\nby ${agentName} on Clanker News`;

        if (isDryRun) {
          lines.push(`[DRY RUN] Would crosspost: "${post.title.substring(0, 60)}"`);
          posted.add(post.id);
          crossposted++;
          continue;
        }

        try {
          await castToFarcaster(
            config.neynarApiKey,
            config.neynarSignerUuid,
            castText,
            post.url || cnLink,
            config.channelId,
          );
          posted.add(post.id);
          crossposted++;
          lines.push(`Crossposted: "${post.title.substring(0, 60)}"`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          lines.push(`Failed: "${post.title.substring(0, 40)}" — ${msg}`);
          if (msg.includes("429")) {
            lines.push("Rate limited — stopping.");
            break;
          }
        }
      }

      if (!isDryRun) saveState(posted);

      lines.push("", `Crossposted ${crossposted} posts. ${posted.size} total tracked.`);
      return text(lines.join("\n"));
    },
  );

  // ── farcaster_notifications ───────────────────────────────────────
  tool(
    "farcaster_notifications",
    "Read Farcaster notifications and mentions for the configured FID via Neynar.",
    { limit: z.number().int().min(1).max(50).optional(), fid: z.string().optional() },
    async ({ limit, fid }: { limit?: number; fid?: string }) => {
      if (!config.neynarApiKey) {
        return textErr("NEYNAR_API_KEY env var is required. Get one at https://neynar.com");
      }

      const targetFid = fid ?? config.neynarFid;
      if (!targetFid) {
        return textErr("NEYNAR_FID env var (or fid param) is required.");
      }

      const l = limit ?? 20;
      const response = await fetchWithTimeout(
        `https://api.neynar.com/v2/farcaster/notifications?fid=${targetFid}&limit=${l}`,
        { headers: { "x-api-key": config.neynarApiKey } },
      );

      if (response.status === 402) {
        return textErr("Notifications require a paid Neynar plan. See https://neynar.com/#pricing");
      }

      if (!response.ok) {
        return textErr(`Error: ${response.status} ${await response.text()}`);
      }

      const data = await response.json() as {
        notifications: Array<{
          type: string;
          cast?: { author?: { username?: string }; text?: string };
          user?: { username?: string };
          most_recent_timestamp?: string;
        }>;
      };

      if (!data.notifications || data.notifications.length === 0) {
        return text("No notifications.");
      }

      const lines: string[] = [`${data.notifications.length} Farcaster notifications:`, ""];
      for (const n of data.notifications) {
        const type = n.type.toUpperCase();
        const author = n.cast?.author?.username || n.user?.username || "unknown";
        const nText = n.cast?.text?.substring(0, 120) || "";
        const ellipsis = (n.cast?.text?.length || 0) > 120 ? "..." : "";

        lines.push(`[${type}] @${author}`);
        if (nText) lines.push(`  "${nText}${ellipsis}"`);
        if (n.most_recent_timestamp) lines.push(`  ${n.most_recent_timestamp}`);
        lines.push("");
      }

      return text(lines.join("\n"));
    },
  );
}
