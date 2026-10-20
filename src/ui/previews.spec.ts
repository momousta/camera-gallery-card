// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ThumbPreloader } from "../data/preload";

// BL-006: previews next to the files (thumbnail_folder), low-res scrubbing, the calendar and preloading.

const DIR = "/local/snapshots/cam";
const T0 = Date.UTC(2026, 9, 19, 17, 0, 0);
const it_ = (name: string, n: number, dayKey: string) => ({
  src: `${DIR}/${name}`,
  dtMs: T0 - n * 60_000,
  dayKey,
});
const DAY1 = [
  it_("motion_20261019_120000.gif", 0, "2026-10-19"),
  it_("car_20261019_115900_snapshot.jpg", 1, "2026-10-19"),
  it_("person_20261019_115800.mp4", 2, "2026-10-19"),
];
const DAY2 = [
  it_("motion_20261017_100000.gif", 3000, "2026-10-17"),
  it_("hourly_20261017_090000.gif", 3060, "2026-10-17"),
];
const DAY3 = [it_("motion_20260930_100000.gif", 27000, "2026-09-30")];
const ALL = [...DAY1, ...DAY2, ...DAY3];
const DAYS = ["2026-10-19", "2026-10-17", "2026-09-30"];
const side = (name: string) => `${DIR}/thumbs/${name}.jpg`;

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

async function renderCard(options: Record<string, unknown> = {}, activeDay = DAYS[0]) {
  const card: any = document.createElement("camera-gallery-card");
  for (const method of [
    "_startMediaPoll",
    "_subscribeFrigateEvents",
    "_mountLiveCard",
    "_setupThumbObserver",
    "_scheduleVisibleMediaWork",
    "_queueSnapshotResolveForVisibleThumbs",
  ]) {
    vi.spyOn(card, method).mockImplementation(() => {});
  }
  vi.spyOn(card._posterClient, "prewarm").mockResolvedValue(undefined);
  const dayItems = ALL.filter((x) => x.dayKey === activeDay);
  vi.spyOn(card, "_computeBaseList").mockReturnValue({
    rawItems: ALL,
    allWithDay: ALL,
    objFiltered: dayItems,
    dayFiltered: dayItems,
    days: DAYS,
    newestDay: DAYS[0],
    activeDay,
    videoCount: 1,
    imageCount: dayItems.length - 1,
  });
  card.setConfig({
    entities: ["sensor.synthetic"],
    path_datetime_format: "YYYYMMDD_HHmmss",
    thumb_size: 100,
    ...options,
  });
  card._hass = { states: {}, locale: { language: "en-US", first_weekday: "sunday" } };
  document.body.append(card);
  await card.updateComplete;
  for (const x of ALL) card._revealedThumbs.add(x.src);
  card.requestUpdate();
  await card.updateComplete;
  return card;
}

const q = (card: any, sel: string) => card.shadowRoot.querySelector(sel);
const tileImg = (card: any, i: number): HTMLImageElement | null =>
  q(card, `button.tthumb[data-i="${i}"] img.timg`);

