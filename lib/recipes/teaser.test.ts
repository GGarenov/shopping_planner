import { describe, expect, it, vi } from "vitest";
import { teaserRecipes } from "./teaser";

vi.mock("server-only", () => ({}));

describe("teaserRecipes", () => {
  it("gives different recipes, each with a photo, in the user's language", () => {
    const bg = teaserRecipes("bg");
    expect(bg).toHaveLength(7);
    expect(new Set(bg.map((r) => r.photo)).size).toBe(7);
    for (const r of bg) expect(r.photo).toMatch(/^\/recipes\/.+-400\.webp$/);
    const seq = () => 0; // always the first left: the same recipes in both languages
    const [b, e] = [teaserRecipes("bg", 3, seq), teaserRecipes("en", 3, seq)];
    expect(e.map((r) => r.photo)).toEqual(b.map((r) => r.photo));
    expect(e[0]!.name).not.toBe(b[0]!.name);
  });
});
