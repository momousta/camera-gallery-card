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

describe("BL-008: the strip coming to rest plays the NVR's Low stream quietly", () => {
  beforeEach(async () => {
    // The player itself is tested on its own (nvr-player.spec); here only what the gallery asks of it.
    const proto = customElements.get("cgc-nvr-player")!.prototype as any;
    vi.spyOn(proto, "_begin").mockImplementation(() => {});
    ((await import("../nvr/nvr-player.js")) as any).resetNvrShared();
  });

  it("asks the add-on to list the camera's day when it first shows, unless auto-play is off", async () => {
    for (const [options, expected] of [
      [{ nvr_channel: 7 }, [{ channel: 7 }]],
      [{ nvr_channel: 6, nvr_autoplay: false }, []],
      [{}, []],
    ] as const) {
      const fetches: any[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: any) => {
          if (url.endsWith("api/warm")) fetches.push(JSON.parse(init.body));
          return { status: 202, ok: true, json: async () => ({ ok: true }) };
        })
      );
      const card = await renderGallery({ scrub_on_drag: true, ...options });
      ((await import("../nvr/nvr-player.js")) as any).resetNvrShared(); // its first try had no add-on to ask
      card._hass = {
        states: {},
        locale: { language: "en" },
        callWS: async (msg: any) =>
          msg.endpoint === "/addons/local_nvr_playback/info"
            ? { ingress_url: "/api/hassio_ingress/tok/", state: "started" }
            : { session: "s1" },
      };
      card._nvrWarmed = false;
      card.requestUpdate();
      await card.updateComplete;
      for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0);
      expect(fetches).toEqual(expected);
      card.remove();
    }
  });

  const nvrPlayer = (card: any) => card.shadowRoot.querySelector(".preview cgc-nvr-player");

  /** A mouse drag that leaves thumb `to` under the playhead, released, then the settle time. */
  async function scrubTo(card: any, to: number, layout: { scroll: number }) {
    const s = strip(card);
    thumb(card, 0).dispatchEvent(pe("pointerdown", 250));
    s.dispatchEvent(pe("pointermove", 240));
    s.dispatchEvent(pe("pointermove", 20));
    layout.scroll = to * 110; // thumb `to` centred
    s.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20);
    await card.updateComplete;
    s.dispatchEvent(pe("pointerup", 20));
    vi.advanceTimersByTime(200);
    await card.updateComplete;
    await Promise.resolve();
    await card.updateComplete;
  }

  it("starts Low at the moment it rests on, unseen until it plays", async () => {
    const card = await renderGallery({ scrub_on_drag: true, nvr_channel: 7 });
    const layout = { scroll: 0 };
    fakeLayout(card, () => layout.scroll);
    await scrubTo(card, 2, layout);
    expect(card._selectedIndex).toBe(2);
    expect(card._nvr).toMatchObject({
      src: ITEMS[2]!.src,
      time: ITEMS[2]!.dtMs,
      stream: "sub",
      quiet: true,
    });
    const p = nvrPlayer(card);
    expect(p).not.toBeNull();
    expect([p.quiet, p.channel, p.time, p.stream]).toEqual([true, 7, ITEMS[2]!.dtMs, "sub"]);
    expect(p.hasAttribute("quiet")).toBe(true);

    // Shown once it plays: the clip under it is paused then, not before.
    const pause = vi.spyOn(card, "_pausePreviewClip");
    p.dispatchEvent(new CustomEvent("nvr-reveal", { bubbles: true, composed: true }));
    expect(pause).toHaveBeenCalledTimes(1);

    // Coming to rest on it again doesn't start it over.
    const before = card._nvr;
    card._onScrubSettle();
    expect(card._nvr).toBe(before);
  });

  it("scrolling on closes it; resting again starts the new moment", async () => {
    const card = await renderGallery({ scrub_on_drag: true, nvr_channel: 7 });
    const layout = { scroll: 0 };
    fakeLayout(card, () => layout.scroll);
    await scrubTo(card, 2, layout);
    expect(nvrPlayer(card)).not.toBeNull();
    await scrubTo(card, 4, layout);
    expect(card._nvr).toMatchObject({ src: ITEMS[4]!.src, quiet: true });
    expect(nvrPlayer(card).time).toBe(ITEMS[4]!.dtMs);
  });

  it("a tap on a thumbnail doesn't start it", async () => {
    const card = await renderGallery({ scrub_on_drag: true, nvr_channel: 7 });
    thumb(card, 3).dispatchEvent(pe("pointerdown", 400));
    thumb(card, 3).dispatchEvent(pe("pointerup", 400));
    thumb(card, 3).click();
    vi.advanceTimersByTime(500);
    await card.updateComplete;
    expect(card._selectedIndex).toBe(3);
    expect(card._nvr).toBeNull();
  });

  it("not without an NVR channel, nor with nvr_autoplay: false", async () => {
    for (const options of [{}, { nvr_channel: 7, nvr_autoplay: false }]) {
      const card = await renderGallery({ scrub_on_drag: true, ...options });
      const layout = { scroll: 0 };
      fakeLayout(card, () => layout.scroll);
      await scrubTo(card, 2, layout);
      expect(card._selectedIndex).toBe(2);
      expect(card._nvr).toBeNull();
      card.remove();
    }
  });

  it("a quiet start that fails is dropped; one the viewer takes over is no longer quiet", async () => {
    const card = await renderGallery({ scrub_on_drag: true, nvr_channel: 7 });
    const layout = { scroll: 0 };
    fakeLayout(card, () => layout.scroll);
    await scrubTo(card, 1, layout);
    nvrPlayer(card).dispatchEvent(
      new CustomEvent("nvr-close", { detail: { quiet: true }, bubbles: true, composed: true })
    );
    await card.updateComplete;
    expect(card._nvr).toBeNull();
    expect(nvrPlayer(card)).toBeNull();

    await scrubTo(card, 3, layout);
    nvrPlayer(card).dispatchEvent(
      new CustomEvent("nvr-stream", { detail: { stream: "main" }, bubbles: true, composed: true })
    );
    await card.updateComplete;
    expect(card._nvr).toMatchObject({ stream: "main", quiet: false });
    expect(nvrPlayer(card).quiet).toBe(false);
  });
});
