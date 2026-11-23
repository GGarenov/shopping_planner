import { describe, expect, it } from "vitest";
import { planWeekStart, shortDate, sofiaToday, todayIndexInWeek, weekdayIndex } from "./week";

describe("week helpers (Europe/Sofia)", () => {
  it("uses Sofia time, not UTC", () => {
    // 23:30 UTC on Sunday 2026-11-22 is already Monday 01:30 in Sofia
    expect(sofiaToday(new Date("2026-11-22T23:30:00Z"))).toBe("2026-11-23");
  });

  it("weekdayIndex: Monday = 0, Sunday = 6", () => {
    expect(weekdayIndex("2026-11-23")).toBe(0);
    expect(weekdayIndex("2026-11-29")).toBe(6);
  });

  it("plans the current week Mon–Wed, the next week Thu–Sun", () => {
    expect(planWeekStart(new Date("2026-11-23T10:00:00Z"))).toBe("2026-11-23"); // Mon
    expect(planWeekStart(new Date("2026-11-25T10:00:00Z"))).toBe("2026-11-23"); // Wed
    expect(planWeekStart(new Date("2026-11-26T10:00:00Z"))).toBe("2026-11-30"); // Thu
    expect(planWeekStart(new Date("2026-11-29T10:00:00Z"))).toBe("2026-11-30"); // Sun
  });

  it("today's tab within the plan week", () => {
    expect(todayIndexInWeek("2026-11-23", new Date("2026-11-25T10:00:00Z"))).toBe(2);
    expect(todayIndexInWeek("2026-11-30", new Date("2026-11-25T10:00:00Z"))).toBe(0);
  });

  it("short dates across a month boundary", () => {
    expect(shortDate("2026-11-30", 0)).toBe("30.11");
    expect(shortDate("2026-11-30", 2)).toBe("2.12");
  });
});
