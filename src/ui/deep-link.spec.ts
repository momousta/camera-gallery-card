// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// BL-008: deep links that open the gallery on one file or moment (fork addition to upstream PR #236).

const DIR = "/local/snapshots/front_right";
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const ITEMS = [
  { src: `${DIR}/motion_20261019_133000.gif`, dtMs: at(19, 13, 30), dayKey: "2026-10-19" },
  { src: `${DIR}/car_20261019_124500_snapshot.jpg`, dtMs: at(19, 12, 45), dayKey: "2026-10-19" },
  { src: `${DIR}/hourly_20261019_120000.gif`, dtMs: at(19, 12), dayKey: "2026-10-19" },
  { src: `${DIR}/motion_20261018_220000.gif`, dtMs: at(18, 22), dayKey: "2026-10-18" },
  { src: `${DIR}/person_20261018_100500.gif`, dtMs: at(18, 10, 5), dayKey: "2026-10-18" },
];
const DAYS = ["2026-10-19", "2026-10-18"];

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
  window.history.replaceState(null, "", "/main-dashboard/front-right");
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeCard(options: Record<string, unknown> = {}) {
  const card: any = document.createElement("camera-gallery-card");
  for (const method of [
    "_startMediaPoll",
    "_subscribeFrigateEvents",
    "_mountLiveCard",
    "_setupThumbObserver",
    "_scheduleVisibleMediaWork",
    "_queueSensorPosterWork",
    "_queueSnapshotResolveForVisibleThumbs",
    "_teardownLiveView",
  ]) {
    vi.spyOn(card, method).mockImplementation(() => {});
  }
  vi.spyOn(card._posterClient, "prewarm").mockResolvedValue(undefined);
  vi.spyOn(card, "_computeBaseList").mockImplementation(() => {
    const activeDay = card._selectedDay ?? DAYS[0];
    const day = ITEMS.filter((x) => x.dayKey === activeDay);
    return {
      rawItems: ITEMS,
      allWithDay: ITEMS,
      days: DAYS,
      newestDay: DAYS[0],
      activeDay,
      dayFiltered: day,
      objFiltered: day,
      videoCount: 0,
      imageCount: day.length,
    };
  });
  card.setConfig({
    entities: ["sensor.filetrack_front_right"],
    path_datetime_format: "YYYYMMDD_HHmmss",
    start_mode: "live",
    live_enabled: true,
    live_camera_entity: "camera.front_right_main",
    live_camera_entities: ["camera.front_right_main"],
    url_id: "front_right",
    ...options,
  });
  return card;
}

async function show(card: any) {
  card.hass = {
    states: {
      "camera.front_right_main": {
        entity_id: "camera.front_right_main",
        state: "idle",
        attributes: {},
      },
    },
    locale: { language: "en-US" },
  };
  document.body.append(card);
  await card.updateComplete;
  await vi.advanceTimersByTimeAsync(50);
  await card.updateComplete;
}

const link = (q: Record<string, string>) =>
  window.history.pushState(
    null,
    "",
    `/main-dashboard/front-right?${new URLSearchParams(q).toString()}`
  );

describe("opening the gallery on one file", () => {
  it("a link to a file on another day opens that day on that file, in the gallery, and is used once", async () => {
    link({
      cgc_id: "front_right",
      cgc_view: "gallery",
      cgc_src: ITEMS[4]!.src,
      cgc_time: String(ITEMS[4]!.dtMs),
    });
    const card = makeCard();
    await show(card);
    expect(card._viewMode).toBe("media");
    expect(card._selectedDay).toBe("2026-10-18");
    expect(card._selectedIndex).toBe(1);
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/main-dashboard/front-right");
  });

  it("a file of the shown day is selected directly", async () => {
    link({ cgc_id: "front_right", cgc_src: ITEMS[1]!.src });
    const card = makeCard();
    await show(card);
    expect(card._selectedDay ?? "2026-10-19").toBe("2026-10-19");
    expect(card._selectedIndex).toBe(1);
  });

  it("a deleted file falls back to the frame at or before its moment", async () => {
    link({ cgc_id: "front_right", cgc_src: `${DIR}/gone.gif`, cgc_time: String(at(19, 12, 50)) });
    const card = makeCard();
    await show(card);
    expect(card._selectedIndex).toBe(1); // the 12:45 car snapshot
  });

  it("a link for another card is ignored and left in place", async () => {
    link({ cgc_id: "camera1", cgc_src: ITEMS[1]!.src });
    const card = makeCard();
    await show(card);
    expect(card._viewMode).toBe("live");
    expect(card._selectedIndex).toBe(0);
    expect(window.location.search).toContain("cgc_id=camera1");
  });

  it("without url_id the card ignores links", async () => {
    link({ cgc_id: "front_right", cgc_src: ITEMS[1]!.src });
    const card = makeCard({ url_id: "" });
    await show(card);
    expect(card._viewMode).toBe("live");
    expect(window.location.search).toContain("cgc_src");
  });

  it("PR #236's gallery link still opens the newest clip", async () => {
    link({ cgc_id: "front_right", cgc_view: "gallery" });
    const card = makeCard();
    await show(card);
    expect(card._viewMode).toBe("media");
    expect(card._selectedIndex).toBe(0);
    expect(window.location.search).toBe("");
  });
});

