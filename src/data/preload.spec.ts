import { describe, expect, it } from "vitest";

import { planPreload, ThumbPreloader, type PreloadEntry } from "./preload";

const DAYS = ["2026-10-19", "2026-10-18", "2026-10-17", "2026-10-16", "2026-10-15"];
const strip = (day: string, n = 5) => Array.from({ length: n }, (_, i) => `${day}#${i}`);
const itemsForDay = (day: string) => strip(day);

describe("planPreload", () => {
  it("loads the whole active day outward from the selection, then the older days", () => {
    const plan = planPreload({
      days: DAYS,
      activeDay: DAYS[0]!,
      selectedIndex: 0,
      neighbourDays: 2,
      itemsForDay,
    });
    expect(plan.slice(0, 5)).toEqual(strip(DAYS[0]!));
    expect(plan.slice(5, 10)).toEqual(strip(DAYS[1]!));
    expect(plan.slice(10, 15)).toEqual(strip(DAYS[2]!));
    expect(plan).toHaveLength(15);
  });

  it("orders the active day by distance from the selected thumb", () => {
    const plan = planPreload({
      days: DAYS,
      activeDay: DAYS[0]!,
      selectedIndex: 2,
      neighbourDays: 0,
      itemsForDay,
    });
    expect(plan).toEqual([
      "2026-10-19#2",
      "2026-10-19#3",
      "2026-10-19#1",
      "2026-10-19#4",
      "2026-10-19#0",
    ]);
  });

  it("alternates older and newer neighbours around a day in the middle", () => {
    const plan = planPreload({
      days: DAYS,
      activeDay: DAYS[2]!,
      selectedIndex: 0,
      neighbourDays: 2,
      itemsForDay,
    });
    const dayOrder = [...new Set(plan.map((s) => s.split("#")[0]))];
    expect(dayOrder).toEqual([
      "2026-10-17",
      "2026-10-16",
      "2026-10-18",
      "2026-10-15",
      "2026-10-19",
    ]);
  });

  it("defaults to the newest day, clamps the selection and stops at the ends", () => {
    const plan = planPreload({
      days: DAYS,
      activeDay: null,
      selectedIndex: 99,
      neighbourDays: 9,
      itemsForDay,
    });
    expect(plan[0]).toBe("2026-10-19#4");
    expect(plan).toHaveLength(25);
    expect(
      planPreload({ days: [], activeDay: null, selectedIndex: 0, neighbourDays: 2, itemsForDay })
    ).toEqual([]);
  });

  it("skips empty days and duplicate items", () => {
    const plan = planPreload({
      days: ["d1", "d2", "d3"],
      activeDay: "d1",
      selectedIndex: 0,
      neighbourDays: 2,
      itemsForDay: (d) => (d === "d2" ? [] : d === "d1" ? ["a", "b", "a"] : ["b", "c"]),
    });
    expect(plan).toEqual(["a", "b", "c"]);
  });
});

function deferredLoader() {
  const calls: string[] = [];
  const pending = new Map<string, (ok: boolean) => void>();
  const load = (url: string) =>
    new Promise<boolean>((resolve) => {
      calls.push(url);
      pending.set(url, resolve);
    });
  const settle = async (url: string, ok = true) => {
    pending.get(url)?.(ok);
    pending.delete(url);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { calls, pending, load, settle };
}

const entries = (...urls: string[]): PreloadEntry[] =>
  urls.map((url) => ({ src: `src:${url}`, url }));

describe("ThumbPreloader", () => {
  it("keeps at most `concurrency` loads in flight, in queue order", async () => {
    const l = deferredLoader();
    const p = new ThumbPreloader({ load: l.load, concurrency: 2, isHidden: () => false });
    p.setQueue(entries("a", "b", "c", "d"));
    expect(l.calls).toEqual(["a", "b"]);
    await l.settle("a");
    expect(l.calls).toEqual(["a", "b", "c"]);
    expect(p.stats).toEqual({ done: 1, failed: 0, pending: 1, inFlight: 2 });
  });

  it("reports each result once and never reloads what loaded or failed", async () => {
    const l = deferredLoader();
    const results: [string, boolean][] = [];
    const p = new ThumbPreloader({
      load: l.load,
      concurrency: 4,
      isHidden: () => false,
      onResult: (e, ok) => results.push([e.src, ok]),
    });
    p.setQueue(entries("a", "b"));
    await l.settle("a", true);
    await l.settle("b", false);
    expect(results).toEqual([
      ["src:a", true],
      ["src:b", false],
    ]);
    p.setQueue(entries("a", "b", "c"));
    expect(l.calls).toEqual(["a", "b", "c"]);
  });

  it("a new queue replaces what still waits but lets loads in flight finish", async () => {
    const l = deferredLoader();
    const p = new ThumbPreloader({ load: l.load, concurrency: 1, isHidden: () => false });
    p.setQueue(entries("a", "b", "c"));
    p.setQueue(entries("x", "a"));
    expect(l.calls).toEqual(["a"]);
    await l.settle("a");
    expect(l.calls).toEqual(["a", "x"]);
    expect(p.stats.pending).toBe(0);
  });

  it("starts nothing while the page is hidden and resumes on pump()", async () => {
    const l = deferredLoader();
    let hidden = true;
    const p = new ThumbPreloader({ load: l.load, concurrency: 2, isHidden: () => hidden });
    p.setQueue(entries("a", "b"));
    expect(l.calls).toEqual([]);
    hidden = false;
    p.pump();
    expect(l.calls).toEqual(["a", "b"]);
  });

  it("skips URLs marked as loaded by a visible tile, dedupes and ignores empty URLs", () => {
    const l = deferredLoader();
    const p = new ThumbPreloader({ load: l.load, concurrency: 5, isHidden: () => false });
    p.markLoaded("b");
    p.setQueue([...entries("a", "b", "a"), { src: "s", url: "" }]);
    expect(l.calls).toEqual(["a"]);
  });

  it("treats a throwing loader as a failure and stops after dispose()", async () => {
    const results: boolean[] = [];
    const p = new ThumbPreloader({
      load: () => Promise.reject(new Error("boom")),
      concurrency: 1,
      isHidden: () => false,
      onResult: (_e, ok) => results.push(ok),
    });
    p.setQueue(entries("a"));
    await new Promise((r) => setTimeout(r, 0));
    expect(results).toEqual([false]);
    const l = deferredLoader();
    const q = new ThumbPreloader({ load: l.load, concurrency: 1, isHidden: () => false });
    q.dispose();
    q.setQueue(entries("z"));
    expect(l.calls).toEqual([]);
  });
});
