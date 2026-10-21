// @vitest-environment jsdom
// Regression check for upstream #245 (fixed by the cherry-picked PR #253):
// zooming in the fullscreen image viewer must transform the visible
// fullscreen image, not the hidden preview behind it, and start/end at 1x.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const IMG =
  "data:image/svg+xml," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"/>');

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

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function renderCard(options: Record<string, unknown> = {}) {
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
  const items = [{ src: IMG, dtMs: 1, dayKey: "2026-01-01" }];
  vi.spyOn(card, "_computeBaseList").mockReturnValue({
    rawItems: items,
    objFiltered: items,
    days: ["2026-01-01"],
    newestDay: "2026-01-01",
    activeDay: "2026-01-01",
    videoCount: 0,
    imageCount: 1,
  });
  card.setConfig({
    entities: ["sensor.synthetic"],
    path_datetime_format: "YYYY-MM-DD",
    ...options,
  });
  card._hass = { states: {}, locale: { language: "en" } };
  document.body.append(card);
  await card.updateComplete;
  return card;
}

// Owner fork (10-20 16:17): a picture's full screen is the NVR player's own (its still mode), the same viewer as
// a recording's: its turn, controls, zoom and swipes. The gallery's overlay serves video clips only, and
// `fullscreen_zoom` no longer applies to pictures.
const playerOf = (card: any) => card.shadowRoot.querySelector(".preview cgc-nvr-player");

describe("fullscreen image viewer zoom (#245)", () => {
  it("a picture's full screen is the player's (its own zoom), never the hidden preview's", async () => {
    const card = await renderCard();
    card._previewOpen = true; // the state in which #245 zoomed the hidden preview
    card._openImageFullscreen();
    await card.updateComplete;
    expect(playerOf(card)?.still).toBe(IMG);
    expect(card.shadowRoot.querySelector(".img-fs-overlay")).toBeNull();
    // A pinch (Ctrl + wheel) over the picture zooms the player's picture; the hidden preview never.
    const p = playerOf(card);
    await new Promise((r) => setTimeout(r, 0)); // its full screen is on (here the window-covering one)
    await p.updateComplete;
    expect(p._fullscreen).toBe(true);
    p.shadowRoot.querySelector(".nvr-tap").dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -100,
        ctrlKey: true,
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
    await p.updateComplete;
    expect(p._zoom.s).toBeGreaterThan(1);
    expect(card._zoomScale).toBe(1);
    const preview = card.shadowRoot.querySelector(".preview img.pimg") as HTMLElement | null;
    expect(preview?.style.transform ?? "").toBe("");
  });
});

describe("BL-008: landscape full screen on a portrait screen (a picture: the player's)", () => {
  const screenIs = (portrait: boolean) =>
    vi.stubGlobal("matchMedia", (m: string) => ({
      matches: m.includes("portrait") ? portrait : false,
      addEventListener() {},
      removeEventListener() {},
    }));

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver); // the file's own, kept for the card's timers
    delete (HTMLElement.prototype as any).requestFullscreen;
    delete (ShadowRoot.prototype as any).fullscreenElement;
    delete (document as any).fullscreenElement;
    delete (document as any).exitFullscreen;
  });

  it("asks for the document's full screen, covers it with the player, turns a landscape picture (not a portrait one), and ends back in the gallery", async () => {
    screenIs(true);
    vi.stubGlobal("DeviceMotionEvent", class {});
    let inner: Element | null = null;
    const enter = (el: Element) => {
      inner = el;
    };
    const request = vi.fn(async function (this: Element) {
      enter(this);
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: request,
    });
    Object.defineProperty(ShadowRoot.prototype, "fullscreenElement", {
      configurable: true,
      get(this: ShadowRoot) {
        return inner && this.contains(inner) ? inner : null;
      },
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => inner,
    });
    const card = await renderCard();
    card._openImageFullscreen();
    await card.updateComplete;
    const p = playerOf(card);
    await p.updateComplete;
    for (let i = 0; i < 3; i++) await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    // The whole document (it stays full screen across a swipe to the next camera's page); the player covers it.
    expect(request.mock.contexts[0]).toBe(document.documentElement);
    document.dispatchEvent(new Event("fullscreenchange"));
    await p.updateComplete;
    expect(p._fullscreen).toBe(true);
    expect(p._pseudo).toBe(true);
    const img = p.shadowRoot.querySelector("img.nvr-still");
    Object.defineProperty(img, "naturalWidth", { configurable: true, value: 400 });
    Object.defineProperty(img, "naturalHeight", { configurable: true, value: 300 });
    img.dispatchEvent(new Event("load"));
    await p.updateComplete;
    expect(p._turn()).toBe(90); // landscape on a portrait screen: turned
    Object.defineProperty(img, "naturalWidth", { configurable: true, value: 300 });
    Object.defineProperty(img, "naturalHeight", { configurable: true, value: 400 });
    img.dispatchEvent(new Event("load"));
    await p.updateComplete;
    expect(p._turn()).toBe(0); // a portrait picture fits a portrait screen as it is
    inner = null; // left full screen
    document.dispatchEvent(new Event("fullscreenchange"));
    await card.updateComplete;
    expect(card._nvr).toBeNull();
    expect(playerOf(card)).toBeNull();
  });
});
