// Logger for server actions and server components, bound to the request ID that middleware.ts put on the request.
import "server-only";
import { headers } from "next/headers";
import { REQUEST_ID_HEADER } from "@/lib/api/handler";
import { log, type Fields, type Logger } from "@/lib/log";

export async function requestLog(fields: Fields = {}): Promise<Logger> {
  const requestId = await headers()
    .then((h) => h.get(REQUEST_ID_HEADER) ?? undefined)
    .catch(() => undefined);
  return log.child({ requestId, ...fields });
}
