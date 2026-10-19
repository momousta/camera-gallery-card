import { describe, expect, it } from "vitest";

import {
  firstWeekdayFor,
  monthGrid,
  monthOf,
  monthRange,
  shiftMonth,
  weekdayLabels,
} from "./calendar";

const media = new Set(["2026-10-12", "2026-10-17", "2026-10-19"]);
const opts = { hasMedia: (d: string) => media.has(d), today: "2026-10-19", selected: "2026-10-17" };

describe("month helpers", () => {
  it("takes the month of a day and steps across years", () => {
    expect(monthOf("2026-10-19")).toBe("2026-10");
    expect(monthOf("bad")).toBe("");
    expect(shiftMonth("2026-10", 1)).toBe("2026-11");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-03", -14)).toBe("2025-01");
  });

  it("finds the first and last months with media", () => {
    expect(monthRange(["2026-10-19", "2026-05-23", "2026-09-01", "x"])).toEqual({
      min: "2026-05",
      max: "2026-10",
    });
    expect(monthRange([])).toBeNull();
  });
});

describe("monthGrid", () => {
  it("lays October 2026 out from Sunday: the 1st is a Thursday", () => {
    const weeks = monthGrid("2026-10", 0, opts);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]!.map((c) => c.date)).toEqual([0, 0, 0, 0, 1, 2, 3]);
    expect(weeks[4]!.map((c) => c.date)).toEqual([25, 26, 27, 28, 29, 30, 31]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("starts on Monday when asked", () => {
    const weeks = monthGrid("2026-10", 1, opts);
    expect(weeks[0]!.map((c) => c.date)).toEqual([0, 0, 0, 1, 2, 3, 4]);
    const last = weeks[weeks.length - 1]!;
    expect(last.map((c) => c.date)).toEqual([26, 27, 28, 29, 30, 31, 0]);
  });

  it("marks days with media, today and the selected day", () => {
    const cells = monthGrid("2026-10", 0, opts)
      .flat()
      .filter((c) => c.day);
    const by = (day: string) => cells.find((c) => c.day === day)!;
    expect(by("2026-10-12")).toMatchObject({ hasMedia: true, isToday: false, isSelected: false });
    expect(by("2026-10-17")).toMatchObject({ hasMedia: true, isSelected: true });
    expect(by("2026-10-19")).toMatchObject({ hasMedia: true, isToday: true });
    expect(by("2026-10-18")).toMatchObject({ hasMedia: false });
    expect(cells).toHaveLength(31);
  });

  it("handles leap years, a month starting on the first weekday and bad input", () => {
    const feb = monthGrid("2028-02", 2, {
      hasMedia: () => false,
      today: "",
      selected: null,
    }).flat();
    expect(feb.filter((c) => c.day).length).toBe(29);
    expect(monthGrid("2026-02", 0, opts)[0]![0]!.date).toBe(1); // 2026-02-01 is a Sunday
    expect(monthGrid("2026-02", 0, opts)).toHaveLength(4);
    expect(monthGrid("nope", 0, opts)).toEqual([]);
  });
});

describe("first weekday and labels", () => {
  it("uses HA's profile setting, then the language, then Sunday", () => {
    expect(firstWeekdayFor("monday", "en-US")).toBe(1);
    expect(firstWeekdayFor("Saturday", "en-US")).toBe(6);
    expect(firstWeekdayFor("sunday", "de-DE")).toBe(0);
    expect(firstWeekdayFor("language", "en-US")).toBe(0);
    expect(firstWeekdayFor(undefined, "en-US")).toBe(0);
    expect([0, 1]).toContain(firstWeekdayFor("language", "de-DE"));
    expect(firstWeekdayFor("language", "not a tag !!")).toBe(0);
  });

  it("gives narrow weekday names in grid order", () => {
    expect(weekdayLabels(0, "en-US")).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(weekdayLabels(1, "en-US")).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    expect(weekdayLabels(0, "zz-invalid-!!")).toHaveLength(7);
  });
});