describe("previews next to the files (thumbnail_folder)", () => {
  it("every tile type shows its small preview", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs" });
    expect(tileImg(card, 0)?.getAttribute("src")).toBe(side("motion_20261019_120000.gif"));
    expect(tileImg(card, 1)?.getAttribute("src")).toBe(side("car_20261019_115900_snapshot.jpg"));
    expect(tileImg(card, 2)?.getAttribute("src")).toBe(side("person_20261019_115800.mp4"));
  });

  it("a preview that fails falls back to the card's own tile for that item only", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs" });
    tileImg(card, 1)!.dispatchEvent(new Event("error"));
    await card.updateComplete;
    expect(tileImg(card, 1)?.getAttribute("src")).toBe(`${DIR}/car_20261019_115900_snapshot.jpg`);
    expect(tileImg(card, 0)?.getAttribute("src")).toBe(side("motion_20261019_120000.gif"));
  });

  it("without the option, photo tiles are the photos (unchanged)", async () => {
    const card = await renderCard({});
    expect(tileImg(card, 1)?.getAttribute("src")).toBe(`${DIR}/car_20261019_115900_snapshot.jpg`);
  });

  it("while scrubbing the viewer shows the small preview, never the full photo", async () => {
    const card = await renderCard({
      thumbnail_folder: "thumbs",
      scrub_on_drag: true,
      start_mode: "gallery",
    });
    card._selectedIndex = 1;
    card._scrubbing = true;
    card.requestUpdate();
    await card.updateComplete;
    const frame = q(card, ".preview img.scrub-frame") as HTMLImageElement;
    expect(frame.getAttribute("src")).toBe(side("car_20261019_115900_snapshot.jpg"));
    // The next frame is painted over the last one that loaded, so a fast scrub never flashes empty.
    frame.dispatchEvent(new Event("load"));
    card._selectedIndex = 0;
    card.requestUpdate();
    await card.updateComplete;
    const next = q(card, ".preview img.scrub-frame") as HTMLImageElement;
    expect(next.getAttribute("src")).toBe(side("motion_20261019_120000.gif"));
    expect(next.getAttribute("style")).toContain(side("car_20261019_115900_snapshot.jpg"));
  });

  it("on pause the full photo loads over its preview", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs", start_mode: "gallery" });
    card._selectedIndex = 1;
    card._scrubbing = false;
    card.requestUpdate();
    await card.updateComplete;
    const pimg = q(card, ".preview img.pimg:not(.scrub-frame)") as HTMLImageElement;
    expect(pimg.getAttribute("src")).toBe(`${DIR}/car_20261019_115900_snapshot.jpg`);
    expect(pimg.getAttribute("style")).toContain(
      `background-image:url("${side("car_20261019_115900_snapshot.jpg")}")`
    );
  });

  it("a video gets its preview as the poster", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs", start_mode: "gallery" });
    card._selectedIndex = 2;
    card.requestUpdate();
    await card.updateComplete;
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    card._ensurePreviewVideoHostPlayback(`${DIR}/person_20261019_115800.mp4`);
    expect(card._previewVideoEl?.getAttribute("poster")).toBe(side("person_20261019_115800.mp4"));
  });
});

describe("calendar date picker", () => {
  const open = async (card: any) => {
    (q(card, ".datepill .dateinfo.datepick") as HTMLElement).click();
    await card.updateComplete;
    return q(card, ".cal-picker") as HTMLElement;
  };
  const dayBtn = (card: any, date: number) =>
    [...card.shadowRoot.querySelectorAll(".cal-day")].find(
      (b: any) => b.textContent.trim() === String(date)
    ) as HTMLButtonElement | undefined;

  it("tapping the date opens the month of the selected day; only days with clips can be picked", async () => {
    const card = await renderCard({ start_mode: "gallery" });
    const cal = await open(card);
    expect(cal).toBeTruthy();
    expect(q(card, ".cal-title").textContent).toContain("October");
    expect(q(card, ".cal-title").textContent).toContain("2026");
    expect([...card.shadowRoot.querySelectorAll(".cal-wd")].map((n: any) => n.textContent)).toEqual([
      "S", "M", "T", "W", "T", "F", "S",
    ]); // prettier-ignore
    expect(dayBtn(card, 19)?.disabled).toBe(false);
    expect(dayBtn(card, 17)?.disabled).toBe(false);
    expect(dayBtn(card, 18)?.disabled).toBe(true);
    expect(dayBtn(card, 19)?.classList.contains("on")).toBe(true);
  });

  it("picking a day selects it and closes the calendar", async () => {
    const card = await renderCard({ start_mode: "gallery" });
    await open(card);
    dayBtn(card, 17)!.click();
    await card.updateComplete;
    expect(card._selectedDay).toBe("2026-10-17");
    expect(card._selectedIndex).toBe(0);
    expect(q(card, ".cal-picker")).toBeNull();
  });

  it("the month arrows only go to months that have clips", async () => {
    const card = await renderCard({ start_mode: "gallery" });
    await open(card);
    const [prev, next] = [...card.shadowRoot.querySelectorAll(".cal-nav")] as HTMLButtonElement[];
    expect(next!.disabled).toBe(true);
    expect(prev!.disabled).toBe(false);
    prev!.click();
    await card.updateComplete;
    expect(q(card, ".cal-title").textContent).toContain("September");
    expect(dayBtn(card, 30)?.disabled).toBe(false);
    const [prev2] = [...card.shadowRoot.querySelectorAll(".cal-nav")] as HTMLButtonElement[];
    expect(prev2!.disabled).toBe(true);
  });
});

