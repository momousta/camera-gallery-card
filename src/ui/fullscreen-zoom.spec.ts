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
