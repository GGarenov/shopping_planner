import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "./secret";

const k = randomBytes(32).toString("base64");

describe("encryptJson / decryptJson", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const v = { tokens: { access_token: "a", refresh_token: "r" }, n: 1 };
    const a = encryptJson(v, k);
    expect(a).toMatch(/^v1\./);
    expect(a).not.toContain("refresh_token");
    expect(encryptJson(v, k)).not.toBe(a);
    expect(decryptJson(a, k)).toEqual(v);
  });

  it("rejects a wrong key or tampered data", () => {
    const a = encryptJson({ x: 1 }, k);
    expect(() => decryptJson(a, randomBytes(32).toString("base64"))).toThrow();
    const parts = a.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptJson(parts.join("."), k)).toThrow();
  });

  it("requires a 32-byte key", () => {
    expect(() => encryptJson({}, randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => encryptJson({}, "")).toThrow(/not set/);
  });
});
