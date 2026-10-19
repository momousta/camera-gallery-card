// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ThumbPreloader } from "../data/preload";

// BL-006: previews next to the files (thumbnail_folder), low-res scrubbing, the calendar and preloading.

const DIR = "/local/snapshots/cam";
const T0 = Date.UTC(2026, 9, 19, 17, 0, 0);
const it_ = (name: string, n: number, dayKey: string) => ({
  src: `${DIR}/${name}`,
  dtMs: T0 - n * 60_000,
  dayKey,
});
const DAY1 = [
  it_("motion_20261019_120000.gif", 0, "2026-10-19"),
  it_("car_20261019_115900_snapshot.jpg", 1, "2026-10-19"),
  it_("person_20261019_115800.mp4", 2, "2026-10-19"),
];
const DAY2 = [
  it_("motion_20261017_100000.gif", 3000, "2026-10-17"),
  it_("hourly_20261017_090000.gif", 3060, "2026-10-17"),
];
const DAY3 = [it_("motion_20260930_100000.gif", 27000, "2026-09-30")];
const ALL = [...DAY1, ...DAY2, ...DAY3];
const DAYS = ["2026-10-19", "2026-10-17", "2026-09-30"];
const side = (name: string) => `${DIR}/thumbs/${name}.jpg`;

class NoopIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16));
  vi.stubGlobal("cancelAnimationFrame", (h: number) => clearTimeout(h));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderCard(options: Record<string, unknown> = {}, activeDay = DAYS[0]) {
  const card: any = document.createElement("camera-gallery-card");
  for (const method of [
    "_startMediaPoll",
    "_subscribeFrigateEvents",
    "_mountLiveCard",
    "_setupThumbObserver",
    "_scheduleVisibleMediaWork",
    "_queueSnapshotResolveForVisibleThumbs",
  ]) {
    vi.spyOn(card, method).mockImplementation(() => {});
  }
  vi.spyOn(card._posterClient, "prewarm").mockResolvedValue(undefined);
  const dayItems = ALL.filter((x) => x.dayKey === activeDay);
  vi.spyOn(card, "_computeBaseList").mockReturnValue({
    rawItems: ALL,
    allWithDay: ALL,
    objFiltered: dayItems,
    dayFiltered: dayItems,
    days: DAYS,
    newestDay: DAYS[0],
    activeDay,
    videoCount: 1,
    imageCount: dayItems.length - 1,
  });
  card.setConfig({
    entities: ["sensor.synthetic"],
    path_datetime_format: "YYYYMMDD_HHmmss",
    thumb_size: 100,
    ...options,
  });
  card._hass = { states: {}, locale: { language: "en-US", first_weekday: "sunday" } };
  document.body.append(card);
  await card.updateComplete;
  for (const x of ALL) card._revealedThumbs.add(x.src);
  card.requestUpdate();
  await card.updateComplete;
  return card;
}

const q = (card: any, sel: string) => card.shadowRoot.querySelector(sel);
const tileImg = (card: any, i: number): HTMLImageElement | null =>
  q(card, `button.tthumb[data-i="${i}"] img.timg`);

