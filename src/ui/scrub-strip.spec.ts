// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const img = (n: number): string =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><text>${n}</text></svg>`
  );
const ITEMS = [0, 1, 2, 3, 4].map((n) => ({
  src: img(n),
  dtMs: 1_700_000_000_000 - n * 60_000,
  dayKey: "2026-01-01",
}));

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

async function renderGallery(options: Record<string, unknown> = {}) {
  const card: any = document.createElement("camera-gallery-card");
  for (const method of [
    "_startMediaPoll",
    "_subscribeFrigateEvents",
    "_mountLiveCard",
    "_setupThumbObserver",
    "_scheduleVisibleMediaWork",
    "_queueSensorPosterWork",
    "_queueSnapshotResolveForVisibleThumbs",
  ]) {
    vi.spyOn(card, method).mockImplementation(() => {});
  }
  vi.spyOn(card._posterClient, "prewarm").mockResolvedValue(undefined);
  vi.spyOn(card, "_computeBaseList").mockReturnValue({
    rawItems: ITEMS,
    objFiltered: ITEMS,
    days: ["2026-01-01"],
    newestDay: "2026-01-01",
    activeDay: "2026-01-01",
    videoCount: 0,
    imageCount: ITEMS.length,
  });
  card.setConfig({
    entities: ["sensor.synthetic"],
    path_datetime_format: "YYYY-MM-DD",
    thumb_size: 100,
    ...options,
  });
  card._hass = { states: {}, locale: { language: "en" } };
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const strip = (card: any): HTMLElement => card.shadowRoot.querySelector(".tthumbs");
const thumb = (card: any, i: number): HTMLElement =>
  card.shadowRoot.querySelector(`button.tthumb[data-i="${i}"]`);
const pe = (type: string, x: number, pointerType = "mouse"): PointerEvent =>
  new (window.PointerEvent ?? MouseEvent)(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    clientX: x,
    clientY: 10,
    button: 0,
    ...({ pointerId: 1, pointerType, isPrimary: true } as object),
  }) as PointerEvent;

/** jsdom has no layout: lay the thumbs out 110 px apart, strip 300 px wide. */
function fakeLayout(card: any, scrollLeft: () => number): void {
  const s = strip(card);
  s.getBoundingClientRect = () =>
    ({
      left: 0,
      right: 300,
      top: 0,
      bottom: 100,
      width: 300,
      height: 100,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  for (const t of card.shadowRoot.querySelectorAll(".tthumb")) {
    const i = Number((t as HTMLElement).dataset["i"]);
    (t as HTMLElement).getBoundingClientRect = () => {
      const left = 100 + i * 110 - scrollLeft();
      return {
        left,
        right: left + 100,
        top: 0,
        bottom: 100,
        width: 100,
        height: 100,
        x: left,
        y: 0,
        toJSON() {},
      } as DOMRect;
    };
  }
}

describe("scrub_on_drag off (default) leaves the strip untouched", () => {
  it("adds no class, playhead or listeners", async () => {
    const card = await renderGallery();
    expect(strip(card).classList.contains("scrub")).toBe(false);
    expect(card.shadowRoot.querySelector(".scrub-playhead")).toBeNull();
    // a drag on the strip does nothing scrub-related
    thumb(card, 0).dispatchEvent(pe("pointerdown", 100));
    strip(card).dispatchEvent(pe("pointermove", 20));
    expect(card._scrubGesture.active).toBe(false);
  });

  it("tap still selects", async () => {
    const card = await renderGallery();
    thumb(card, 2).click();
    await card.updateComplete;
    expect(card._selectedIndex).toBe(2);
  });
});

describe("scrub_on_drag on", () => {
  it("renders the playhead and the scrub strip", async () => {
    const card = await renderGallery({ scrub_on_drag: true });
    expect(strip(card).classList.contains("scrub")).toBe(true);
    expect(card.shadowRoot.querySelector(".scrub-playhead")).not.toBeNull();
  });

  it("is ignored for the vertical grid layout", async () => {
    const card = await renderGallery({ scrub_on_drag: true, thumb_layout: "vertical" });
    expect(strip(card).classList.contains("scrub")).toBe(false);
  });

  it("tap selects and doesn't leave the strip user-driven", async () => {
    const card = await renderGallery({ scrub_on_drag: true });
    thumb(card, 3).dispatchEvent(pe("pointerdown", 400));
    thumb(card, 3).dispatchEvent(pe("pointerup", 400));
    thumb(card, 3).click();
    await card.updateComplete;
    expect(card._selectedIndex).toBe(3);
    expect(card._scrubGesture.active).toBe(false);
    expect(card._scrubbing).toBe(false);
  });

  it("follows the thumb under the playhead, shows its thumbnail, loads the item on settle", async () => {
    const card = await renderGallery({ scrub_on_drag: true });
    let scroll = 0;
    fakeLayout(card, () => scroll);
    const s = strip(card);
    // mouse drag: press on thumb 0, drag left by 230 px
    thumb(card, 0).dispatchEvent(pe("pointerdown", 250));
    s.dispatchEvent(pe("pointermove", 240));
    s.dispatchEvent(pe("pointermove", 20));
    expect(card._scrubGesture.dragging).toBe(true);
    scroll = 230; // what the browser does with scrollLeft = 230
    s.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20); // rAF
    await card.updateComplete;
    // centre = 150; thumb i centre = 150 + 110 i - 230 → i = 2 is nearest
    expect(card._selectedIndex).toBe(2);
    expect(card._scrubbing).toBe(true);
    const frame = card.shadowRoot.querySelector(".preview img.pimg.scrub-frame");
    expect(frame).not.toBeNull();

    // release: the click it ends with is swallowed, then the gesture settles
    s.dispatchEvent(pe("pointerup", 20));
    thumb(card, 1).click();
    expect(card._selectedIndex).toBe(2);
    vi.advanceTimersByTime(200);
    await card.updateComplete;
    expect(card._scrubbing).toBe(false);
    expect(card.shadowRoot.querySelector(".preview img.pimg.scrub-frame")).toBeNull();
    expect(card.shadowRoot.querySelector(".preview img.pimg")!.getAttribute("src")).toBe(
      ITEMS[2]!.src
    );
  });

  it("wheel scrubs with snap off and snaps back on settle", async () => {
    const card = await renderGallery({ scrub_on_drag: true });
    let scroll = 0;
    fakeLayout(card, () => scroll);
    const s = strip(card);
    Object.defineProperty(s, "scrollWidth", { configurable: true, value: 1000 });
    Object.defineProperty(s, "clientWidth", { configurable: true, value: 300 });
    s.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
    expect(s.classList.contains("dragging")).toBe(true);
    expect(card._scrubGesture.active).toBe(true);
    scroll = 120;
    s.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20);
    await card.updateComplete;
    expect(card._selectedIndex).toBe(1); // centre 150 → thumb 1 (centre 150+110-120=140)
    vi.advanceTimersByTime(200);
    await card.updateComplete;
    expect(s.classList.contains("dragging")).toBe(false);
    expect(card._scrubbing).toBe(false);
  });

  it("programmatic scrolls (no gesture) don't move the selection", async () => {
    const card = await renderGallery({ scrub_on_drag: true });
    let scroll = 0;
    fakeLayout(card, () => scroll);
    scroll = 440;
    strip(card).dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(50);
    await card.updateComplete;
    expect(card._selectedIndex ?? 0).toBe(0);
    expect(card._scrubbing).toBe(false);
  });
});
