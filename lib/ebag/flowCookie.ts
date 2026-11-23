// Short-lived httpOnly cookie that carries the PKCE verifier and state from /api/ebag/connect to the callback.
import "server-only";
import { decryptJson, encryptJson } from "@/lib/crypto/secret";

export const FLOW_COOKIE = "ebag_oauth";
const MAX_AGE_S = 10 * 60;

export interface FlowState {
  state: string;
  verifier: string;
  userId: string;
  redirect: string;
  exp: number;
}

export const flowCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const, // the callback is a top-level redirect from ebag.bg
  path: "/api/ebag",
  maxAge: MAX_AGE_S,
};

export function sealFlow(f: Omit<FlowState, "exp">): string {
  return encryptJson({ ...f, exp: Date.now() + MAX_AGE_S * 1000 });
}

export function openFlow(value: string | undefined): FlowState | null {
  if (!value) return null;
  try {
    const f = decryptJson<FlowState>(value);
    return f.exp > Date.now() ? f : null;
  } catch {
    return null;
  }
}
