// Per-user eBag connection (SPEC §7.4): OAuth 2.1 authorization code + PKCE against eBag, one dynamically
// registered client per deployment (keyed by its redirect URI), user tokens encrypted in ebag_connections.
// ebag_connections and system_secrets are service-role only, so everything here uses the admin client.
import "server-only";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { discoverAuthorizationServerMetadata, registerClient } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptJson, encryptJson } from "@/lib/crypto/secret";
import { MCP_URL } from "./api";

export const EBAG_ISSUER = "https://ebag.bg";
export const EBAG_RESOURCE = MCP_URL;
export const SCOPE = "shopping";

let metadataCache: Promise<AuthorizationServerMetadata> | null = null;
export function getMetadata(): Promise<AuthorizationServerMetadata> {
  metadataCache ??= discoverAuthorizationServerMetadata(EBAG_ISSUER).then((m) => {
    if (!m) throw new Error("eBag OAuth metadata not found");
    return m;
  });
  metadataCache.catch(() => (metadataCache = null));
  return metadataCache;
}

/** Callback URL: APP_BASE_URL in production; the request's own origin as a fallback (local dev). */
export function redirectUri(requestOrigin: string): string {
  const isLocal = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(u);
  let base = process.env.APP_BASE_URL?.trim() || requestOrigin;
  // "pazarko-app.vercel.app" typed without the scheme: eBag rejects such a redirect URI (2026-11-26).
  if (!/^https?:\/\//.test(base)) base = `https://${base}`;
  if (isLocal(base) && !isLocal(requestOrigin)) base = requestOrigin; // a copied .env.example value on the server
  return `${base.replace(/\/$/, "")}/api/ebag/callback`;
}

/** The OAuth client registered for this deployment's redirect URI (registered on first use). */
export async function getAppClient(admin: SupabaseClient, redirect: string): Promise<OAuthClientInformationMixed> {
  const key = `ebag_app_client:${redirect}`;
  const { data, error } = await admin.from("system_secrets").select("value_encrypted").eq("key", key).maybeSingle();
  if (error) throw new Error(`system_secrets read failed: ${error.message}`);
  if (data) return decryptJson<OAuthClientInformationMixed>(data.value_encrypted);
  const clientMetadata: OAuthClientMetadata = {
    client_name: "Pazarko",
    redirect_uris: [redirect],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: SCOPE,
  };
  const info = await registerClient(EBAG_ISSUER, { metadata: await getMetadata(), clientMetadata, scope: SCOPE });
  const { error: we } = await admin.from("system_secrets").insert({ key, value_encrypted: encryptJson(info) });
  if (we) throw new Error(`system_secrets write failed: ${we.message}`);
  return info;
}

/** What is stored (encrypted) per user. The client info travels with the tokens: refresh needs the same client. */
export interface UserConnection {
  clientInformation: OAuthClientInformationMixed;
  redirect: string;
  tokens: OAuthTokens & { saved_at?: string };
}

export type ConnectionStatus = "connected" | "expired" | "revoked";

export async function getConnectionRow(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("ebag_connections")
    .select("tokens_encrypted, connected_at, last_used_at, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`ebag_connections read failed: ${error.message}`);
  return data as { tokens_encrypted: string; connected_at: string; last_used_at: string | null; status: ConnectionStatus } | null;
}

export async function saveConnection(admin: SupabaseClient, userId: string, conn: UserConnection, fresh = false) {
  const row: Record<string, unknown> = { user_id: userId, tokens_encrypted: encryptJson(conn), status: "connected" };
  if (fresh) row.connected_at = new Date().toISOString();
  else row.last_used_at = new Date().toISOString();
  const { error } = await admin.from("ebag_connections").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(`ebag_connections write failed: ${error.message}`);
}

export async function setConnectionStatus(admin: SupabaseClient, userId: string, status: ConnectionStatus) {
  await admin.from("ebag_connections").update({ status }).eq("user_id", userId);
}

export class EbagReconnectError extends Error {
  constructor() {
    super("eBag connection expired");
  }
}

/** Token store for one user's MCP session; refreshed tokens are written back immediately (they may rotate). */
export class UserTokens implements OAuthClientProvider {
  private admin: SupabaseClient;
  private userId: string;
  private conn: UserConnection;
  constructor(admin: SupabaseClient, userId: string, conn: UserConnection) {
    this.admin = admin;
    this.userId = userId;
    this.conn = conn;
  }
  static async load(admin: SupabaseClient, userId: string): Promise<UserTokens | null> {
    const row = await getConnectionRow(admin, userId);
    if (!row || row.status !== "connected") return null;
    return new UserTokens(admin, userId, decryptJson<UserConnection>(row.tokens_encrypted));
  }
  get redirectUrl() {
    return this.conn.redirect;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.conn.redirect],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: SCOPE,
    };
  }
  clientInformation() {
    return this.conn.clientInformation;
  }
  tokens() {
    return this.conn.tokens;
  }
  async saveTokens(tokens: OAuthTokens) {
    this.conn = { ...this.conn, tokens: { ...tokens, saved_at: new Date().toISOString() } };
    await saveConnection(this.admin, this.userId, this.conn);
  }
  saveCodeVerifier() {}
  codeVerifier(): string {
    throw new EbagReconnectError();
  }
  async redirectToAuthorization(): Promise<void> {
    // The refresh token was rejected: the user has to connect again.
    await setConnectionStatus(this.admin, this.userId, "expired");
    throw new EbagReconnectError();
  }
  async invalidateCredentials() {
    await setConnectionStatus(this.admin, this.userId, "expired");
  }
  /** Marks the connection as used (after a successful cart fill). */
  touch() {
    return saveConnection(this.admin, this.userId, this.conn);
  }
}

/** Best-effort token revocation at eBag (refresh token revokes the grant). */
export async function revokeAtEbag(conn: UserConnection): Promise<void> {
  const meta = await getMetadata();
  const endpoint = (meta as { revocation_endpoint?: string }).revocation_endpoint;
  if (!endpoint) return;
  const token = conn.tokens.refresh_token ?? conn.tokens.access_token;
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token,
      token_type_hint: conn.tokens.refresh_token ? "refresh_token" : "access_token",
      client_id: conn.clientInformation.client_id,
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
