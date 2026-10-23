// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ThumbPreloader } from "../data/preload";

// BL-007: every camera on one timeline.

const NOW = new Date(2026, 9, 19, 14, 0, 0);
const W = (cam: string, name: string) => `/config/www/snapshots/${cam}/${name}`;
const L = (cam: string, name: string) => `/local/snapshots/${cam}/${name}`;
const P = (cam: string, name: string) => `/local/snapshots/${cam}/thumbs/${name}.jpg`;

const FILES: Record<string, string[]> = {
  "sensor.ft_front": [
    W("front", "hourly_20261019_120000.gif"),
    W("front", "car_20261019_124500_snapshot.jpg"),
    W("front", "motion_20261019_133000.gif"),
    W("front", "motion_20261018_220000.gif"),
  ],
  "sensor.ft_back": [
    W("back", "person_20261019_090000.gif"),
    W("back", "hourly_20261017_100000.gif"),
  ],
  "sensor.ft_door": [
    W("door", "snapshot_20261019_135500.jpg"),
    W("door", "visitor_20261019_131000.mp4"),
  ],
};

const hassWith = (files = FILES) => ({
  states: Object.fromEntries(
    Object.entries(files).map(([entity, fileList]) => [
      entity,
      { entity_id: entity, state: "1", attributes: { fileList } },
    ])
  ),
  locale: { language: "en-US", time_format: "12", first_weekday: "sunday" },
});

