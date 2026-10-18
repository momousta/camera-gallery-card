// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THUMB_WINDOW,
  THUMB_WINDOW_AHEAD,
  THUMB_WINDOW_MAX,
  THUMB_WINDOW_SETTLE_MS,
} from "../const";

const img = (n: number): string =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><text>${n}</text></svg>`
  );
const makeItems = (count: number, from = 0) =>
  Array.from({ length: count }, (_, k) => ({
    src: img(from + k),
    dtMs: 1_700_000_000_000 - (from + k) * 300_000,
    dayKey: "2026-01-01",
  }));
const baseList = (items: ReturnType<typeof makeItems>) => ({
  rawItems: items,
  objFiltered: items,
  days: ["2026-01-02", "2026-01-01"],
  newestDay: "2026-01-01",
  activeDay: "2026-01-01",
  videoCount: 0,
  imageCount: items.length,
});

/** Records what each observer watches; tests fire entries by hand. */
class RecordingIO {
  static all: RecordingIO[] = [];
  readonly targets = new Set<Element>();
  constructor(
    readonly cb: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void,
    readonly opts: { rootMargin?: string } = {}
  ) {
    RecordingIO.all.push(this);
  }
  observe(el: Element): void {
    this.targets.add(el);
  }
  unobserve(el: Element): void {
    this.targets.delete(el);
  }
  disconnect(): void {
    this.targets.clear();
  }
  takeRecords(): [] {
    return [];
  }
}

/* Layout stand-in (jsdom has none). Horizontal: 100 px tiles in a row, a
 * 400 px strip. Vertical: 3 columns of 75 px rows, a 400 px tall strip. The
 * strip's scroll offset lives in `__pos`. */
const TILE = 100;
const ROW = 75;
const COLS = 3;
let stripLength = 400;
const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect;

function stubLayout(vertical = false): void {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const el = this as HTMLElement & { __pos?: number };
    if (el.classList.contains("tthumbs")) {
      return vertical ? rect(0, 0, COLS * TILE, stripLength) : rect(0, 0, stripLength, ROW);
    }
    if (el.classList.contains("tthumb")) {
      const i = Number(el.dataset["i"]);
      const pos = (el.parentElement as { __pos?: number } | null)?.__pos ?? 0;
      return vertical
        ? rect((i % COLS) * TILE, Math.floor(i / COLS) * ROW - pos, TILE, ROW)
        : rect(i * TILE - pos, 0, TILE, ROW);
    }
    return rect(0, 0, 0, 0);
  });
}

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  vi.stubGlobal("IntersectionObserver", RecordingIO);
  await import("../index.js");
});

beforeEach(() => {
  RecordingIO.all = [];
  stripLength = 400;
  vi.stubGlobal("IntersectionObserver", RecordingIO);
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

async function renderGallery(count: number, options: Record<string, unknown> = {}) {
  stubLayout(options["thumb_layout"] === "vertical");
  const card: any = document.createElement("camera-gallery-card");
  for (const method of [
    "_startMediaPoll",
    "_subscribeFrigateEvents",
    "_mountLiveCard",
    "_scheduleVisibleMediaWork",
    "_queueSensorPosterWork",
    "_queueSnapshotResolveForVisibleThumbs",
  ]) {
    vi.spyOn(card, method).mockImplementation(() => {});
  }
  vi.spyOn(card._posterClient, "prewarm").mockResolvedValue(undefined);
  vi.spyOn(card, "_computeBaseList").mockReturnValue(baseList(makeItems(count)));
  card.setConfig({
    entities: ["sensor.synthetic"],
    path_datetime_format: "YYYY-MM-DD",
    thumb_size: TILE,
    max_media: 350,
    ...options,
  });
  card._hass = { states: {}, locale: { language: "en" } };
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const strip = (card: any): HTMLElement & { __pos?: number } =>
  card.shadowRoot.querySelector(".tthumbs");
const boxes = (card: any): HTMLElement[] => [...strip(card).children] as HTMLElement[];
const tiles = (card: any): HTMLElement[] => [
  ...card.shadowRoot.querySelectorAll(".tthumbs > button.tthumb"),
];
const placeholders = (card: any): HTMLElement[] => [
  ...card.shadowRoot.querySelectorAll(".tthumbs > .tthumb-ph"),
];
const realRange = (card: any): [number, number] => {
  const t = tiles(card);
  return [Number(t[0]?.dataset["i"]), Number(t[t.length - 1]?.dataset["i"]) + 1];
};
const revealIO = (): RecordingIO | undefined => RecordingIO.all[RecordingIO.all.length - 1];

/** One scroll event with the strip at `pos` px, `ms` after the last one. */
async function scrollStrip(card: any, pos: number, ms = 16): Promise<void> {
  vi.advanceTimersByTime(ms);
  const el = strip(card);
  el.__pos = pos;
  el.dispatchEvent(new Event("scroll"));
  await card.updateComplete;
}
/** A fling: a scroll event per frame, `step` px apart. */
async function flingStrip(card: any, from: number, to: number, step = 200): Promise<void> {
  const dir = Math.sign(to - from);
  for (let pos = from + dir * step; dir * (to - pos) > 0; pos += dir * step) {
    await scrollStrip(card, pos);
  }
  await scrollStrip(card, to);
}
/** Lets the post-render coverage check (one animation frame) run. */
async function settleFrame(card: any): Promise<void> {
  vi.advanceTimersByTime(16);
  await card.updateComplete;
}

describe("thumbnail strip window", () => {
  it("renders the first window of a long day and same-size placeholders for the rest", async () => {
    const card = await renderGallery(300);
    expect(tiles(card)).toHaveLength(THUMB_WINDOW);
    expect(realRange(card)).toEqual([0, THUMB_WINDOW]);
    // the strip has every item's box from the start: full scroll extent
    const all = boxes(card);
    expect(all).toHaveLength(300);
    expect(all.map((b) => Number(b.dataset["i"]))).toEqual([...Array(300).keys()]);
    const ph = placeholders(card);
    expect(ph).toHaveLength(300 - THUMB_WINDOW);
    expect(ph[0]!.getAttribute("style")).toBe(tiles(card)[0]!.getAttribute("style"));
    expect(ph[0]!.getAttribute("aria-hidden")).toBe("true");
    // placeholders load nothing and are not watched by the reveal observer
    expect(ph.some((p) => p.hasAttribute("data-lazy-src") || p.querySelector("img"))).toBe(false);
    expect(revealIO()!.targets.size).toBe(THUMB_WINDOW);
  });

  it("short days render whole", async () => {
    const card = await renderGallery(10);
    expect(tiles(card)).toHaveLength(10);
    expect(placeholders(card)).toHaveLength(0);
    await flingStrip(card, 0, 600);
    expect(tiles(card)).toHaveLength(10);
  });

  it("stops at max_media", async () => {
    const card = await renderGallery(300, { max_media: 30 });
    expect(boxes(card)).toHaveLength(30);
    await flingStrip(card, 0, 30 * TILE - stripLength);
    expect(tiles(card)).toHaveLength(30);
    expect(placeholders(card)).toHaveLength(0);
  });

  it("fills a wide strip on first paint", async () => {
    stripLength = 1200; // 12 tiles visible, 2 strip-lengths ahead = tile 36
    const card = await renderGallery(300);
    expect(tiles(card)).toHaveLength(THUMB_WINDOW);
    await settleFrame(card);
    expect(realRange(card)).toEqual([0, 2 * THUMB_WINDOW]);
    await settleFrame(card);
    expect(realRange(card)).toEqual([0, 2 * THUMB_WINDOW]);
  });

  it("does nothing while the strip scrolls within the window", async () => {
    const card = await renderGallery(300);
    const before = tiles(card);
    const render = vi.spyOn(card, "render");
    await flingStrip(card, 0, 300, 50);
    await settleFrame(card);
    expect(render).not.toHaveBeenCalled();
    expect(tiles(card)).toEqual(before);
  });

  it("slides with the strip and hands far tiles back to placeholders", async () => {
    const card = await renderGallery(300);
    await flingStrip(card, 0, 3000);
    expect(realRange(card)).toEqual([0, 2 * THUMB_WINDOW]);
    const kept = tiles(card).find((t) => t.dataset["i"] === "40")!;
    await flingStrip(card, 3000, 9000);
    // at tile 90: tiles 82-101 plus the margins are needed; at most
    // THUMB_WINDOW_MAX stay real, the farthest blocks go back first
    expect(realRange(card)).toEqual([2 * THUMB_WINDOW, 5 * THUMB_WINDOW]);
    expect(tiles(card)).toHaveLength(THUMB_WINDOW_MAX);
    expect(boxes(card)[0]!.classList).toContain("tthumb-ph");
    expect(boxes(card)).toHaveLength(300);
    expect(kept.isConnected).toBe(false);
    // and back
    await flingStrip(card, 9000, 0);
    expect(realRange(card)).toEqual([0, 3 * THUMB_WINDOW]);
  });

  it(
    "follows a fling to the end of the day, never holding more than the maximum",
    {
      timeout: 20_000,
    },
    async () => {
      const card = await renderGallery(288);
      let most = 0;
      const end = 288 * TILE - stripLength;
      for (let pos = 300; pos < end; pos += 300) {
        await scrollStrip(card, pos);
        most = Math.max(most, tiles(card).length);
        const [lo, hi] = realRange(card);
        const first = Math.floor(pos / TILE);
        expect(lo).toBeLessThanOrEqual(first);
        expect(hi).toBeGreaterThanOrEqual(Math.min(288, first + stripLength / TILE));
      }
      await scrollStrip(card, end);
      expect(most).toBeLessThanOrEqual(THUMB_WINDOW_MAX);
      expect(realRange(card)[1]).toBe(288);
    }
  );

  it("a strip that jumped past the window is filled once it settles", async () => {
    const card = await renderGallery(300);
    await scrollStrip(card, 15000); // tile 150, far outside the window
    expect(realRange(card)).toEqual([0, THUMB_WINDOW]);
    vi.advanceTimersByTime(THUMB_WINDOW_SETTLE_MS - 1);
    await card.updateComplete;
    expect(realRange(card)).toEqual([0, THUMB_WINDOW]);
    vi.advanceTimersByTime(1);
    await card.updateComplete;
    // tiles 142-161 needed (visible + margins), in whole blocks
    expect(realRange(card)).toEqual([5 * THUMB_WINDOW, 7 * THUMB_WINDOW]);
    expect(tiles(card).length).toBeLessThanOrEqual(THUMB_WINDOW_MAX);
  });

  it("…or within twice the settle time if it keeps moving", async () => {
    const card = await renderGallery(300);
    await scrollStrip(card, 15000);
    let pos = 15000;
    let waited = 0;
    while (realRange(card)[0] === 0 && waited < 1000) {
      pos += 20;
      await scrollStrip(card, pos);
      waited += 16;
    }
    expect(waited).toBeGreaterThanOrEqual(2 * THUMB_WINDOW_SETTLE_MS - 16);
    expect(waited).toBeLessThanOrEqual(2 * THUMB_WINDOW_SETTLE_MS + 16);
    const [lo, hi] = realRange(card);
    expect(lo).toBeLessThanOrEqual(Math.floor(pos / TILE));
    expect(hi).toBeGreaterThanOrEqual(Math.floor(pos / TILE) + stripLength / TILE);
  });

  it("makes the tile the viewer moves to real, with its neighbours (viewer swipes, fullscreen nav)", async () => {
    const card = await renderGallery(300);
    const scroll = vi.spyOn(card, "_scrollThumbIntoView");
    card._selectedIndex = 100;
    card._pendingScrollToI = 100;
    await card.updateComplete;
    const [lo, hi] = realRange(card);
    expect(lo).toBeLessThanOrEqual(100 - THUMB_WINDOW_AHEAD);
    expect(hi).toBeGreaterThanOrEqual(101 + THUMB_WINDOW_AHEAD);
    expect(tiles(card).length).toBeLessThanOrEqual(THUMB_WINDOW_MAX);
    expect(card.shadowRoot.querySelector('button.tthumb[data-i="100"]')?.classList).toContain("on");
    expect(scroll).toHaveBeenCalledWith(100);
    // swiping on keeps the strip as it is
    const before = tiles(card);
    card._navPrev();
    await card.updateComplete;
    expect(tiles(card)).toEqual(before);
  });

  it("a new day starts the window over", async () => {
    const card = await renderGallery(300);
    await flingStrip(card, 0, 9000);
    expect(realRange(card)[0]).toBeGreaterThan(0);
    card._stepDay(1, ["2026-01-02", "2026-01-01"], "2026-01-02");
    await card.updateComplete;
    expect(realRange(card)).toEqual([0, THUMB_WINDOW]);
  });

  it("a new item keeps the existing tiles (keyed), adds one and drops one", async () => {
    const card = await renderGallery(300);
    const before = tiles(card);
    card._computeBaseList.mockReturnValue(baseList([...makeItems(1, -1), ...makeItems(300)]));
    card.requestUpdate();
    await card.updateComplete;
    const after = tiles(card);
    expect(after).toHaveLength(THUMB_WINDOW);
    expect(after.slice(1)).toEqual(before.slice(0, -1));
    expect(after[1]!.dataset["i"]).toBe("1");
    expect(before.includes(after[0]!)).toBe(false);
    expect(before[before.length - 1]!.isConnected).toBe(false);
    // the new tile is watched, the dropped one is not
    const io = revealIO()!;
    expect(io.targets.has(after[0]!)).toBe(true);
    expect([...io.targets].every((t) => t.isConnected)).toBe(true);
    expect(io.targets.size).toBe(THUMB_WINDOW);
  });

  it("the reveal observer only watches real tiles while the window moves", async () => {
    const card = await renderGallery(300);
    await flingStrip(card, 0, 9000);
    const io = revealIO()!;
    expect(io.targets.size).toBe(tiles(card).length);
    expect([...io.targets].every((t) => t.isConnected && t.tagName === "BUTTON")).toBe(true);
  });

  it("re-arms the reveal observer when HA re-attaches the card", async () => {
    const card = await renderGallery(300);
    expect(revealIO()!.targets.size).toBe(THUMB_WINDOW);
    card.remove();
    expect(revealIO()!.targets.size).toBe(0);
    document.body.append(card);
    // no render needed: the DOM survived, only the observer was torn down
    expect(revealIO()!.targets.size).toBe(THUMB_WINDOW);
    expect([...revealIO()!.targets]).toEqual(tiles(card));
  });

  it("queues snapshot and poster work for the window's tiles only", async () => {
    const card = await renderGallery(300);
    await flingStrip(card, 0, 9000);
    const [lo, hi] = realRange(card);
    const items = makeItems(300);
    const snap = card._queueSnapshotResolveForVisibleThumbs.mock.calls.at(-1)[0];
    const srcs = (list: Array<{ src: string }>) => list.map((item) => item.src);
    expect(srcs(snap)).toEqual(srcs(items.slice(lo, hi)));
    const posters = card._queueSensorPosterWork.mock.calls.at(-1)[0];
    expect(srcs(posters)).toEqual(srcs(items.slice(lo, hi + 6)));
  });

  it("measures the vertical grid by rows", async () => {
    const card = await renderGallery(300, { thumb_layout: "vertical" });
    await settleFrame(card);
    // 400 px tall strip + 800 px below = rows 0-15 = tiles 0-47
    expect(realRange(card)).toEqual([0, 2 * THUMB_WINDOW]);
    await settleFrame(card);
    expect(realRange(card)).toEqual([0, 2 * THUMB_WINDOW]);
  });
});

describe("thumbnail favourite star", () => {
  // HA's own mdi:star / mdi:star-outline paths (read from a live <ha-icon>).
  const STAR =
    "M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z";
  const STAR_OUTLINE =
    "M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.63L12,2L9.19,8.63L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.97L22,9.24Z";

  it("draws the star as inline SVG, filled for favourites", async () => {
    const card = await renderGallery(3);
    const favSrc = makeItems(3)[1]!.src;
    vi.spyOn(card._favorites, "has").mockImplementation((src: unknown) => src === favSrc);
    card.requestUpdate();
    await card.updateComplete;
    const stars = tiles(card).map((t) => t.querySelector(".fav-btn")!);
    expect(stars).toHaveLength(3);
    expect(stars.some((s) => s.querySelector("ha-icon"))).toBe(false);
    expect(stars.map((s) => s.classList.contains("on"))).toEqual([false, true, false]);
    expect(stars.map((s) => s.querySelector("svg.fav-icon > path")!.getAttribute("d"))).toEqual([
      STAR_OUTLINE,
      STAR,
      STAR_OUTLINE,
    ]);
  });

  it("show_favorite: false hides it", async () => {
    const card = await renderGallery(3, { show_favorite: false });
    expect(tiles(card)).toHaveLength(3);
    expect(card.shadowRoot.querySelector(".fav-btn")).toBeNull();
  });
});