describe("preloading", () => {
  it("queues the active day outward from the selection, then the neighbour days, as previews", async () => {
    const calls: { src: string; url: string }[][] = [];
    vi.spyOn(ThumbPreloader.prototype, "setQueue").mockImplementation(function (entries) {
      calls.push([...entries]);
    });
    const card = await renderCard({
      thumbnail_folder: "thumbs",
      preload_thumbnails: true,
      preload_days: 1,
    });
    expect(calls).toEqual([]); // waits for the visible tiles first
    await vi.advanceTimersByTimeAsync(900);
    const urls = calls[calls.length - 1]!.map((e) => e.url);
    expect(urls).toEqual([
      side("motion_20261019_120000.gif"),
      side("car_20261019_115900_snapshot.jpg"),
      side("person_20261019_115800.mp4"),
      side("motion_20261017_100000.gif"),
      side("hourly_20261017_090000.gif"),
    ]);
    card.remove();
    expect(calls[calls.length - 1]).toEqual([]); // leaving the view stops what still waits
  });

  it("does nothing without previews or when switched off", async () => {
    const spy = vi.spyOn(ThumbPreloader.prototype, "setQueue");
    await renderCard({ preload_thumbnails: true });
    await renderCard({ thumbnail_folder: "thumbs" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(spy.mock.calls.filter(([e]) => e.length > 0)).toEqual([]);
  });

  it("a preview that fails to preload falls back on its tile", async () => {
    let onResult: ((e: { src: string; url: string }, ok: boolean) => void) | undefined;
    vi.spyOn(ThumbPreloader.prototype, "setQueue").mockImplementation(function (this: any) {
      onResult = this._onResult;
    });
    const card = await renderCard({ thumbnail_folder: "thumbs", preload_thumbnails: true });
    await vi.advanceTimersByTimeAsync(900);
    onResult!({ src: `${DIR}/car_20261019_115900_snapshot.jpg`, url: "x" }, false);
    await card.updateComplete;
    expect(tileImg(card, 1)?.getAttribute("src")).toBe(`${DIR}/car_20261019_115900_snapshot.jpg`);
  });
});

describe("NVR recording of the selected item (BL-008)", () => {
  const nvrPills = (card: any) =>
    [...card.shadowRoot.querySelectorAll(".nvr-pill")] as HTMLButtonElement[];
  const player = (card: any) => q(card, ".preview cgc-nvr-player");
  const settle = async (card: any) => {
    await card.updateComplete;
    await Promise.resolve();
    await card.updateComplete;
  };

  it("no Low / High without an nvr_channel", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs" });
    expect(nvrPills(card)).toHaveLength(0);
  });

  it("Low opens the player on the item's moment, over its preview", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs", nvr_channel: 7 });
    expect(nvrPills(card).map((b) => b.textContent!.trim())).toEqual(["Low", "High"]);
    nvrPills(card)[0]!.click();
    await settle(card);
    const p = player(card);
    expect(p).not.toBeNull();
    expect([p.channel, p.time, p.stream, p.addon]).toEqual([
      7,
      DAY1[0]!.dtMs,
      "sub",
      "local_nvr_playback",
    ]);
    expect(p.poster).toBe(side("motion_20261019_120000.gif"));
  });

  it("follows Low / High switches made in the player, and closes on its request", async () => {
    const card = await renderCard({ nvr_channel: 7, nvr_addon: "local_other" });
    nvrPills(card)[1]!.click();
    await settle(card);
    expect([player(card).stream, player(card).addon]).toEqual(["main", "local_other"]);
    player(card).dispatchEvent(
      new CustomEvent("nvr-stream", { detail: { stream: "sub" }, bubbles: true, composed: true })
    );
    await settle(card);
    expect(player(card).stream).toBe("sub");
    player(card).dispatchEvent(new CustomEvent("nvr-close", { bubbles: true, composed: true }));
    await settle(card);
    expect(player(card)).toBeNull();
    expect(card._nvr).toBeNull();
  });

  it("browsing to another item closes the player", async () => {
    const card = await renderCard({ nvr_channel: 7 });
    nvrPills(card)[0]!.click();
    await settle(card);
    expect(player(card)).not.toBeNull();
    card._selectedIndex = 1;
    card.requestUpdate();
    await settle(card);
    expect(player(card)).toBeNull();
    expect(card._nvr).toBeNull();
    nvrPills(card)[0]!.click();
    await settle(card);
    expect(player(card).time).toBe(DAY1[1]!.dtMs);
  });

  it("a channel that isn't a number is refused by the config", async () => {
    const card: any = document.createElement("camera-gallery-card");
    expect(() =>
      card.setConfig({
        entities: ["sensor.synthetic"],
        path_datetime_format: "YYYYMMDD_HHmmss",
        nvr_channel: "seven",
      })
    ).toThrow();
  });
});