describe("in-app navigation", () => {
  it("a card shown again (a cached view) applies a new link", async () => {
    const card = makeCard();
    await show(card);
    expect(card._viewMode).toBe("live");
    card.remove();
    link({ cgc_id: "front_right", cgc_view: "gallery", cgc_src: ITEMS[2]!.src });
    document.body.append(card);
    await card.updateComplete;
    await vi.advanceTimersByTimeAsync(50);
    await card.updateComplete;
    expect(card._viewMode).toBe("media");
    expect(card._selectedIndex).toBe(2);
    expect(window.location.search).toBe("");
  });

  it("showing the card again without a link changes nothing", async () => {
    link({ cgc_id: "front_right", cgc_src: ITEMS[1]!.src });
    const card = makeCard();
    await show(card);
    card._selectedIndex = 0;
    card.remove();
    document.body.append(card);
    await card.updateComplete;
    expect(card._selectedIndex).toBe(0);
  });
});

describe("swiping between cameras (owner fork)", () => {
  const CAMERAS = [
    {
      entity: "sensor.filetrack_front_right",
      name: "Front Right",
      navigation_path: "/main-dashboard/front-right",
      gallery_id: "front_right",
      nvr_channel: 7,
    },
    {
      entity: "sensor.filetrack_camera1",
      name: "Front",
      navigation_path: "/main-dashboard/camera1",
      gallery_id: "camera1",
      nvr_channel: 6,
    },
    {
      entity: "sensor.filetrack_doorbell",
      name: "Doorbell",
      navigation_path: "/main-dashboard/doorbell",
      gallery_id: "doorbell",
    },
    {
      entity: "sensor.filetrack_left_front",
      name: "Left Front",
      navigation_path: "/main-dashboard/left-front",
      gallery_id: "left_front",
      nvr_channel: 1,
    },
  ];
  let moves: { url: string; replace: boolean }[] = [];
  const onMove = (e: Event) =>
    moves.push({
      url: window.location.pathname + window.location.search,
      replace: !!(e as CustomEvent).detail?.replace,
    });
  const query = (url: string) => Object.fromEntries(new URL(url, "http://x").searchParams);

  beforeEach(() => {
    moves = [];
    window.addEventListener("location-changed", onMove);
  });
  afterEach(() => window.removeEventListener("location-changed", onMove));

  async function swipe(card: any, dx: number) {
    const preview = card.shadowRoot.querySelector(".preview");
    const ev = (type: string, x: number) =>
      new MouseEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
        clientX: x,
        clientY: 200,
      });
    preview.dispatchEvent(ev("pointerdown", 200));
    preview.dispatchEvent(ev("pointermove", 200 + dx));
    preview.dispatchEvent(ev("pointerup", 200 + dx));
    await card.updateComplete;
  }

  it("a swipe on a snapshot opens the next camera on its closest snapshot; the other way wraps around", async () => {
    link({ cgc_id: "front_right", cgc_view: "gallery", cgc_src: ITEMS[1]!.src });
    const card = makeCard({ swipe_cameras: CAMERAS, nvr_channel: 7 });
    await show(card);
    await swipe(card, -150); // to the left: the next camera
    expect(moves).toHaveLength(1);
    expect(moves[0]!.replace).toBe(true);
    expect(moves[0]!.url.startsWith("/main-dashboard/camera1?")).toBe(true);
    expect(query(moves[0]!.url)).toEqual({
      cgc_id: "camera1",
      cgc_view: "gallery",
      cgc_time: String(ITEMS[1]!.dtMs),
      cgc_near: "1",
    });
    window.history.replaceState(null, "", "/main-dashboard/front-right");
    await swipe(card, 150); // to the right: the previous one, round to the last
    expect(moves[1]!.url.startsWith("/main-dashboard/left-front?cgc_id=left_front")).toBe(true);
    await swipe(card, -20); // too short: nothing
    expect(moves).toHaveLength(2);
  });

  it("the player's swipe carries the moment on screen, the quality and full screen", async () => {
    const card = makeCard({ swipe_cameras: CAMERAS, nvr_channel: 7 });
    await show(card);
    card._setViewMode("media");
    await card.updateComplete;
    card._startNvr(ITEMS[0]!.src, ITEMS[0]!.dtMs, "main");
    await card.updateComplete;
    const player = card.shadowRoot.querySelector(".preview cgc-nvr-player");
    expect(player.label).toBe("Front Right");
    const ev = new CustomEvent("nvr-swipe", {
      detail: { dir: 1, time: ITEMS[0]!.dtMs + 42_000, stream: "main", fullscreen: true },
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    player.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(query(moves[0]!.url)).toEqual({
      cgc_id: "camera1",
      cgc_view: "gallery",
      cgc_time: String(ITEMS[0]!.dtMs + 42_000),
      cgc_near: "1",
      cgc_nvr: "main",
      cgc_fs: "1",
    });
    expect(card._nvr).toBeNull();
  });

  it("arriving from a stream plays this camera's recording from that moment, quietly, over the closest snapshot", async () => {
    link({
      cgc_id: "front_right",
      cgc_view: "gallery",
      cgc_time: String(at(19, 12, 50)),
      cgc_near: "1",
      cgc_nvr: "main",
    });
    // No add-on here: the player stays loading (a failing quiet start would ask the card to drop it).
    vi.spyOn(customElements.get("cgc-nvr-player")!.prototype as any, "_go").mockReturnValue(
      new Promise(() => {})
    );
    const card = makeCard({ swipe_cameras: CAMERAS, nvr_channel: 7 });
    await show(card);
    expect(card._viewMode).toBe("media");
    expect(card._selectedIndex).toBe(1); // 12:45 is closer than 13:30
    expect(card._nvr).toMatchObject({
      src: ITEMS[1]!.src,
      time: at(19, 12, 50),
      stream: "main",
      quiet: true,
      carried: true,
      fullscreen: false,
    });
    expect(window.location.search).toBe("");

    // From full screen, on another day: that day opens, and the player starts full screen (not quietly).
    card.remove();
    link({
      cgc_id: "front_right",
      cgc_time: String(at(18, 21, 40)),
      cgc_near: "1",
      cgc_nvr: "sub",
      cgc_fs: "1",
    });
    document.body.append(card);
    for (let i = 0; i < 3; i++) {
      await card.updateComplete;
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(card._selectedDay).toBe("2026-10-18");
    expect(card._nvr).toMatchObject({
      src: ITEMS[3]!.src,
      time: at(18, 21, 40),
      stream: "sub",
      quiet: false,
      fullscreen: true,
    });
  });

  it("a camera without recordings (the doorbell) shows its closest snapshot and passes the stream on", async () => {
    link({
      cgc_id: "doorbell",
      cgc_view: "gallery",
      cgc_time: String(at(19, 13, 20)),
      cgc_near: "1",
      cgc_nvr: "sub",
    });
    const card = makeCard({ swipe_cameras: CAMERAS, url_id: "doorbell" });
    await show(card);
    expect(card._selectedIndex).toBe(0); // 13:30
    expect(card._nvr).toBeNull();
    await swipe(card, -150); // on to the next camera: streaming again, from the same moment
    expect(query(moves[0]!.url)).toMatchObject({
      cgc_id: "left_front",
      cgc_time: String(at(19, 13, 20)),
      cgc_nvr: "sub",
    });
    card._selectedIndex = 2; // the viewer picked another snapshot: a plain swipe from it
    card.requestUpdate();
    await card.updateComplete;
    await swipe(card, 150);
    expect(query(moves[1]!.url)).toEqual({
      cgc_id: "camera1",
      cgc_view: "gallery",
      cgc_time: String(ITEMS[2]!.dtMs),
      cgc_near: "1",
    });
  });

  it("a quiet start that hasn't shown itself yet swipes as the snapshot; once shown, as the stream", async () => {
    link({ cgc_id: "front_right", cgc_view: "gallery", cgc_src: ITEMS[0]!.src });
    const card = makeCard({ swipe_cameras: CAMERAS, nvr_channel: 7 });
    await show(card);
    card._startNvr(ITEMS[0]!.src, ITEMS[0]!.dtMs, "sub", { quiet: true });
    await card.updateComplete;
    expect(card._swipeContext()).toEqual({ time: ITEMS[0]!.dtMs, stream: null, fullscreen: false });
    card._nvr.revealed = true;
    expect(card._swipeContext()).toMatchObject({ time: ITEMS[0]!.dtMs, stream: "sub" });
  });

  it("a swipe may start on a chevron (where a thumb starts one); a tap on it still steps through the snapshots", async () => {
    link({ cgc_id: "front_right", cgc_view: "gallery", cgc_src: ITEMS[1]!.src });
    const card = makeCard({ swipe_cameras: CAMERAS, persistent_controls: true });
    await show(card);
    const right = card.shadowRoot.querySelector(".preview .pnavbtn.right");
    const left = card.shadowRoot.querySelector(".preview .pnavbtn.left");
    expect(right).not.toBeNull();
    const ev = (type: string, x: number) =>
      new MouseEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
        clientX: x,
        clientY: 120,
      });
    const capture = vi.fn(); // jsdom has no pointer capture
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: capture,
    });
    // A tap on the left chevron: the previous snapshot, no camera change, the pointer not captured.
    left.dispatchEvent(ev("pointerdown", 30));
    left.dispatchEvent(ev("pointerup", 30));
    left.click();
    await card.updateComplete;
    expect(card._selectedIndex).toBe(0);
    expect(moves).toEqual([]);
    expect(capture).not.toHaveBeenCalled();
    // A swipe from the right chevron: the next camera.
    right.dispatchEvent(ev("pointerdown", 370));
    right.dispatchEvent(ev("pointermove", 260));
    right.dispatchEvent(ev("pointerup", 150));
    await card.updateComplete;
    expect(query(moves[0]!.url)).toMatchObject({
      cgc_id: "camera1",
      cgc_time: String(ITEMS[0]!.dtMs),
    });
    delete (HTMLElement.prototype as any).setPointerCapture;
  });

  // Owner 10-20 16:17: a snapshot's full screen is the NVR player's (its still mode); its swipes are the player's.
  const playerOf = (card: any) => card.shadowRoot.querySelector(".preview cgc-nvr-player");
  const swipeEv = (detail: Record<string, unknown>) =>
    new CustomEvent("nvr-swipe", { detail, bubbles: true, composed: true, cancelable: true });

  it("a swipe in a snapshot's full screen opens the next camera's closest snapshot, full screen too", async () => {
    link({ cgc_id: "front_right", cgc_view: "gallery", cgc_src: ITEMS[1]!.src });
    const card = makeCard({ swipe_cameras: CAMERAS });
    await show(card);
    card._openImageFullscreen();
    await card.updateComplete;
    const p = playerOf(card);
    expect(p.still).toBe(ITEMS[1]!.src);
    expect(card._imgFsOpen).toBe(false);
    // To the right: the previous camera (round to the last), its snapshot full screen.
    const ev = swipeEv({ dir: -1, time: ITEMS[1]!.dtMs, stream: null, fullscreen: true });
    p.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(query(moves[0]!.url)).toEqual({
      cgc_id: "left_front",
      cgc_view: "gallery",
      cgc_time: String(ITEMS[1]!.dtMs),
      cgc_near: "1",
      cgc_fs: "1",
    });
    expect(card._nvr).toBeNull();
  });

  it("a turned full-screen snapshot swipes along itself (the player's own reading)", async () => {
    link({ cgc_id: "front_right", cgc_view: "gallery", cgc_src: ITEMS[1]!.src });
    const card = makeCard({ swipe_cameras: CAMERAS });
    await show(card);
    card._openImageFullscreen();
    await card.updateComplete;
    const p = playerOf(card);
    await vi.advanceTimersByTimeAsync(0); // its full screen is on (here the window-covering one)
    expect(p._fullscreen).toBe(true);
    p._turn = () => 90;
    const tev = (type: string, x: number, y: number): any => {
      const e: any = new Event(type, { bubbles: true, composed: true, cancelable: true });
      const t = { clientX: x, clientY: y };
      Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : [t] });
      Object.defineProperty(e, "changedTouches", { value: [t] });
      return e;
    };
    // Turned 90 degrees: up the screen is the picture's left, so a finger moving up is a swipe to the left.
    const nvr = p.shadowRoot.querySelector(".nvr");
    nvr.dispatchEvent(tev("touchstart", 200, 600));
    nvr.dispatchEvent(tev("touchend", 205, 350));
    expect(query(moves[0]!.url)).toMatchObject({ cgc_id: "camera1", cgc_fs: "1" });
  });

  it("arriving full screen on a snapshot opens it full screen; from a full-screen stream, the doorbell too", async () => {
    link({
      cgc_id: "front_right",
      cgc_view: "gallery",
      cgc_time: String(at(19, 12, 50)),
      cgc_near: "1",
      cgc_fs: "1",
    });
    const card = makeCard({ swipe_cameras: CAMERAS, nvr_channel: 7 });
    await show(card);
    expect(card._selectedIndex).toBe(1);
    // Its snapshot in the player's full screen (no stream: Low / High there would start one).
    expect(card._nvr).toMatchObject({
      src: ITEMS[1]!.src,
      still: ITEMS[1]!.src,
      stream: null,
      fullscreen: true,
    });

    link({
      cgc_id: "doorbell",
      cgc_view: "gallery",
      cgc_time: String(at(19, 13, 20)),
      cgc_near: "1",
      cgc_nvr: "main",
      cgc_fs: "1",
    });
    const door = makeCard({ swipe_cameras: CAMERAS, url_id: "doorbell" });
    await show(door);
    expect(door._nvr).toMatchObject({ still: expect.any(String), channel: null, stream: null });
    expect(door._carry).toMatchObject({ stream: "main", time: at(19, 13, 20) });
    // Swiping on from its full-screen snapshot (the player's swipe): the next camera streams again, full screen.
    playerOf(door).dispatchEvent(
      swipeEv({ dir: 1, time: door._nvr.time, stream: null, fullscreen: true })
    );
    expect(query(moves[0]!.url)).toMatchObject({
      cgc_id: "left_front",
      cgc_nvr: "main",
      cgc_fs: "1",
    });
  });

  it("without swipe_cameras (or when this card isn't in it) a swipe still steps through the snapshots", async () => {
    link({ cgc_id: "front_right", cgc_view: "gallery", cgc_src: ITEMS[0]!.src });
    const card = makeCard({ swipe_cameras: CAMERAS.slice(1) });
    await show(card);
    await swipe(card, -150);
    expect(moves).toEqual([]);
    expect(card._selectedIndex).toBe(1);
  });
});