describe("previews next to the files (thumbnail_folder)", () => {
  it("every tile type shows its small preview", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs" });
    expect(tileImg(card, 0)?.getAttribute("src")).toBe(side("motion_20261019_120000.gif"));
    expect(tileImg(card, 1)?.getAttribute("src")).toBe(side("car_20261019_115900_snapshot.jpg"));
    expect(tileImg(card, 2)?.getAttribute("src")).toBe(side("person_20261019_115800.mp4"));
  });

  it("a preview that fails falls back to the card's own tile for that item only", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs" });
    tileImg(card, 1)!.dispatchEvent(new Event("error"));
    await card.updateComplete;
    expect(tileImg(card, 1)?.getAttribute("src")).toBe(`${DIR}/car_20261019_115900_snapshot.jpg`);
    expect(tileImg(card, 0)?.getAttribute("src")).toBe(side("motion_20261019_120000.gif"));
  });

  it("without the option, photo tiles are the photos (unchanged)", async () => {
    const card = await renderCard({});
    expect(tileImg(card, 1)?.getAttribute("src")).toBe(`${DIR}/car_20261019_115900_snapshot.jpg`);
  });

  it("while scrubbing the viewer shows the small preview, never the full photo", async () => {
    const card = await renderCard({
      thumbnail_folder: "thumbs",
      scrub_on_drag: true,
      start_mode: "gallery",
    });
    card._selectedIndex = 1;
    card._scrubbing = true;
    card.requestUpdate();
    await card.updateComplete;
    const frame = q(card, ".preview img.scrub-frame") as HTMLImageElement;
    expect(frame.getAttribute("src")).toBe(side("car_20261019_115900_snapshot.jpg"));
    // The next frame is painted over the last one that loaded, so a fast scrub never flashes empty.
    frame.dispatchEvent(new Event("load"));
    card._selectedIndex = 0;
    card.requestUpdate();
    await card.updateComplete;
    const next = q(card, ".preview img.scrub-frame") as HTMLImageElement;
    expect(next.getAttribute("src")).toBe(side("motion_20261019_120000.gif"));
    expect(next.getAttribute("style")).toContain(side("car_20261019_115900_snapshot.jpg"));
  });

  it("on pause the full photo loads over its preview", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs", start_mode: "gallery" });
    card._selectedIndex = 1;
    card._scrubbing = false;
    card.requestUpdate();
    await card.updateComplete;
    const pimg = q(card, ".preview img.pimg:not(.scrub-frame)") as HTMLImageElement;
    expect(pimg.getAttribute("src")).toBe(`${DIR}/car_20261019_115900_snapshot.jpg`);
    expect(pimg.getAttribute("style")).toContain(
      `background-image:url("${side("car_20261019_115900_snapshot.jpg")}")`
    );
  });

  it("a video gets its preview as the poster", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs", start_mode: "gallery" });
    card._selectedIndex = 2;
    card.requestUpdate();
    await card.updateComplete;
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    card._ensurePreviewVideoHostPlayback(`${DIR}/person_20261019_115800.mp4`);
    expect(card._previewVideoEl?.getAttribute("poster")).toBe(side("person_20261019_115800.mp4"));
  });
});

describe("preloading", () => {
  it("queues the active day outward from the selection, then the neighbour days, as previews", async () => {
    const calls: { src: string; url: string }[][] = [];
    vi.spyOn(ThumbPreloader.prototype, "setQueue").mockImplementation(function (entries) {
      calls.push([...entries]);
    });
    const card = await renderCard({
      thumbnail_folder: "thumbs",
      preload_thumbnails: true,
      preload_days: 1,
    });
    expect(calls).toEqual([]); // waits for the visible tiles first
    await vi.advanceTimersByTimeAsync(900);
    const urls = calls[calls.length - 1]!.map((e) => e.url);
    expect(urls).toEqual([
      side("motion_20261019_120000.gif"),
      side("car_20261019_115900_snapshot.jpg"),
      side("person_20261019_115800.mp4"),
      side("motion_20261017_100000.gif"),
      side("hourly_20261017_090000.gif"),
    ]);
    card.remove();
    expect(calls[calls.length - 1]).toEqual([]); // leaving the view stops what still waits
  });

  it("does nothing without previews or when switched off", async () => {
    const spy = vi.spyOn(ThumbPreloader.prototype, "setQueue");
    await renderCard({ preload_thumbnails: true });
    await renderCard({ thumbnail_folder: "thumbs" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(spy.mock.calls.filter(([e]) => e.length > 0)).toEqual([]);
  });

  it("a preview that fails to preload falls back on its tile", async () => {
    let onResult: ((e: { src: string; url: string }, ok: boolean) => void) | undefined;
    vi.spyOn(ThumbPreloader.prototype, "setQueue").mockImplementation(function (this: any) {
      onResult = this._onResult;
    });
    const card = await renderCard({ thumbnail_folder: "thumbs", preload_thumbnails: true });
    await vi.advanceTimersByTimeAsync(900);
    onResult!({ src: `${DIR}/car_20261019_115900_snapshot.jpg`, url: "x" }, false);
    await card.updateComplete;
    expect(tileImg(card, 1)?.getAttribute("src")).toBe(`${DIR}/car_20261019_115900_snapshot.jpg`);
  });
});
