// Helpers for route-handler tests: server-side translations from the real messages, and a fake Supabase client that
// records every query and answers from canned results.
import { createTranslator } from "use-intl/core";
import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "./messages";

// ---------- next-intl/server ----------
export const intl = { locale: "bg" as Locale };

/** Use as: vi.mock("next-intl/server", async () => (await import("@/test/server")).intlServer) */
export const intlServer = {
  getLocale: async () => intl.locale,
  getTranslations: async (namespace?: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- namespaces are checked by the messages test
    createTranslator({ locale: intl.locale, messages: messagesFor(intl.locale) as any, namespace: namespace as any }),
};

// ---------- Supabase ----------
type Result = { data: unknown; error: { message: string } | null; count?: number | null };
type Op = "select" | "insert" | "update" | "upsert" | "delete";
/** Canned answers per table: `maybeSingle` / `single` for reads, or the op name for awaited writes. */
type TableResults = Partial<Record<"maybeSingle" | "single" | Op, Result>>;

export interface Query {
  table: string;
  op: Op;
  payload?: unknown;
  filters: [string, unknown][];
}

export function fakeSupabase({
  user,
  tables = {},
}: {
  user: { id: string; email?: string; is_anonymous?: boolean } | null;
  tables?: Record<string, TableResults>;
}) {
  const queries: Query[] = [];
  const empty: Result = { data: null, error: null };
  const from = (table: string) => {
    const q: Query = { table, op: "select", filters: [] };
    queries.push(q);
    const answer = (kind: keyof TableResults) =>
      tables[table]?.[kind] ?? (kind === "maybeSingle" || kind === "single" ? tables[table]?.[q.op] : undefined) ?? empty;
    const builder = {
      select: () => builder,
      insert: (payload: unknown) => ((q.op = "insert"), (q.payload = payload), builder),
      update: (payload: unknown) => ((q.op = "update"), (q.payload = payload), builder),
      upsert: (payload: unknown) => ((q.op = "upsert"), (q.payload = payload), builder),
      delete: () => ((q.op = "delete"), builder),
      eq: (col: string, val: unknown) => (q.filters.push([col, val]), builder),
      gte: (col: string, val: unknown) => (q.filters.push([`${col}>=`, val]), builder),
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      maybeSingle: async () => answer(q.op === "select" ? "maybeSingle" : q.op),
      single: async () => answer(q.op === "select" ? "single" : q.op),
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(answer(q.op)).then(resolve, reject),
    };
    return builder;
  };
  const client = { auth: { getUser: async () => ({ data: { user }, error: null }) }, from };
  return { client, queries, writes: (table: string, op: Op) => queries.filter((x) => x.table === table && x.op === op) };
}
