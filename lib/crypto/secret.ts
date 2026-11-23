// AES-256-GCM encryption for secrets stored in the database (eBag OAuth tokens). Key: EBAG_TOKEN_KEY, 32 bytes
// base64. Format: "v1.<iv>.<tag>.<ciphertext>" (base64url parts). Used by scripts and, later, server code —
// so no "server-only" import here; never import it from a client component.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(keyB64: string | undefined): Buffer {
  if (!keyB64) throw new Error("EBAG_TOKEN_KEY is not set");
  const k = Buffer.from(keyB64, "base64");
  if (k.length !== 32) throw new Error("EBAG_TOKEN_KEY must be 32 bytes (base64)");
  return k;
}

export function encryptJson(value: unknown, keyB64: string | undefined = process.env.EBAG_TOKEN_KEY): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(keyB64), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptJson<T = unknown>(payload: string, keyB64: string | undefined = process.env.EBAG_TOKEN_KEY): T {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(keyB64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}
