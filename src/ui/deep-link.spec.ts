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
    expect(moves[1]!.url.startsWith("/main-dashboard/doorbell?cgc_id=doorbell")).toBe(true);
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
    await swipe(card, -150); // on, round to the first camera: streaming again, from the same moment
    expect(query(moves[0]!.url)).toMatchObject({
      cgc_id: "front_right",
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

  it("without swipe_cameras (or when this card isn't in it) a swipe still steps through the snapshots", async () => {
    link({ cgc_id: "front_right", cgc_view: "gallery", cgc_src: ITEMS[0]!.src });
    const card = makeCard({ swipe_cameras: CAMERAS.slice(1) });
    await show(card);
    await swipe(card, -150);
    expect(moves).toEqual([]);
    expect(card._selectedIndex).toBe(1);
  });
});
