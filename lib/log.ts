// Structured logging: one JSON line per event, which Vercel's log viewer (and any log drain) can filter by field.
//   log.info("plan.created", { total_s: 3.1 })
//   const rlog = log.child({ requestId, route: "POST /api/plan" })
//
// No personal data in logs: emails, passwords, tokens, cookies and similar fields are redacted, and user IDs are
// replaced by a short one-way reference (userRef), enough to follow one user's requests, not to identify them.
// Errors passed as `err` are also reported to Sentry (a no-op until a DSN is configured).
import * as Sentry from "@sentry/nextjs";

export type Level = "debug" | "info" | "warn" | "error";
export type Fields = Record<string, unknown>;

const ORDER: Record<Level | "silent", number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/** Keys whose values never reach the logs. */
const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|e-?mail|phone|tokens_encrypted|refresh|verifier/i;

function minLevel(): number {
  const env = process.env.LOG_LEVEL as Level | "silent" | undefined;
  if (env && env in ORDER) return ORDER[env];
  return process.env.NODE_ENV === "test" ? ORDER.silent : ORDER.info;
}

/**
 * Short, stable, one-way reference for a user ID (FNV-1a, 8 hex chars): the same user gets the same reference in
 * every log line, but it can't be turned back into the ID. Synchronous and dependency-free, so it works everywhere.
 */
export function userRef(id: string | null | undefined): string | null {
  if (!id) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `u_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

export function serializeError(e: unknown): Fields {
  if (e instanceof Error) {
    const out: Fields = { name: e.name, message: e.message };
    if (e.stack) out.stack = e.stack.split("\n").slice(0, 8).join("\n");
    const code = (e as { code?: unknown }).code;
    if (code !== undefined) out.code = code;
    if (e.cause !== undefined) out.cause = serializeError(e.cause);
    return out;
  }
  return { message: String(e) };
}

/** Redacts secret-looking keys and pseudonymises `user`/`userId`, recursively (depth-limited). */
export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return serializeError(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 5) return "[deep]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Fields = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY.test(k)) out[k] = "[redacted]";
    else if ((k === "user" || k === "userId" || k === "user_id") && typeof v === "string") out[k] = userRef(v);
    else out[k] = redact(v, depth + 1);
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  /** `fields.err` (an Error) is serialised into the line and reported to Sentry. */
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

export function createLogger(base: Fields = {}): Logger {
  const write = (level: Level, msg: string, fields: Fields = {}) => {
    if (level === "error" && fields.err !== undefined) {
      Sentry.captureException(fields.err, { extra: redact({ ...base, ...fields, err: undefined, msg }) as Fields });
    }
    if (ORDER[level] < minLevel()) return;
    const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...(redact({ ...base, ...fields }) as Fields) });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (fields) => createLogger({ ...base, ...fields }),
  };
}

export const log = createLogger();
