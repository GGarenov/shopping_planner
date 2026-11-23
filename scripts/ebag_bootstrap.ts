// One-off: moves the owner's eBag sign-in from .secrets/ebag_oauth.json into Supabase (system_secrets, encrypted
// with EBAG_TOKEN_KEY) so the daily sync in GitHub Actions can use it.
//   npm run ebag:login        (if needed: signs in, writes .secrets/ebag_oauth.json)
//   npm run ebag:bootstrap
// eBag may rotate the refresh token on every refresh, so one token must have one holder: after a successful
// transfer the tokens are removed from the local file (the client registration stays). Local tools that need
// eBag afterwards (npm run cart) sign in again with `npm run ebag:login` — a separate grant.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { connectEbag } from "../lib/ebag/api.ts";
import { SupabaseOwnerTokens, writeOwnerStore, type OAuthStore } from "../lib/ebag/ownerTokens.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, ".secrets", "ebag_oauth.json");

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
if (!process.env.EBAG_TOKEN_KEY) throw new Error("Set EBAG_TOKEN_KEY (32 bytes, base64) — the same value as in GitHub secrets");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const store = JSON.parse(fs.readFileSync(FILE, "utf8")) as OAuthStore;
if (!store.tokens?.refresh_token || !store.clientInformation) throw new Error(`${FILE} has no refresh token — run: npm run ebag:login`);

await writeOwnerStore(db, { clientInformation: store.clientInformation, tokens: store.tokens });
console.log("Stored the eBag sign-in in Supabase (system_secrets, encrypted).");

// Check it works from Supabase (this may refresh the tokens — they are written back to Supabase).
const api = await connectEbag(await SupabaseOwnerTokens.load(db));
const res = await api.call<{ total?: number }>("search_products", { query: "прясно мляко", page_size: 1 });
await api.close();
console.log(`eBag works from Supabase: test search found ${res.total ?? "?"} products.`);

// One holder per refresh token: drop the tokens from the local file.
const rest: OAuthStore = { ...store };
delete rest.tokens;
delete rest.codeVerifier;
fs.writeFileSync(FILE, JSON.stringify(rest, null, 2), "utf8");
console.log(`Removed the tokens from ${path.relative(ROOT, FILE)} (the sync owns them now).`);