describe("owner 10-20 13:08: touch swipes, no arrows or count, portrait cameras, the calendar", () => {
  const CAMS = [
    {
      name: "Front Right",
      navigation_path: "/main-dashboard/front-right",
      gallery_id: "front_right",
    },
    { name: "Front", navigation_path: "/main-dashboard/camera1", gallery_id: "camera1" },
  ];
  let moves: string[] = [];
  const onMove = () => moves.push(window.location.pathname + window.location.search);
  beforeEach(() => {
    moves = [];
    window.addEventListener("location-changed", onMove);
  });
  afterEach(() => window.removeEventListener("location-changed", onMove));

  const tev = (type: string, x: number, y: number, fingers = 1): any => {
    const e: any = new Event(type, { bubbles: true, composed: true, cancelable: true });
    const t = { clientX: x, clientY: y };
    Object.defineProperty(e, "touches", {
      value: type === "touchend" ? [] : Array(fingers).fill(t),
    });
    Object.defineProperty(e, "changedTouches", { value: [t] });
    return e;
  };
  const pev = (type: string, x: number, y: number): any => {
    const e: any = new MouseEvent(type, {
      bubbles: true,
      composed: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    });
    Object.defineProperty(e, "pointerType", { value: "touch" });
    Object.defineProperty(e, "pointerId", { value: 5 });
    return e;
  };
  /** A finger on the preview (or one of its children), as the browser sends it. */
  async function fingerSwipe(
    card: any,
    from: [number, number],
    to: [number, number],
    { on = "", cancel = false } = {}
  ) {
    const preview = card.shadowRoot.querySelector(".preview");
    const target = on ? preview.querySelector(on) : preview;
    target.dispatchEvent(pev("pointerdown", ...from));
    target.dispatchEvent(tev("touchstart", ...from));
    target.dispatchEvent(pev("pointermove", (from[0] + to[0]) / 2, (from[1] + to[1]) / 2));
    if (cancel) target.dispatchEvent(pev("pointercancel", 0, 0));
    else target.dispatchEvent(pev("pointerup", ...to));
    target.dispatchEvent(tev("touchend", ...to));
    await card.updateComplete;
  }
  async function gallery(options: Record<string, unknown> = {}) {
    link({ cgc_id: "front_right", cgc_view: "gallery", cgc_src: ITEMS[1]!.src });
    const card = makeCard({ swipe_cameras: CAMS, ...options });
    await show(card);
    return card;
  }

  it("a finger's swipe moves on even when the browser cancelled its pointer; once, not twice", async () => {
    const card = await gallery();
    await fingerSwipe(card, [300, 120], [120, 140], { cancel: true });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toContain("/main-dashboard/camera1?");
    window.history.replaceState(null, "", "/main-dashboard/front-right");
    await fingerSwipe(card, [300, 120], [120, 120]); // pointerup and touchend both arrive: one move
    expect(moves).toHaveLength(2);
  });

  it("from a pill (they stop the pointer), not up or down, not in live", async () => {
    const card = await gallery({ persistent_controls: true });
    const pill = card.shadowRoot.querySelector(".preview .gallery-pill");
    expect(pill).not.toBeNull();
    await fingerSwipe(card, [300, 20], [120, 30], { on: ".gallery-pill" });
    expect(moves).toHaveLength(1);
    await fingerSwipe(card, [200, 40], [230, 200]); // mostly down
    expect(moves).toHaveLength(1);
    card._setViewMode("live");
    await card.updateComplete;
    await fingerSwipe(card, [300, 120], [120, 120]);
    expect(moves).toHaveLength(1);
  });

  it("without swipe_cameras a finger still steps through the snapshots", async () => {
    link({ cgc_id: "front_right", cgc_view: "gallery", cgc_src: ITEMS[0]!.src });
    const card = makeCard();
    await show(card);
    await fingerSwipe(card, [300, 120], [120, 120], { cancel: true });
    expect(moves).toEqual([]);
    expect(card._selectedIndex).toBe(1);
  });

  it("a zoom reset keeps the preview's pan-y (blanking it gave the browser every swipe)", async () => {
    const card = await gallery();
    const preview = card.shadowRoot.querySelector(".preview");
    card._zoomScale = 2;
    card._applyZoom();
    card._resetZoom();
    expect(preview.style.touchAction).toBe("pan-y");
    card._setViewMode("live");
    await card.updateComplete;
    card._resetZoom();
    expect(preview.style.touchAction).toBe("auto");
  });

  it("no arrows (also full screen) with gallery_chevrons_enabled: false; no count with index_counter off", async () => {
    const card = await gallery({
      persistent_controls: true,
      gallery_chevrons_enabled: false,
      gallery_pills: { index_counter: { enabled: false } },
    });
    expect(card.shadowRoot.querySelector(".preview .pnavbtn")).toBeNull();
    expect(card.shadowRoot.querySelector(".preview").textContent).not.toMatch(/\d+\s*\/\s*\d+/);
    card._openImageFullscreen();
    await card.updateComplete;
    expect(card._nvr?.still).toBeTruthy(); // the player's full screen: no arrows there either
    expect(card.shadowRoot.querySelector(".img-fs-overlay")).toBeNull();
    expect(card.shadowRoot.querySelector(".pnavbtn")).toBeNull();
  });

  it("a portrait camera: a 3:4 gallery picture shown whole; live keeps its box and fit", async () => {
    const card = await gallery({ gallery_aspect_ratio: "3:4", gallery_fit: "contain" });
    const style = () => card.shadowRoot.querySelector(".preview").getAttribute("style");
    expect(style()).toContain("aspect-ratio:3/4");
    expect(style()).toContain("--cgc-object-fit:contain");
    expect(card._underlayStyle("/local/still.jpg")).toContain("background-size:contain");
    card._setViewMode("live");
    await card.updateComplete;
    expect(style()).toContain("aspect-ratio:16/9");
    expect(style()).not.toContain("--cgc-object-fit");
    const plain = await gallery({ gallery_aspect_ratio: "wide" });
    expect(plain.shadowRoot.querySelector(".preview").getAttribute("style")).toContain(
      "aspect-ratio:16/9"
    );
  });

  it("a press anywhere outside the open calendar closes it", async () => {
    const card = await gallery();
    card._openDatePicker(DAYS);
    await card.updateComplete;
    const picker = card.shadowRoot.querySelector(".cal-picker");
    expect(picker).not.toBeNull();
    picker.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));
    await card.updateComplete;
    expect(card._showDatePicker).toBe(true); // inside: stays
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));
    await card.updateComplete;
    expect(card._showDatePicker).toBe(false);
    expect(card.shadowRoot.querySelector(".cal-picker")).toBeNull();
  });
});

