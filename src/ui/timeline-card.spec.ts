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
    expect(card._zoom).toBe(3);
    expect(card._t).toBe(before);
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

describe("the full view of one camera", () => {
  it("tapping a camera shows its full file over the preview and can open the camera page", async () => {
    const card = await render();
    card._setT(at(12, 50));
    await card.updateComplete;
    $$(card, ".tl-tile")[0]!.click();
    await card.updateComplete;
    const media = $(card, ".tl-overlay .tl-overlay-media") as HTMLImageElement;
    expect(media.tagName).toBe("IMG");
    expect(media.getAttribute("src")).toBe(L("front", "car_20261019_124500_snapshot.jpg"));
    expect(media.getAttribute("style")).toContain(P("front", "car_20261019_124500_snapshot.jpg"));
    const nav = vi.fn();
    window.addEventListener("location-changed", nav);
    ($(card, ".tl-overlay-head .tl-btn") as HTMLButtonElement).click();
    expect(window.location.pathname).toBe("/main-dashboard/camera1");
    const q = new URLSearchParams(window.location.search);
    expect(Object.fromEntries(q)).toEqual({
      cgc_id: "camera1",
      cgc_view: "gallery",
      cgc_src: L("front", "car_20261019_124500_snapshot.jpg"),
      cgc_time: String(at(12, 45)),
    });
    expect(nav).toHaveBeenCalledTimes(1);
    await card.updateComplete;
    expect($(card, ".tl-overlay")).toBeNull();
    window.removeEventListener("location-changed", nav);
  });

  it("without a gallery_id, Open camera goes to the plain page", async () => {
    const card = await render({
      cameras: [
        { entity: "sensor.ft_front", name: "Front", navigation_path: "/main-dashboard/camera1" },
      ],
    });
    card._setT(at(12, 50));
    await card.updateComplete;
    $$(card, ".tl-tile")[0]!.click();
    await card.updateComplete;
    ($(card, ".tl-overlay-head .tl-btn") as HTMLButtonElement).click();
    expect(window.location.pathname + window.location.search).toBe("/main-dashboard/camera1");
  });

  it("a video plays in the full view with its preview as poster", async () => {
    const card = await render();
    card._setT(at(13, 20));
    await card.updateComplete;
    $$(card, ".tl-tile")[2]!.click();
    await card.updateComplete;
    const video = $(card, ".tl-overlay video") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe(L("door", "visitor_20261019_131000.mp4"));
    expect(video.getAttribute("poster")).toBe(P("door", "visitor_20261019_131000.mp4"));
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

describe("NVR recording in the full view (BL-008)", () => {
  const btnTexts = (card: any) => $$(card, ".tl-overlay .tl-btn").map((b) => b.textContent!.trim());
  const btn = (card: any, label: string) =>
    $$(card, ".tl-overlay .tl-btn").find(
      (b) => b.textContent!.trim() === label
    ) as HTMLButtonElement;

  it("Low / High play the camera's NVR recording from the moment on the track", async () => {
    const cams = CONFIG.cameras.map((c, i) => (i === 0 ? { ...c, nvr_channel: 6 } : c));
    const card = await render({ cameras: cams });
    card._setT(at(13, 40));
    await card.updateComplete;
    $$(card, ".tl-tile")[0]!.click();
    await card.updateComplete;
    expect(btnTexts(card)).toEqual(["Low", "High", "Open camera", ""]);
    btn(card, "High").click();
    await card.updateComplete;
    const player = $(card, ".tl-overlay-nvr cgc-nvr-player");
    expect([player.channel, player.time, player.stream, player.addon]).toEqual([
      6,
      at(13, 40),
      "main",
      "local_nvr_playback",
    ]);
    expect(player.poster).toBe(P("front", "motion_20261019_133000.gif"));
    expect(player.bare).toBe(true);
    expect($(card, ".tl-overlay-head")!.textContent!.replace(/\s+/g, " ")).toContain(
      "Front · NVR from"
    );
    expect(btn(card, "High").classList.contains("on")).toBe(true);
    expect($(card, ".tl-overlay .tl-overlay-media")).toBeNull();

    player.dispatchEvent(
      new CustomEvent("nvr-stream", { detail: { stream: "sub" }, bubbles: true, composed: true })
    );
    await card.updateComplete;
    expect(btn(card, "Low").classList.contains("on")).toBe(true);
    player.dispatchEvent(new CustomEvent("nvr-close", { bubbles: true, composed: true }));
    await card.updateComplete;
    expect($(card, "cgc-nvr-player")).toBeNull();
    expect($(card, ".tl-overlay .tl-overlay-media")).not.toBeNull();

    // The lit button switches it off again.
    btn(card, "Low").click();
    await card.updateComplete;
    expect($(card, "cgc-nvr-player")).not.toBeNull();
    expect(btn(card, "Low").getAttribute("aria-pressed")).toBe("true");
    btn(card, "Low").click();
    await card.updateComplete;
    expect($(card, "cgc-nvr-player")).toBeNull();
  });

  it("no Low / High for a camera without an nvr_channel", async () => {
    const card = await render();
    card._setT(at(13, 40));
    await card.updateComplete;
    $$(card, ".tl-tile")[1]!.click();
    await card.updateComplete;
    expect(btnTexts(card)).not.toContain("Low");
    expect(btnTexts(card)).not.toContain("High");
  });
});

describe("swiping between cameras in the full view (owner fork)", () => {
  const swipeOn = async (card: any, el: Element, dx: number, y = 100) => {
    const ev = (type: string, x: number) =>
      new MouseEvent(type, { bubbles: true, composed: true, clientX: x, clientY: y });
    el.dispatchEvent(ev("pointerdown", 200));
    el.dispatchEvent(ev("pointerup", 200 + dx));
    await card.updateComplete;
  };
  const media = (card: any) => $(card, ".tl-overlay .tl-overlay-media");
  const swipeEvent = (detail: Record<string, unknown>) =>
    new CustomEvent("nvr-swipe", { detail, bubbles: true, composed: true, cancelable: true });

  it("a swipe on the frame shows the next camera's frame closest to the moment, round the cameras", async () => {
    const card = await render();
    card._setT(at(13, 40));
    await card.updateComplete;
    $$(card, ".tl-tile")[0]!.click();
    await card.updateComplete;
    expect(card._overlay.item.src).toBe(L("front", "motion_20261019_133000.gif"));
    await swipeOn(card, media(card)!, -150);
    expect([card._overlay.ci, card._overlay.item.src]).toEqual([
      1,
      L("back", "person_20261019_090000.gif"),
    ]);
    await swipeOn(card, media(card)!, -150);
    // The doorbell: 13:55 is closer to 13:40 than 13:10.
    expect([card._overlay.ci, card._overlay.item.src]).toEqual([
      2,
      L("door", "snapshot_20261019_135500.jpg"),
    ]);
    expect($(card, ".tl-overlay-head")!.textContent).toContain("Doorbell");
    await swipeOn(card, media(card)!, -150); // round to the first
    expect(card._overlay.ci).toBe(0);
    await swipeOn(card, media(card)!, 150); // and back
    expect(card._overlay.ci).toBe(2);
    await swipeOn(card, media(card)!, -30); // too short
    expect(card._overlay.ci).toBe(2);
  });

  it("streaming, the next camera streams from the moment on screen in that quality; one without a channel shows its frame and passes the stream on", async () => {
    const cams = CONFIG.cameras.map((c, i) =>
      i === 0 ? { ...c, nvr_channel: 6 } : i === 1 ? { ...c, nvr_channel: 0 } : c
    );
    const card = await render({ cameras: cams });
    card._setT(at(13, 40));
    await card.updateComplete;
    $$(card, ".tl-tile")[0]!.click();
    await card.updateComplete;
    $$(card, ".tl-overlay .tl-btn")
      .find((b) => b.textContent!.trim() === "High")!
      .click();
    await card.updateComplete;
    let player = $(card, ".tl-overlay-nvr cgc-nvr-player");
    expect(player.label).toBe("Front");
    const ev = swipeEvent({ dir: 1, time: at(13, 41), stream: "main", fullscreen: false });
    player.dispatchEvent(ev);
    await card.updateComplete;
    expect(ev.defaultPrevented).toBe(true);
    player = $(card, ".tl-overlay-nvr cgc-nvr-player");
    expect([player.channel, player.time, player.stream, player.label]).toEqual([
      0,
      at(13, 41),
      "main",
      "Back",
    ]);
    player.dispatchEvent(swipeEvent({ dir: 1, time: at(13, 42), stream: "main" }));
    await card.updateComplete;
    expect($(card, "cgc-nvr-player")).toBeNull(); // the doorbell has no recordings: its closest frame
    expect(card._overlay).toMatchObject({ ci: 2, nvr: null, carry: "main", t: at(13, 42) });
    expect(card._overlay.item.src).toBe(L("door", "snapshot_20261019_135500.jpg"));
    await swipeOn(card, media(card)!, -150); // on to the first camera: streaming again, from the same moment
    player = $(card, ".tl-overlay-nvr cgc-nvr-player");
    expect([player.channel, player.time, player.stream]).toEqual([6, at(13, 42), "main"]);
  });

  it("a swipe that starts on a video's own controls (its bottom) is left to them", async () => {
    const card = await render();
    card._setT(at(13, 20));
    await card.updateComplete;
    $$(card, ".tl-tile")[2]!.click(); // the doorbell's 13:10 clip
    await card.updateComplete;
    const video = media(card)!;
    expect(video.tagName).toBe("VIDEO");
    video.getBoundingClientRect = () =>
      ({ top: 0, bottom: 225, height: 225, left: 0, right: 400, width: 400 }) as DOMRect;
    await swipeOn(card, video, -150, 210);
    expect(card._overlay.ci).toBe(2);
    await swipeOn(card, video, -150, 100);
    expect(card._overlay.ci).toBe(0);
  });
});
