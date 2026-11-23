import { describe, expect, it } from "vitest";
import { matchScore, queries, stems } from "./fetch_recipe_images";

describe("recipe photo matching", () => {
  it("stems ignore stop words and endings", () => {
    expect(stems("Пилешко филе с ориз и броколи")).toEqual(["пилеш", "филе", "ориз", "броко"]);
  });
  it("prefers a title with the same dish and ingredients", () => {
    const name = "Крем супа от червена леща";
    expect(matchScore(name, "Крем супа от червена леща в мултикукър")).toBeGreaterThan(matchScore(name, "Леща яхния с наденица"));
    expect(matchScore("Мусака", "Мусака с кайма и заливка")).toBeGreaterThan(0.8);
  });
  it("searches the full name, then the dish, then the first two words", () => {
    expect(queries("Пиле с ориз на фурна")).toEqual(["Пиле с ориз на фурна", "Пиле", "Пиле с"]);
    expect(queries("„Сладолед“ от замразени банани и какао")[0]).toBe("Сладолед от замразени банани и какао");
  });
});