const CONFIG = {
  type: "custom:camera-timeline-card",
  path_datetime_format: "YYYYMMDD_HHmmss",
  thumbnail_folder: "thumbs",
  cameras: [
    {
      entity: "sensor.ft_front",
      name: "Front",
      navigation_path: "/main-dashboard/camera1",
      gallery_id: "camera1",
    },
    { entity: "sensor.ft_back", name: "Back" },
    { entity: "sensor.ft_door", name: "Doorbell" },
  ],
};

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../index.js");
});

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16)
  );
  vi.stubGlobal("cancelAnimationFrame", (h: number) => clearTimeout(h));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render(config: Record<string, unknown> = {}, files = FILES) {
  const card: any = document.createElement("camera-timeline-card");
  card.setConfig({ ...CONFIG, ...config });
  card.hass = hassWith(files);
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const $ = (card: any, sel: string) => card.shadowRoot.querySelector(sel);
const $$ = (card: any, sel: string) => [...card.shadowRoot.querySelectorAll(sel)] as HTMLElement[];
const tileSrcs = (card: any) =>
  $$(card, ".tl-tile").map(
    (t) => t.querySelector("img.tl-img")?.getAttribute("src") ?? t.textContent!.trim()
  );
const at = (h: number, m = 0, day = 19) => new Date(2026, 9, day, h, m).getTime();

async function settle(card: any, ms = 50) {
  await vi.advanceTimersByTimeAsync(ms);
  await card.updateComplete;
}

describe("tiles follow the shared moment", () => {
  it("opens on today at now, each camera on its latest frame", async () => {
    const card = await render();
    expect(card._day).toBe("2026-10-19");
    expect(card._t).toBe(NOW.getTime());
    expect(tileSrcs(card)).toEqual([
      P("front", "motion_20261019_133000.gif"),
      P("back", "person_20261019_090000.gif"),
      P("door", "snapshot_20261019_135500.jpg"),
    ]);
    const tiles = $$(card, ".tl-tile");
    expect(tiles[1]!.classList.contains("stale")).toBe(true); // 5 h old
    expect(tiles[0]!.classList.contains("stale")).toBe(false);
    expect(tiles[0]!.textContent).toContain("−30 min");
  });

  it("each camera shows its frame at or before the moment; none before its first clip of the day", async () => {
    const card = await render();
    card._setT(at(12, 50));
    await card.updateComplete;
    const [front, back, door] = tileSrcs(card);
    expect(front).toBe(P("front", "car_20261019_124500_snapshot.jpg"));
    expect(back).toBe(P("back", "person_20261019_090000.gif"));
    expect(door).toContain("No clips yet"); // the doorbell's first clip today is at 13:10
    card._setT(at(8));
    await card.updateComplete;
    const texts = $$(card, ".tl-tile").map((t) => t.textContent!.replace(/\s+/g, " ").trim());
    expect(texts[0]).toContain("No clips yet");
    expect(texts[1]).toContain("No clips yet");
  });

  it("a video without a preview shows a placeholder, never the video file", async () => {
    const card = await render();
    card._setT(at(13, 20));
    card._failed.add(L("door", "visitor_20261019_131000.mp4"));
    card.requestUpdate();
    await card.updateComplete;
    const tile = $$(card, ".tl-tile")[2]!;
    expect(tile.querySelector("img")).toBeNull();
    expect(tile.querySelector("ha-icon")?.getAttribute("icon")).toBe("mdi:filmstrip");
  });

  it("a preview that fails falls back to the photo itself", async () => {
    const card = await render();
    card._setT(at(12, 50));
    await card.updateComplete;
    $$(card, ".tl-tile")[0]!.querySelector("img")!.dispatchEvent(new Event("error"));
    await card.updateComplete;
    expect(tileSrcs(card)[0]).toBe(L("front", "car_20261019_124500_snapshot.jpg"));
  });
});

describe("the time track", () => {
  it("dragging the track moves the moment and every camera with it", async () => {
    const card = await render();
    const el = $(card, ".tl-scroll") as HTMLElement;
    let left = 0;
    Object.defineProperty(el, "scrollLeft", {
      get: () => left,
      set: (v) => (left = v),
      configurable: true,
    });
    card._syncedLeft = null;
    left = (12 * 60 + 50) * 4; // 12:50 at 4 px/min
    el.dispatchEvent(new Event("scroll"));
    await settle(card);
    expect(card._t).toBe(at(12, 50));
    expect(tileSrcs(card)[0]).toBe(P("front", "car_20261019_124500_snapshot.jpg"));
  });

  it("plays forward, and a touch on the track pauses everything", async () => {
    const card = await render();
    const start = at(12, 44) + 30_000;
    card._setT(start, { scroll: true });
    await card.updateComplete;
    expect(tileSrcs(card)[0]).toBe(P("front", "hourly_20261019_120000.gif"));
    ($(card, ".tl-ctrls .tl-btn") as HTMLButtonElement).click();
    expect(card._playing).toBe(true);
    await settle(card, 1000); // 1 s at 1 min/s: past the 12:45 car snapshot
    expect(card._t).toBeGreaterThanOrEqual(start + 50_000);
    expect(tileSrcs(card)[0]).toBe(P("front", "car_20261019_124500_snapshot.jpg"));
    $(card, ".tl-scroll").dispatchEvent(new Event("touchstart"));
    expect(card._playing).toBe(false);
    const frozen = card._t;
    await settle(card, 500);
    expect(card._t).toBe(frozen);
  });

  it("zoom keeps the moment and changes the scale", async () => {
    const card = await render();
    const before = card._t;
    const zoomIn = $$(card, ".tl-ctrls .tl-btn").find(
      (b) => b.getAttribute("aria-label") === "Zoom in"
    )!;
    zoomIn.click();
    await card.updateComplete;
    expect(card._ppm()).toBe(8);
    expect(card._t).toBe(before);
    expect(($(card, ".tl-scroll") as HTMLElement).style.getPropertyValue("--tl-ppm")).toBe("8");
  });
});

describe("zoom on the track itself (owner 10-23)", () => {
  const touches = (...xs: number[]) => xs.map((x) => ({ clientX: x, clientY: 100 }));
  const touch = (el: HTMLElement, type: string, list: any[]) => {
    const e: any = new Event(type, { bubbles: true, cancelable: true });
    e.touches = list;
    el.dispatchEvent(e);
    return e;
  };
  async function wide() {
    const card = await render();
    card._half = 206; // a 412 px track
    card.requestUpdate();
    await card.updateComplete;
    return card;
  }

  it("a pinch zooms around the moment under the playhead, and the phone keeps the zoom", async () => {
    const card = await wide();
    const el = $(card, ".tl-scroll") as HTMLElement;
    let left = 0;
    Object.defineProperty(el, "scrollLeft", {
      get: () => left,
      set: (v) => (left = v),
      configurable: true,
    });
    const t = card._t;
    touch(el, "touchstart", touches(100, 200));
    const move = touch(el, "touchmove", touches(0, 400)); // the fingers 4 times as far apart
    expect(move.defaultPrevented).toBe(true); // the track doesn't pan meanwhile
    expect(card._ppm()).toBe(16);
    expect(el.style.getPropertyValue("--tl-ppm")).toBe("16");
    expect(left).toBe(14 * 60 * 16); // 14:00 still under the playhead
    expect(card._t).toBe(t);
    touch(el, "touchend", []);
    await card.updateComplete;
    expect(localStorage.getItem("cgc-timeline-ppm")).toBe("16");
    const again = await render();
    expect(again._ppm()).toBe(16);
  });

  it("pinching right out shows the whole day; in, a pixel a second at most", async () => {
    const card = await wide();
    const el = $(card, ".tl-scroll") as HTMLElement;
    touch(el, "touchstart", touches(0, 400));
    touch(el, "touchmove", touches(199, 201));
    expect(card._ppm()).toBeCloseTo(412 / 1440, 6);
    touch(el, "touchend", []);
    await card.updateComplete;
    const out = $$(card, ".tl-ctrls .tl-btn").find(
      (b) => b.getAttribute("aria-label") === "Zoom out"
    )!;
    expect((out as HTMLButtonElement).disabled).toBe(true);
    expect($$(card, ".tl-hour").map((h) => h.textContent!.trim())).toHaveLength(3); // 0, 6 and 12 h (now is 14:00)
    touch(el, "touchstart", touches(199, 201));
    touch(el, "touchmove", touches(0, 4000));
    expect(card._ppm()).toBe(60);
  });

  it("Ctrl + wheel (a trackpad pinch) zooms", async () => {
    const card = await wide();
    const el = $(card, ".tl-scroll") as HTMLElement;
    const e = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(card._ppm()).toBeCloseTo(4 * Math.E, 6);
  });

  it("the track's marks sit at the zoom without being drawn again", async () => {
    const card = await wide();
    const mark = $(card, ".tl-mark") as HTMLElement;
    expect(mark.getAttribute("style")).toContain("var(--tl-ppm)");
    card._zoomTo(5, { commit: false });
    expect($(card, ".tl-mark")).toBe(mark); // the same element
  });
});

describe("scrolling past either end of the day (owner 10-23)", () => {
  async function scrolled(card: any, positions: number[]) {
    const el = $(card, ".tl-scroll") as HTMLElement;
    let left = 0;
    Object.defineProperty(el, "scrollLeft", {
      get: () => left,
      set: (v) => (left = v),
      configurable: true,
    });
    Object.defineProperty(el, "scrollWidth", { value: 14 * 60 * 4 + 412, configurable: true });
    Object.defineProperty(el, "clientWidth", { value: 412, configurable: true });
    for (const p of positions) {
      card._syncedLeft = null;
      left = p;
      el.dispatchEvent(new Event("scroll"));
      await settle(card, 20);
    }
    return el;
  }

  it("the start of the day goes on into the day before, near its end", async () => {
    const card = await render();
    await scrolled(card, [400, 0]);
    expect(card._day).toBe("2026-10-18");
    expect(card._t).toBe(new Date(2026, 9, 19).getTime() - 1000 - 60_000); // 23:58:59
    expect(tileSrcs(card)[0]).toBe(P("front", "motion_20261018_220000.gif"));
  });

  it("the end of a past day goes on into the next day with clips, near its start", async () => {
    const card = await render();
    card._setDay("2026-10-17");
    await card.updateComplete;
    const b = card._bounds();
    const el = $(card, ".tl-scroll") as HTMLElement;
    let left = 0;
    Object.defineProperty(el, "scrollLeft", {
      get: () => left,
      set: (v) => (left = v),
      configurable: true,
    });
    Object.defineProperty(el, "scrollWidth", { value: 1440 * 4 + 412, configurable: true });
    Object.defineProperty(el, "clientWidth", { value: 412, configurable: true });
    for (const p of [5000, 1440 * 4]) {
      card._syncedLeft = null;
      left = p;
      el.dispatchEvent(new Event("scroll"));
      await settle(card, 20);
    }
    expect(b.start).toBe(new Date(2026, 9, 17).getTime());
    expect(card._day).toBe("2026-10-18");
    expect(card._t).toBe(new Date(2026, 9, 18).getTime() + 60_000);
  });

  it("today's end is now: nothing after it", async () => {
    const card = await render();
    await scrolled(card, [3000, 14 * 60 * 4]);
    expect(card._day).toBe("2026-10-19");
  });
});

describe("days", () => {
  it("the arrows step between days with clips and the calendar picks one", async () => {
    const card = await render();
    const prev = $(card, '.tl-date .tl-btn[aria-label="Previous day"]') as HTMLButtonElement;
    const next = $(card, '.tl-date .tl-btn[aria-label="Next day"]') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    prev.click();
    await card.updateComplete;
    expect(card._day).toBe("2026-10-18");
    expect(tileSrcs(card)[0]).toBe(P("front", "motion_20261018_220000.gif")); // that day's last frame
    ($(card, ".tl-day") as HTMLButtonElement).click();
    await card.updateComplete;
    const day17 = $$(card, ".cal-day").find(
      (b) => b.textContent!.trim() === "17"
    ) as HTMLButtonElement;
    expect(day17.disabled).toBe(false);
    day17.click();
    await card.updateComplete;
    expect(card._day).toBe("2026-10-17");
    expect($(card, ".cal-picker")).toBeNull();
    ($(card, ".tl-now") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(card._day).toBe("2026-10-19");
    expect(card._t).toBe(NOW.getTime());
  });
});

describe("opening a camera: its own page, the one viewer (owner 10-20)", () => {
  let moves: { url: string; replace: boolean }[] = [];
  const onMove = (e: Event) =>
    moves.push({
      url: window.location.pathname + window.location.search,
      replace: !!(e as CustomEvent).detail?.replace,
    });
  beforeEach(() => {
    moves = [];
    window.history.replaceState(null, "", "/main-dashboard/timeline");
    window.addEventListener("location-changed", onMove);
  });
  afterEach(() => window.removeEventListener("location-changed", onMove));

  it("a tap opens the camera's page on the frame shown, at the moment on the track", async () => {
    const card = await render();
    card._setT(at(12, 50));
    await card.updateComplete;
    $$(card, ".tl-tile")[0]!.click();
    expect(moves).toEqual([
      { url: expect.stringMatching(/^\/main-dashboard\/camera1\?/), replace: false },
    ]);
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({
      cgc_id: "camera1",
      cgc_view: "gallery",
      cgc_src: L("front", "car_20261019_124500_snapshot.jpg"),
      cgc_time: String(at(12, 50)), // where Low / High start and what a swipe carries on
    });
    // As HA's own navigate: the entry knows where it came from, so HA's back arrow returns to the timeline.
    expect(window.history.state).toEqual({ from: "/main-dashboard/timeline" });
    // No viewer of its own: the camera's page is it.
    expect($(card, "cgc-nvr-player, .tl-overlay, video")).toBeNull();
  });

  it("the timeline stops playing and keeps its moment for Back", async () => {
    const card = await render();
    card._setT(at(12, 50));
    card._togglePlay();
    await card.updateComplete;
    expect(card._playing).toBe(true);
    const t = card._t;
    $$(card, ".tl-tile")[0]!.click();
    await card.updateComplete;
    expect(card._playing).toBe(false);
    expect(card._t).toBe(t);
  });

  it("without a gallery_id, the camera's plain page; without a navigation_path, nothing", async () => {
    const card = await render({
      cameras: [
        { entity: "sensor.ft_front", name: "Front", navigation_path: "/main-dashboard/camera1" },
        { entity: "sensor.ft_back", name: "Back" },
      ],
    });
    card._setT(at(12, 50));
    await card.updateComplete;
    $$(card, ".tl-tile")[1]!.click();
    expect(moves).toEqual([]);
    expect(window.location.pathname).toBe("/main-dashboard/timeline");
    $$(card, ".tl-tile")[0]!.click();
    expect(window.location.pathname + window.location.search).toBe("/main-dashboard/camera1");
  });
});

describe("preloading and updates", () => {
  it("preloads the day's previews of every camera, nearest the moment first", async () => {
    const calls: { src: string; url: string }[][] = [];
    vi.spyOn(ThumbPreloader.prototype, "setQueue").mockImplementation(function (entries) {
      calls.push([...entries]);
    });
    await render();
    await vi.advanceTimersByTimeAsync(1000);
    const urls = calls[calls.length - 1]!.map((e) => e.url);
    expect(urls).toEqual([
      P("door", "snapshot_20261019_135500.jpg"),
      P("front", "motion_20261019_133000.gif"),
      P("door", "visitor_20261019_131000.mp4"),
      P("front", "car_20261019_124500_snapshot.jpg"),
      P("front", "hourly_20261019_120000.gif"),
      P("back", "person_20261019_090000.gif"),
    ]);
  });

  it("new clips appear without losing the moment the user picked", async () => {
    const card = await render();
    card._userMoved = true;
    card._setT(at(13, 40));
    const more = {
      ...FILES,
      "sensor.ft_back": [...FILES["sensor.ft_back"]!, W("back", "dog_20261019_133500.gif")],
    };
    card.hass = hassWith(more);
    await card.updateComplete;
    expect(card._t).toBe(at(13, 40));
    expect(tileSrcs(card)[1]).toBe(P("back", "dog_20261019_133500.gif"));
  });

  it("refuses a config without cameras or a date format", () => {
    const card: any = document.createElement("camera-timeline-card");
    expect(() => card.setConfig({ path_datetime_format: "YYYYMMDD_HHmmss" })).toThrow(/cameras/);
    expect(() => card.setConfig({ cameras: ["sensor.x"] })).toThrow(/path_datetime_format/);
  });
});

describe("the calendar (owner 10-20)", () => {
  it("a press anywhere outside it closes it; inside, it stays", async () => {
    const card = await render();
    card._openCalendar();
    await card.updateComplete;
    const picker = $(card, ".cal-picker");
    expect(picker).not.toBeNull();
    picker.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));
    await card.updateComplete;
    expect(card._calOpen).toBe(true);
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));
    await card.updateComplete;
    expect(card._calOpen).toBe(false);
    expect($(card, ".cal-picker")).toBeNull();
    card.remove(); // and it stops listening with the card gone
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));
  });
});
