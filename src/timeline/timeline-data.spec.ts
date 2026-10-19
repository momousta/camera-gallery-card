import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ageLabel,
  buildTrack,
  dayBounds,
  dayKeyOf,
  daysWithItems,
  eventKind,
  hourMarks,
  itemAtOrBefore,
  itemsBetween,
  msToPx,
  preloadOrder,
  pxToMs,
  type TimelineItem,
} from "./timeline-data";

const FMT = "YYYYMMDD_HHmmss";
const W = "/config/www/snapshots/front_right";
const at = (h: number, m = 0, s = 0, day = 19) => new Date(2026, 9, day, h, m, s).getTime();

describe("eventKind", () => {
  it("reads the kind from the file name's first word", () => {
    expect(eventKind("/local/a/person_20261019_120000.gif")).toBe("person");
    expect(eventKind("/local/a/car_20261017_213503_snapshot.jpg")).toBe("car");
    expect(eventKind("/local/a/dog_20261019_120000.gif")).toBe("dog");
    expect(eventKind("/local/a/visitor_20261019_120000.mp4")).toBe("visitor");
    expect(eventKind("/local/a/motion_20261019_120000.gif")).toBe("motion");
    expect(eventKind("/local/a/hourly_20261019_120000.gif")).toBe("hourly");
    expect(eventKind("/local/a/snapshot_20261019_120500.jpg")).toBe("still");
    expect(eventKind("/local/a/20261019_120000.jpg")).toBe("other");
    expect(eventKind("")).toBe("other");
  });
});

describe("buildTrack", () => {
  it("parses, drops temporary and undated files, dedupes and sorts oldest first", () => {
    const items = buildTrack(
      [
        `${W}/motion_20261019_130000.gif`,
        `${W}/hourly_20261019_120000.gif`,
        `${W}/_tmp_motion_20261019_125959.mp4.tmp`,
        `${W}/notes.gif`,
        `${W}/hourly_20261019_120000.gif`,
        `${W}/car_20261019_124500_snapshot.jpg`,
      ],
      FMT
    );
    expect(items.map((x) => x.src.split("/").pop())).toEqual([
      "hourly_20261019_120000.gif",
      "car_20261019_124500_snapshot.jpg",
      "motion_20261019_130000.gif",
    ]);
    expect(items[0]).toEqual({
      src: "/local/snapshots/front_right/hourly_20261019_120000.gif",
      ms: at(12),
      kind: "hourly",
    });
  });

  it("accepts a JSON string list and returns nothing without a format or list", () => {
    expect(buildTrack(JSON.stringify([`${W}/motion_20261019_130000.gif`]), FMT)).toHaveLength(1);
    expect(buildTrack([`${W}/motion_20261019_130000.gif`], "")).toEqual([]);
    expect(buildTrack(undefined, FMT)).toEqual([]);
    expect(buildTrack(42, FMT)).toEqual([]);
  });
});

describe("days", () => {
  it("bounds a day at local midnights", () => {
    expect(dayBounds("2026-10-19")).toEqual({ start: at(0), end: at(0, 0, 0, 20) });
    expect(dayBounds("bad")).toBeNull();
    expect(dayKeyOf(at(23, 59, 59))).toBe("2026-10-19");
  });

  it("lists the days with items on any camera, newest first", () => {
    const a = buildTrack(
      [`${W}/motion_20261018_100000.gif`, `${W}/motion_20261019_100000.gif`],
      FMT
    );
    const b = buildTrack(
      [`${W}/motion_20261017_100000.gif`, `${W}/motion_20261019_110000.gif`],
      FMT
    );
    expect(daysWithItems([a, b, []])).toEqual(["2026-10-19", "2026-10-18", "2026-10-17"]);
  });
});

describe("lookup", () => {
  const items: TimelineItem[] = [at(10), at(10, 30), at(11), at(11, 0, 1)].map((ms, i) => ({
    src: `s${i}`,
    ms,
    kind: "motion",
  }));

  it("finds the last frame at or before a moment", () => {
    expect(itemAtOrBefore(items, at(9, 59))).toBe(-1);
    expect(itemAtOrBefore(items, at(10))).toBe(0);
    expect(itemAtOrBefore(items, at(10, 29, 59))).toBe(0);
    expect(itemAtOrBefore(items, at(11, 0, 0))).toBe(2);
    expect(itemAtOrBefore(items, at(23))).toBe(3);
    expect(itemAtOrBefore([], at(23))).toBe(-1);
  });

  it("slices a time range [start, end)", () => {
    expect(itemsBetween(items, at(10, 30), at(11)).map((x) => x.src)).toEqual(["s1"]);
    expect(itemsBetween(items, at(0), at(0, 0, 0, 20))).toHaveLength(4);
    expect(itemsBetween(items, at(12), at(13))).toEqual([]);
  });

  it("orders preloads by distance from the moment, across cameras", () => {
    const cam2: TimelineItem[] = [{ src: "x", ms: at(10, 50), kind: "car" }];
    expect(preloadOrder([items, cam2], at(10, 55)).map((x) => x.src)).toEqual([
      "x",
      "s2",
      "s3",
      "s1",
      "s0",
    ]);
  });
});

describe("track geometry and labels", () => {
  it("maps time to pixels and back", () => {
    const start = at(0);
    expect(msToPx(at(1), start, 4)).toBe(240);
    expect(pxToMs(240, start, 4)).toBe(at(1));
    expect(pxToMs(msToPx(at(13, 37, 30), start, 16), start, 16)).toBe(at(13, 37, 30));
  });

  it("marks every hour, or every 3 hours when zoomed out", () => {
    const { start, end } = dayBounds("2026-10-19")!;
    expect(hourMarks(start, end, 4)).toHaveLength(24);
    const sparse = hourMarks(start, end, 1);
    expect(sparse).toHaveLength(8);
    expect(sparse.filter((m) => m.major).map((m) => new Date(m.ms).getHours())).toEqual([
      0, 6, 12, 18,
    ]);
  });

  it("labels how old a frame is", () => {
    expect(ageLabel(30_000)).toBe("");
    expect(ageLabel(12 * 60_000)).toBe("−12 min");
    expect(ageLabel(65 * 60_000)).toBe("−1 h 05");
    expect(ageLabel(NaN)).toBe("");
  });
});

describe("daylight-saving days", () => {
  beforeEach(() => vi.stubEnv("TZ", "America/Chicago"));
  afterEach(() => vi.unstubAllEnvs());

  it("a day is local midnight to local midnight, however long", () => {
    const b = dayBounds("2026-11-01");
    expect(b).not.toBeNull();
    const hours = (b!.end - b!.start) / 3_600_000;
    expect([23, 24, 25]).toContain(hours);
  });
});
