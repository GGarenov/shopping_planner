// eBag MCP client: connect with an OAuth token store, call tools with eBag's rate limits and retries.
// Shared by the scripts (local login, daily sync) and later the app (cart). No "server-only": scripts import it.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const MCP_URL = "https://ebag.bg/mcp";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CallOptions {
  /** Pause between calls; eBag rate-limits at roughly 3–4 calls/s. */
  delayMs?: number;
  retries?: number;
}

export class EbagApi {
  calls = 0;
  private client: Client;
  private opts: CallOptions;
  constructor(client: Client, opts: CallOptions = {}) {
    this.client = client;
    this.opts = opts;
  }

  async call<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T> {
    const retries = this.opts.retries ?? 8;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (this.calls++) await sleep(this.opts.delayMs ?? 600);
        const res = await this.client.callTool({ name, arguments: args });
        const content = (res.content ?? []) as { type: string; text?: string }[];
        if (res.isError) throw new Error(`${name} error: ${content.map((c) => c.text).join(" ")}`);
        let data = res.structuredContent as Record<string, unknown> | undefined;
        if (!data) {
          const text = content.find((c) => c.type === "text")?.text;
          data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        }
        return (data.result ?? data) as T;
      } catch (err) {
        lastErr = err;
        if (attempt >= retries) break;
        // eBag rate limit: 429 with "Expected available in N seconds" -> wait that long (+1 s).
        const msg = String((err as Error)?.message);
        const m = msg.match(/available in (\d+) seconds?/i);
        const code = (err as { code?: number })?.code;
        await sleep(m ? (Number(m[1]) + 1) * 1000 : code === 429 ? 10_000 : 1000 * 2 ** attempt);
      }
    }
    throw lastErr;
  }

  close() {
    return this.client.close();
  }
}

/** Connects using stored tokens (refreshing them through the provider when needed). Never opens a browser. */
export async function connectEbag(provider: OAuthClientProvider, opts: CallOptions = {}): Promise<EbagApi> {
  const client = new Client({ name: "shopping-planner", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider }));
  return new EbagApi(client, opts);
}
