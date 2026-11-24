import { describe, expect, it } from "vitest";
import { eur, longDate, num, packUnits, shortDay } from "./format";

describe("locale formats", () => {
  it("money: Bulgarian «9,40 €», English «€9.40»", () => {
    expect(eur(9.4)).toBe("9,40 €");
    expect(eur(9.4, "bg")).toBe("9,40 €");
    expect(eur(9.4, "en")).toBe("€9.40");
    expect(eur(1234.5, "en")).toBe("€1234.50");
  });

  it("decimals keep up to the given digits", () => {
    expect(num(22.456, "bg")).toBe("22,5");
    expect(num(22.456, "en")).toBe("22.5");
    expect(num(22.456, "en", 2)).toBe("22.46");
    expect(num(5, "bg")).toBe("5");
  });

  it("dates", () => {
    expect(longDate("2026-11-24", "bg")).toBe("24.11.2026");
    expect(longDate("2026-11-24T10:00:00Z", "en")).toBe("24 Nov 2026");
    expect(shortDay("2026-11-23", 0, "bg")).toBe("23.11");
    expect(shortDay("2026-11-23", 6, "en")).toBe("29 Nov");
    expect(shortDay("2026-11-30", 2, "bg")).toBe("2.12"); // crosses the month
  });

  it("pack units: English units only in English", () => {
    expect(packUnits("500 г", "bg")).toBe("500 г");
    expect(packUnits("500 г", "en")).toBe("500 g");
    expect(packUnits("1 кг", "en")).toBe("1 kg");
    expect(packUnits("2 x 500 г", "en")).toBe("2 x 500 g");
    expect(packUnits("500 мл", "en")).toBe("500 ml");
    expect(packUnits("1 л", "en")).toBe("1 l");
    expect(packUnits("~ 700 г / бр", "en")).toBe("~ 700 g / pc");
    expect(packUnits("10 бр.", "en")).toBe("10 pcs");
    expect(packUnits("1 бр.", "en")).toBe("1 pc");
  });
});