describe("owner 10-20 16:17: pictures full screen in the NVR player; the button at the bottom right", () => {
  const fsEvent = (fullscreen: boolean, pseudo = false) =>
    new CustomEvent("nvr-fullscreen", {
      detail: { fullscreen, pseudo },
      bubbles: true,
      composed: true,
    });
  const player = (card: any) => q(card, ".preview cgc-nvr-player");

  it("the full screen button sits at the bottom right, not in the top row, and opens a picture in the player", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs", nvr_channel: 7 });
    const row = [...card.shadowRoot.querySelectorAll(".gallery-pills ha-icon")].map((i: any) =>
      i.getAttribute("icon")
    );
    expect(row).not.toContain("mdi:fullscreen");
    const btn = q(card, ".pfs-btn");
    expect(btn).not.toBeNull();
    btn.click();
    await card.updateComplete;
    expect(card._nvr).toMatchObject({
      src: DAY1[0]!.src,
      still: DAY1[0]!.src,
      stream: null,
      channel: 7,
      time: DAY1[0]!.dtMs,
      fullscreen: true,
      poster: side("motion_20261019_120000.gif"),
    });
    const p = player(card);
    expect(p.still).toBe(DAY1[0]!.src);
    expect(p.stream).toBeNull();
    expect(q(card, ".pfs-btn")).toBeNull(); // the player has its own
    p.dispatchEvent(fsEvent(false)); // full screen ends: back to the gallery
    await card.updateComplete;
    expect(card._nvr).toBeNull();
    expect(player(card)).toBeNull();
  });

  it("Low / High asked for in a picture's full screen plays on when full screen ends", async () => {
    const card = await renderCard({ nvr_channel: 7 });
    q(card, ".pfs-btn").click();
    await card.updateComplete;
    const p = player(card);
    p.dispatchEvent(
      new CustomEvent("nvr-stream", { detail: { stream: "sub" }, bubbles: true, composed: true })
    );
    await card.updateComplete;
    p.dispatchEvent(fsEvent(false));
    await card.updateComplete;
    expect(card._nvr).toMatchObject({ src: DAY1[0]!.src, stream: "sub" });
    expect(player(card)).not.toBeNull();
  });

  it("an iPhone's window-covering full screen: the viewer's box stops clipping it while it lasts", async () => {
    const card = await renderCard({ nvr_channel: 7 });
    q(card, ".pfs-btn").click();
    await card.updateComplete;
    player(card).dispatchEvent(fsEvent(true, true));
    await card.updateComplete;
    expect(q(card, ".preview").classList.contains("pseudo-fs")).toBe(true);
    player(card).dispatchEvent(fsEvent(false));
    await card.updateComplete;
    expect(q(card, ".preview").classList.contains("pseudo-fs")).toBe(false);
  });

  it("a camera without a channel (the doorbell) gets the same full screen, without Low / High", async () => {
    const card = await renderCard({});
    q(card, ".pfs-btn").click();
    await card.updateComplete;
    expect(card._nvr).toMatchObject({ still: DAY1[0]!.src, channel: null, stream: null });
    const p = player(card);
    await p.updateComplete;
    expect(p._phase).toBe("still");
    expect(p.shadowRoot.querySelector(".nvr-res")).toBeNull();
  });

  it("a video clip keeps the gallery's own full screen", async () => {
    const card = await renderCard({});
    card._selectedIndex = 2; // the 11:58 clip
    await card.updateComplete;
    q(card, ".pfs-btn").click();
    await card.updateComplete;
    expect(card._nvr).toBeNull();
    expect(card._imgFsOpen).toBe(true);
  });
});

