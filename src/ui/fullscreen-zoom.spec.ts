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

const wheel = (deltaY: number): WheelEvent =>
  new WheelEvent("wheel", { deltaY, clientX: 0, clientY: 0, bubbles: true, cancelable: true });

describe("fullscreen image viewer zoom (#245)", () => {
  it("zooms the fullscreen image, never the hidden preview, and resets on close", async () => {
    const card = await renderCard();
    card._previewOpen = true; // the state in which #245 zoomed the hidden preview
    card._openImageFullscreen();
    await card.updateComplete;
    const fsImg = card.shadowRoot.querySelector(".img-fs-overlay img") as HTMLElement;
    const preview = card.shadowRoot.querySelector(".preview img.pimg") as HTMLElement;
    expect(fsImg).not.toBeNull();
    card.dispatchEvent(wheel(-100));
    expect(card._zoomScale).toBeGreaterThan(1);
    expect(fsImg.style.transform).toContain("scale(");
    expect(preview?.style.transform ?? "").toBe("");
    card._closeImageFullscreen();
    await card.updateComplete;
    expect(card._zoomScale).toBe(1);
    card._openImageFullscreen();
    await card.updateComplete;
    expect(card._zoomScale).toBe(1);
  });

  it("fullscreen_zoom: false leaves the fullscreen image alone", async () => {
    const card = await renderCard({ fullscreen_zoom: false });
    card._openImageFullscreen();
    await card.updateComplete;
    card.dispatchEvent(wheel(-100));
    expect(card._zoomScale).toBe(1);
  });
});

describe("BL-008: landscape full screen on a portrait screen", () => {
  const overlay = (card: any) => card.shadowRoot.querySelector(".img-fs-overlay");
  const fsImg = (card: any) => card.shadowRoot.querySelector(".img-fs-overlay img");
  const screenIs = (portrait: boolean) =>
    vi.stubGlobal("matchMedia", (m: string) => ({
      matches: m.includes("portrait") ? portrait : false,
      addEventListener() {},
      removeEventListener() {},
    }));
  async function loadAs(card: any, w: number, h: number) {
    const img = fsImg(card);
    Object.defineProperty(img, "naturalWidth", { configurable: true, value: w });
    Object.defineProperty(img, "naturalHeight", { configurable: true, value: h });
    img.dispatchEvent(new Event("load"));
    await card.updateComplete;
  }
  async function openTurned() {
    screenIs(true);
    vi.stubGlobal("DeviceMotionEvent", class {});
    const card = await renderCard();
    card._openImageFullscreen();
    await card.updateComplete;
    await loadAs(card, 400, 300);
    return card;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver); // the file's own, kept for the card's timers
    delete (HTMLElement.prototype as any).requestFullscreen;
    delete (ShadowRoot.prototype as any).fullscreenElement;
    delete (document as any).exitFullscreen;
  });

  it("turns a landscape picture, not a portrait one, nor on a landscape screen; and follows the phone", async () => {
    screenIs(true);
    vi.stubGlobal("DeviceMotionEvent", class {});
    const card = await renderCard();
    card._openImageFullscreen();
    await card.updateComplete;
    expect(overlay(card).classList.contains("turned")).toBe(false); // until the picture says what it is
    await loadAs(card, 400, 300);
    expect(overlay(card).classList.contains("turned")).toBe(true);
    expect(overlay(card).getAttribute("style")).toBe("--cgc-fs-rot:90deg");
    const motion: any = new Event("devicemotion");
    motion.accelerationIncludingGravity = { x: -9.4, y: 0, z: 0 }; // held with its top to the right
    window.dispatchEvent(motion);
    await card.updateComplete;
    expect(overlay(card).getAttribute("style")).toBe("--cgc-fs-rot:-90deg");
    await loadAs(card, 300, 400); // a portrait picture fits a portrait screen as it is
    expect(overlay(card).classList.contains("turned")).toBe(false);
    screenIs(false);
    await loadAs(card, 400, 300);
    expect(overlay(card).classList.contains("turned")).toBe(false); // the screen is landscape already
    card._closeImageFullscreen();
    await card.updateComplete;
    expect(overlay(card)).toBeNull();
  });

  it("a turned picture pans with the finger, and zooms on the point under it", async () => {
    const card = await openTurned();
    const img = fsImg(card);
    Object.defineProperty(img, "offsetWidth", { configurable: true, value: 400 });
    Object.defineProperty(img, "offsetHeight", { configurable: true, value: 300 });
    img.getBoundingClientRect = () =>
      ({ left: 50, top: 250, width: 300, height: 400, right: 350, bottom: 650 }) as DOMRect;
    // Double tap 60 px right of the centre (200, 450): in the turned picture that is 60 px towards its top.
    card._toggleFullscreenZoom(260, 450);
    expect(card._zoomScale).toBe(2.5);
    expect([card._zoomPanX + 0, card._zoomPanY + 0]).toEqual([0, 90]); // the point stays under the finger
    // A finger moving 60 px right on the screen moves the turned picture 60 px "up" in its own frame.
    card._zoomPanX = 0;
    card._zoomPanY = 0;
    card._onZoomTouchStart({ touches: [{ clientX: 100, clientY: 100 }], preventDefault() {} });
    card._onZoomTouchMove({ touches: [{ clientX: 160, clientY: 100 }], preventDefault() {} });
    expect([card._zoomPanX + 0, card._zoomPanY + 0]).toEqual([0, -60]);
  });

  it("asks for the real full screen (no system bars), and leaves it on close", async () => {
    let inner: Element | null = null;
    const enter = (el: Element) => {
      inner = el;
    };
    const request = vi.fn(async function (this: Element) {
      enter(this);
    });
    const exit = vi.fn(async () => {
      inner = null;
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
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    const card = await openTurned();
    for (let i = 0; i < 3; i++) await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.contexts[0]).toBe(overlay(card));
    card._closeImageFullscreen();
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