describe("owner 10-20 14:29: the moment a link came for (the timeline opens camera pages)", () => {
  const CAMS = [
    {
      name: "Front Right",
      navigation_path: "/main-dashboard/front-right",
      gallery_id: "front_right",
    },
    { name: "Front", navigation_path: "/main-dashboard/camera1", gallery_id: "camera1" },
  ];
  const nvrPill = (card: any, label: string) =>
    [...card.shadowRoot.querySelectorAll(".nvr-pill")].find(
      (b: any) => b.textContent.trim() === label
    ) as HTMLButtonElement;
  let moves: string[] = [];
  const onMove = () => moves.push(window.location.pathname + window.location.search);
  beforeEach(() => {
    moves = [];
    window.addEventListener("location-changed", onMove);
    // No add-on here: a started player stays loading.
    vi.spyOn(customElements.get("cgc-nvr-player")!.prototype as any, "_go").mockReturnValue(
      new Promise(() => {})
    );
  });
  afterEach(() => window.removeEventListener("location-changed", onMove));

  it("on the linked file, Low / High play from the link's moment and a swipe carries it on", async () => {
    // The timeline at 12:52: Front Right's frame at or before it is 12:45.
    link({
      cgc_id: "front_right",
      cgc_view: "gallery",
      cgc_src: ITEMS[1]!.src,
      cgc_time: String(at(19, 12, 52)),
    });
    const card = makeCard({ swipe_cameras: CAMS, nvr_channel: 7 });
    await show(card);
    expect(card._viewMode).toBe("media");
    expect(card._selectedIndex).toBe(1);
    expect(card._nvr).toBeNull(); // no stream until asked for
    nvrPill(card, "High").click();
    await card.updateComplete;
    expect(card._nvr).toMatchObject({ src: ITEMS[1]!.src, time: at(19, 12, 52), stream: "main" });
    card._stopNvr();
    await card.updateComplete;
    expect(card._swipeContext()).toEqual({ time: at(19, 12, 52), stream: null, fullscreen: false });
    card._goToCamera(1, card._swipeContext());
    expect(moves).toHaveLength(1);
    expect(Object.fromEntries(new URL(moves[0]!, "http://x").searchParams)).toMatchObject({
      cgc_id: "camera1",
      cgc_time: String(at(19, 12, 52)),
      cgc_near: "1",
    });
  });

  it("another item plays from its own moment", async () => {
    link({
      cgc_id: "front_right",
      cgc_view: "gallery",
      cgc_src: ITEMS[1]!.src,
      cgc_time: String(at(19, 12, 52)),
    });
    const card = makeCard({ swipe_cameras: CAMS, nvr_channel: 7 });
    await show(card);
    card._selectedIndex = 0;
    await card.updateComplete;
    expect(card._swipeContext().time).toBe(ITEMS[0]!.dtMs);
    nvrPill(card, "Low").click();
    await card.updateComplete;
    expect(card._nvr).toMatchObject({ src: ITEMS[0]!.src, time: ITEMS[0]!.dtMs, stream: "sub" });
  });

  it("a link without a moment leaves the item's own", async () => {
    link({ cgc_id: "front_right", cgc_view: "gallery", cgc_src: ITEMS[1]!.src });
    const card = makeCard({ swipe_cameras: CAMS, nvr_channel: 7 });
    await show(card);
    expect(card._moment).toBeNull();
    nvrPill(card, "Low").click();
    await card.updateComplete;
    expect(card._nvr).toMatchObject({ src: ITEMS[1]!.src, time: ITEMS[1]!.dtMs });
  });
});