describe("owner 10-20 16:17: auto-play all plays the day forward, as a time-lapse", () => {
  it("from the newest it starts at the day's first; a clip plays to its end, a still 1 s, a GIF 3 s; it stops at the newest", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs" });
    expect(card._selectedIndex ?? 0).toBe(0); // the newest (12:00)
    card._toggleAutoplayAll();
    await card.updateComplete;
    expect(card._galleryAutoplayAll).toBe(true);
    expect(card._selectedIndex).toBe(2); // the day's first: the 11:58 clip
    await vi.advanceTimersByTimeAsync(5000);
    expect(card._selectedIndex).toBe(2); // a clip waits for its end
    card._autoplayAdvance(); // ended
    await card.updateComplete;
    expect(card._selectedIndex).toBe(1); // the 11:59 still
    await vi.advanceTimersByTimeAsync(990);
    expect(card._selectedIndex).toBe(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(card._selectedIndex).toBe(0); // the 12:00 GIF
    await vi.advanceTimersByTimeAsync(2900);
    expect(card._galleryAutoplayAll).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(card._galleryAutoplayAll).toBe(false); // nothing newer: done
    expect(card._selectedIndex).toBe(0);
  });

  it("from an older item it plays on forward; picking another item, or the button again, stops it", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs" });
    card._selectedIndex = 1;
    await card.updateComplete;
    card._toggleAutoplayAll();
    expect(card._selectedIndex).toBe(1); // from here
    card._selectedIndex = 2; // the viewer taps another item
    await vi.advanceTimersByTimeAsync(1100);
    expect(card._galleryAutoplayAll).toBe(false);
    expect(card._selectedIndex).toBe(2);
    card._toggleAutoplayAll();
    expect(card._galleryAutoplayAll).toBe(true);
    card._toggleAutoplayAll();
    expect(card._galleryAutoplayAll).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(card._selectedIndex).toBe(2);
  });

  it("the button shows whether it plays", async () => {
    const card = await renderCard({ thumbnail_folder: "thumbs" });
    const btn = () =>
      [...card.shadowRoot.querySelectorAll(".gallery-pill")].find(
        (b: any) => b.querySelector("ha-icon")?.getAttribute("icon") === "mdi:playlist-play"
      ) as HTMLButtonElement;
    btn().click();
    await card.updateComplete;
    expect(btn().getAttribute("aria-pressed")).toBe("true");
    btn().click();
    await card.updateComplete;
    expect(btn().getAttribute("aria-pressed")).toBe("false");
  });
});
