import { describe, expect, it } from "vitest";

import {
  indexOfTarget,
  parseUrlTarget,
  parseUrlTime,
  pickTargetEntry,
  withoutDeepLinkParams,
} from "./url-target";

const T = Date.UTC(2026, 9, 19, 17, 45, 0);
const SRC = "/local/snapshots/front_right/car_20261019_124500_snapshot.jpg";

describe("parseUrlTime", () => {
  it("accepts epoch milliseconds, epoch seconds and ISO 8601", () => {
    expect(parseUrlTime(String(T))).toBe(T);
    expect(parseUrlTime(String(T / 1000))).toBe(T);
    expect(parseUrlTime("2026-10-19T17:45:00Z")).toBe(T);
  });

  it("rejects anything else, and implausible moments", () => {
    for (const v of [
      "",
      " ",
      "abc",
      "12",
      "2026-10-19",
      "1e12",
      "-1792436400000",
      "99999999999999",
      null,
      42,
    ]) {
      expect(parseUrlTime(v), String(v)).toBeNull();
    }
    expect(parseUrlTime("946684799")).toBeNull(); // 1999
  });
});

describe("parseUrlTarget", () => {
  const q = (s: string) => parseUrlTarget({ search: s, urlId: "front_right" });

  it("reads the file and the moment for this card only", () => {
    expect(q(`?cgc_id=front_right&cgc_src=${encodeURIComponent(SRC)}&cgc_time=${T}`)).toEqual({
      src: SRC,
      time: T,
    });
    expect(q(`cgc_id=front_right&cgc_time=${T}`)).toEqual({ src: null, time: T });
    expect(q(`?cgc_id=camera1&cgc_src=${encodeURIComponent(SRC)}`)).toBeNull();
    expect(parseUrlTarget({ search: `?cgc_id=x&cgc_time=${T}`, urlId: "" })).toBeNull();
  });

  it("reads a swipe's closest item, quality and full screen", () => {
    expect(q(`?cgc_id=front_right&cgc_time=${T}&cgc_near=1&cgc_nvr=main&cgc_fs=1`)).toEqual({
      src: null,
      time: T,
      near: true,
      nvr: "main",
      fs: true,
    });
    expect(q(`?cgc_id=front_right&cgc_time=${T}&cgc_nvr=ultra&cgc_near=yes`)).toEqual({
      src: null,
      time: T,
    });
    // A quality without a moment means nothing.
    expect(q(`?cgc_id=front_right&cgc_src=${encodeURIComponent(SRC)}&cgc_nvr=sub`)).toEqual({
      src: SRC,
      time: null,
    });
  });

  it("ignores a link without a usable file or moment", () => {
    expect(q("?cgc_id=front_right&cgc_view=gallery")).toBeNull();
    expect(q("?cgc_id=front_right&cgc_src=javascript:alert(1)")).toBeNull();
    expect(q(`?cgc_id=front_right&cgc_src=${"/a".repeat(1100)}`)).toBeNull();
    expect(q("")).toBeNull();
    expect(parseUrlTarget({ search: undefined, urlId: "front_right" })).toBeNull();
  });
});

describe("picking the item", () => {
  const entries = [
    { src: "a", dtMs: T - 3_600_000, dayKey: "2026-10-19" },
    { src: SRC, dtMs: T, dayKey: "2026-10-19" },
    { src: "c", dtMs: T + 600_000, dayKey: "2026-10-19" },
    { src: "nodate", dtMs: null, dayKey: null },
  ];

  it("prefers the exact file", () => {
    expect(pickTargetEntry(entries, { src: SRC, time: T - 999_999 })?.src).toBe(SRC);
  });

  it("falls back to the latest item at or before the moment, else the first after", () => {
    expect(pickTargetEntry(entries, { src: "/gone.gif", time: T + 60_000 })?.src).toBe(SRC);
    expect(pickTargetEntry(entries, { src: null, time: T - 7_200_000 })?.src).toBe("a");
    expect(pickTargetEntry(entries, { src: "/gone.gif", time: null })).toBeNull();
    expect(pickTargetEntry([], { src: null, time: T })).toBeNull();
    expect(pickTargetEntry(entries, null)).toBeNull();
  });

  it("a swipe takes the item closest to the moment, before or after it", () => {
    expect(pickTargetEntry(entries, { src: null, time: T + 400_000, near: true })?.src).toBe("c");
    expect(pickTargetEntry(entries, { src: null, time: T + 200_000, near: true })?.src).toBe(SRC);
    expect(pickTargetEntry(entries, { src: null, time: T + 300_000, near: true })?.src).toBe(SRC); // a tie: earlier
    expect(pickTargetEntry([], { src: null, time: T, near: true })).toBeNull();
  });

  it("finds the item's index in the strip, else the closest in time", () => {
    expect(indexOfTarget(entries, { src: "c", dtMs: T + 600_000 })).toBe(2);
    expect(indexOfTarget(entries, { src: "elsewhere", dtMs: T + 500_000 })).toBe(2);
    expect(indexOfTarget(entries, { src: "elsewhere", dtMs: null })).toBe(-1);
    expect(indexOfTarget([], { src: "x", dtMs: T })).toBe(-1);
  });
});

describe("withoutDeepLinkParams", () => {
  it("removes only the deep-link parameters", () => {
    expect(
      withoutDeepLinkParams(
        `https://ha.local/main-dashboard/front-right?edit=1&cgc_id=front_right&cgc_view=gallery&cgc_src=%2Fa&cgc_time=${T}#x`
      )
    ).toBe("https://ha.local/main-dashboard/front-right?edit=1#x");
    expect(
      withoutDeepLinkParams(
        `https://ha.local/a?cgc_id=x&cgc_time=${T}&cgc_near=1&cgc_nvr=sub&cgc_fs=1&b=2`
      )
    ).toBe("https://ha.local/a?b=2");
    expect(withoutDeepLinkParams("https://ha.local/a?cgc_camera=camera.x")).toBe(
      "https://ha.local/a"
    );
    expect(withoutDeepLinkParams("not a url")).toBe("not a url");
  });
});