describe("owner 10-20 21:46: a swipe in full screen stays full screen", () => {
  it("removing the last camera page's card doesn't end the document's full screen (the player's hand-off)", async () => {
    const exit = vi.fn(async () => {});
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.documentElement,
    });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    try {
      const card = makeCard({});
      await show(card);
      card.remove();
      expect(exit).not.toHaveBeenCalled();
      // Its own full screen (an element of the card) still ends with it.
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => document.body,
      });
      const other = makeCard({});
      await show(other);
      other.remove();
      expect(exit).toHaveBeenCalledTimes(1);
    } finally {
      delete (document as any).fullscreenElement;
      delete (document as any).exitFullscreen;
    }
  });
});

describe("live in the NVR player (owner 10-22)", () => {
  const CAMERAS = [
    {
      entity: "sensor.filetrack_front_right",
      name: "Front Right",
      navigation_path: "/main-dashboard/front-right",
      gallery_id: "front_right",
      nvr_channel: 7,
    },
    {
      entity: "sensor.filetrack_camera1",
      name: "Front",
      navigation_path: "/main-dashboard/camera1",
      gallery_id: "camera1",
      nvr_channel: 6,
    },
  ];
  const cam = (entity_id: string) => ({ entity_id, state: "idle", attributes: {} });
  async function showLive(card: any, both = true) {
    card.hass = {
      states: {
        "camera.front_right_main": cam("camera.front_right_main"),
        ...(both ? { "camera.front_right_sub": cam("camera.front_right_sub") } : {}),
      },
      locale: { language: "en-US" },
    };
    document.body.append(card);
    await card.updateComplete;
    await vi.advanceTimersByTimeAsync(50);
    await card.updateComplete;
  }
  const player = (card: any) =>
    card.shadowRoot.querySelector(".preview cgc-nvr-player.live-player");
  const fire = (el: any, name: string, detail: unknown) => {
    const ev = new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev;
  };

  it("the live view is the player's: its controls over the card's own stream", async () => {
    const card = makeCard({ nvr_channel: 7 });
    await showLive(card);
    const p = player(card);
    expect(p).not.toBeNull();
    expect(p.live).toBe(true);
    expect(p.liveStreams).toEqual(["sub", "main"]);
    expect(p.stream).toBe("main"); // as configured (camera.front_right_main)
    expect(p.channel).toBe(7);
    expect(p.docfs).toBe(true);
    expect(p.querySelector("#live-card-host")).not.toBeNull(); // the stream stays the card's
    expect(card.shadowRoot.querySelector(".live-controls-bar")).toBeNull(); // the old pills are gone
  });

  it("a camera with one stream: no Low / High", async () => {
    const card = makeCard();
    await showLive(card, false);
    expect(player(card).liveStreams).toEqual([]);
  });

  it("Low / High switches the card's stream to the camera's other entity; mute is the card's", async () => {
    const card = makeCard();
    await showLive(card);
    fire(player(card), "nvr-stream", { stream: "sub", live: true });
    await card.updateComplete;
    expect(card._getEffectiveLiveCamera()).toBe("camera.front_right_sub");
    expect(card._teardownLiveView).toHaveBeenCalled();
    expect(player(card).stream).toBe("sub");
    const muted = card._liveMuted;
    fire(player(card), "nvr-mute", { muted: !muted });
    await card.updateComplete;
    expect(card._liveMuted).toBe(!muted);
    expect(player(card).liveMuted).toBe(!muted);
  });

  it("a swipe opens the next camera's live view, in the same quality and full screen", async () => {
    const moves: string[] = [];
    const onMove = () => moves.push(window.location.pathname + window.location.search);
    window.addEventListener("location-changed", onMove);
    try {
      const card = makeCard({ swipe_cameras: CAMERAS, nvr_channel: 7 });
      await showLive(card);
      const ev = fire(player(card), "nvr-swipe", {
        dir: 1,
        time: Date.now(),
        stream: "main",
        fullscreen: true,
        live: true,
      });
      expect(ev.defaultPrevented).toBe(true);
      expect(moves[0]!.startsWith("/main-dashboard/camera1?")).toBe(true);
      expect(Object.fromEntries(new URL(moves[0]!, "http://x").searchParams)).toEqual({
        cgc_id: "camera1",
        cgc_view: "live",
        cgc_live: "main",
        cgc_fs: "1",
      });
    } finally {
      window.removeEventListener("location-changed", onMove);
    }
  });

  it("arriving by such a swipe: that quality, and the player takes the full screen over", async () => {
    const Player: any = customElements.get("cgc-nvr-player");
    const enter = vi.spyOn(Player.prototype, "_enterFullscreen").mockResolvedValue(true);
    link({ cgc_id: "front_right", cgc_view: "live", cgc_live: "sub", cgc_fs: "1" });
    const card = makeCard();
    await showLive(card);
    await vi.advanceTimersByTimeAsync(10);
    expect(card._viewMode).toBe("live");
    expect(card._getEffectiveLiveCamera()).toBe("camera.front_right_sub");
    expect(player(card).stream).toBe("sub");
    expect(enter).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe(""); // used once
  });
});

