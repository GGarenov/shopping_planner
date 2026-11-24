// The owner's eBag OAuth state (client registration + tokens) for the daily sync, stored encrypted in
// system_secrets. eBag may rotate the refresh token on every refresh, so new tokens are written back immediately —
// GitHub secrets can't be updated from a job (SPEC §7.3). Service role only.
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptJson, encryptJson } from "../crypto/secret.ts";

export const OWNER_TOKENS_KEY = "ebag_owner_oauth";

export interface OAuthStore {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens & { saved_at?: string };
  codeVerifier?: string;
}

export async function readOwnerStore(db: SupabaseClient): Promise<OAuthStore | null> {
  const { data, error } = await db.from("system_secrets").select("value_encrypted").eq("key", OWNER_TOKENS_KEY).maybeSingle();
  if (error) throw new Error(`system_secrets read failed: ${error.message}`);
  return data ? decryptJson<OAuthStore>(data.value_encrypted) : null;
}

export async function writeOwnerStore(db: SupabaseClient, store: OAuthStore): Promise<void> {
  const { error } = await db
    .from("system_secrets")
    .upsert({ key: OWNER_TOKENS_KEY, value_encrypted: encryptJson(store) }, { onConflict: "key" });
  if (error) throw new Error(`system_secrets write failed: ${error.message}`);
}

/** Non-interactive provider: refreshes with the stored refresh token; if that is gone, the owner must log in again. */
export class SupabaseOwnerTokens implements OAuthClientProvider {
  private db: SupabaseClient;
  private store: OAuthStore;
  private constructor(db: SupabaseClient, store: OAuthStore) {
    this.db = db;
    this.store = store;
  }

  static async load(db: SupabaseClient): Promise<SupabaseOwnerTokens> {
    const store = await readOwnerStore(db);
    if (!store?.tokens?.refresh_token)
      throw new Error("No eBag tokens in system_secrets. Run locally: npm run ebag:login && npm run ebag:bootstrap");
    return new SupabaseOwnerTokens(db, store);
  }

  get redirectUrl() {
    return (
      (this.store.clientInformation as { redirect_uris?: string[] } | undefined)?.redirect_uris?.[0] ?? "http://127.0.0.1:53682/callback"
    );
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Shopping Planner price sync",
      redirect_uris: [String(this.redirectUrl)],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "shopping",
    };
  }
  clientInformation() {
    return this.store.clientInformation;
  }
  async saveClientInformation(info: OAuthClientInformationMixed) {
    this.store.clientInformation = info;
    await writeOwnerStore(this.db, this.store);
  }
  tokens() {
    return this.store.tokens;
  }
  async saveTokens(tokens: OAuthTokens) {
    this.store.tokens = { ...tokens, saved_at: new Date().toISOString() };
    await writeOwnerStore(this.db, this.store); // must not be lost: the old refresh token may be dead now
  }
  saveCodeVerifier(v: string) {
    this.store.codeVerifier = v;
  }
  codeVerifier() {
    if (!this.store.codeVerifier) throw new Error("no code verifier");
    return this.store.codeVerifier;
  }
  redirectToAuthorization(): never {
    throw new Error("eBag login required (refresh token rejected). Run locally: npm run ebag:login && npm run ebag:bootstrap");
  }
}