describe("the strip past either end of the day (owner 10-23)", () => {
  it("past the oldest end: the day before, on its newest; past the newest end: the next day, on its oldest", async () => {
    const card = makeCard();
    await show(card);
    card._setViewMode("media");
    await card.updateComplete;
    expect(card._selectedDay ?? DAYS[0]).toBe("2026-10-19");
    expect(card._stripEdgeDay(1)).toBe(true); // the right end: older
    await card.updateComplete;
    await vi.advanceTimersByTimeAsync(50);
    expect(card._selectedDay).toBe("2026-10-18");
    expect(card._selectedIndex).toBe(0); // its newest, at the left
    expect(card._stripEdgeDay(1)).toBe(false); // nothing older
    expect(card._stripEdgeDay(-1)).toBe(true); // the left end: newer
    await card.updateComplete;
    await vi.advanceTimersByTimeAsync(50);
    expect(card._selectedDay).toBe("2026-10-19");
    expect(card._selectedIndex).toBe(2); // its oldest, at the right
  });

  it("oldest-first strips go the other way", async () => {
    const card = makeCard({ thumb_sort_order: "oldest" });
    await show(card);
    card._setViewMode("media");
    await card.updateComplete;
    expect(card._stripEdgeDay(-1)).toBe(true); // the left end of an oldest-first strip: older
    await card.updateComplete;
    expect(card._selectedDay).toBe("2026-10-18");
  });
});
