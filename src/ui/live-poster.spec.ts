// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  POSTER_CLASS,
  attachLivePoster,
  hasPicture,
  keptFrame,
  orientationTransform,
  snapshotUrl,
} from "./live-poster";

// Owner 10-21: the camera's picture at once while its live stream connects.

let pre: any[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  pre = [];
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      src = "";
      constructor() {
        pre.push(this);
      }
    }
  );
});
afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const hassFor = (entity: string, orientation = 1) => ({
  states: { [entity]: { attributes: { entity_picture: `/api/camera_proxy/${entity}?token=t` } } },
  callWS: vi.fn(async () => ({ preload_stream: true, orientation })),
});
function setup(entity: string, orientation = 1) {
  const host = document.createElement("div");
  const player = document.createElement("div");
  const sr = player.attachShadow({ mode: "open" });
  const inner = document.createElement("div");
  const innerSr = inner.attachShadow({ mode: "open" });
  const video = document.createElement("video");
  innerSr.append(video);
  sr.append(inner);
  host.append(player);
  document.body.append(host);
  const hass = hassFor(entity, orientation);
  return { host, player, video, hass };
}
const playing = (video: HTMLVideoElement) => {
  Object.defineProperty(video, "readyState", { value: 4, configurable: true });
  Object.defineProperty(video, "videoWidth", { value: 896, configurable: true });
};
const poster = (host: HTMLElement) => host.querySelector<HTMLElement>(`.${POSTER_CLASS}`);

describe("live poster", () => {
  it("maps Home Assistant's orientations as go2rtc turns the stream", () => {
    expect(orientationTransform(1)).toEqual({ turn: false, css: "" });
    expect(orientationTransform(8)).toEqual({ turn: true, css: "rotate(90deg)" });
    expect(orientationTransform(6)).toEqual({ turn: true, css: "rotate(-90deg)" });
    expect(orientationTransform(3).turn).toBe(false);
  });

  it("asks Home Assistant for a snapshot about the size of the box", () => {
    vi.stubGlobal("devicePixelRatio", 2.625);
    const url = snapshotUrl("/api/camera_proxy/camera.x?token=t", {
      clientWidth: 412,
      clientHeight: 232,
    });
    expect(url).toMatch(/\?token=t&width=1082&height=609&_t=\d+$/);
    expect(snapshotUrl("/p", { clientWidth: 4000, clientHeight: 10 })).toContain(
      "?width=1920&height=1080&"
    );
    expect(snapshotUrl("/p", null)).toContain("?width=640&height=360&");
  });

  it("finds a playing video through nested shadow roots", () => {
    const { player, video } = setup("camera.a");
    expect(hasPicture(player)).toBe(false);
    playing(video);
    expect(hasPicture(player)).toBe(true);
  });

  it("shows the snapshot once loaded and oriented, then fades when the stream has a frame", async () => {
    const { host, player, video, hass } = setup("camera.b");
    const stop = attachLivePoster(host, player, hass, "camera.b", "contain");
    const wrap = poster(host)!;
    const img = wrap.querySelector("img")!;
    expect(img.style.visibility).toBe("hidden");
    expect(img.style.objectFit).toBe("contain");
    // the fresh snapshot loads (with a cache-buster), then is shown
    expect(pre[0].src).toMatch(
      /^\/api\/camera_proxy\/camera\.b\?token=t&width=640&height=360&_t=\d+$/
    );
    pre[0].onload();
    expect(img.getAttribute("src")).toBe(pre[0].src);
    img.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(0);
    expect(hass.callWS).toHaveBeenCalledWith({ type: "camera/get_prefs", entity_id: "camera.b" });
    expect(img.style.visibility).toBe("visible");
    await vi.advanceTimersByTimeAsync(600);
    expect(poster(host)).not.toBeNull(); // still connecting
    playing(video);
    await vi.advanceTimersByTimeAsync(160);
    expect(wrap.style.opacity).toBe("0");
    await vi.advanceTimersByTimeAsync(400);
    expect(poster(host)).toBeNull();
    stop();
  });

  it("turns the snapshot like the stream (a portrait camera)", async () => {
    const { host, player, hass } = setup("camera.c", 8);
    attachLivePoster(host, player, hass, "camera.c", "cover");
    await vi.advanceTimersByTimeAsync(0);
    pre[0].onload();
    const img = poster(host)!.querySelector("img")!;
    expect(img.style.transform).toContain("rotate(90deg)");
    expect(img.style.objectFit).toBe("cover");
  });

  it("keeps the playing frame and shows it at once next time, without asking the NVR", async () => {
    const draw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: draw } as any);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/jpeg;base64,AAAA"
    );
    const a = setup("camera.d", 8);
    const stop = attachLivePoster(a.host, a.player, a.hass, "camera.d");
    expect(pre).toHaveLength(1); // nothing kept yet: a snapshot
    playing(a.video);
    Object.defineProperty(a.video, "videoHeight", { value: 512, configurable: true });
    await vi.advanceTimersByTimeAsync(160);
    expect(draw).toHaveBeenCalledTimes(1); // kept at the first frame
    expect(draw.mock.calls[0]?.slice(3)).toEqual([896, 512]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(draw).toHaveBeenCalledTimes(2); // and every 30 s
    stop();
    expect(draw).toHaveBeenCalledTimes(3); // and when it closes
    expect(keptFrame("camera.d")?.data).toBe("data:image/jpeg;base64,AAAA");

    const b = setup("camera.d", 8);
    attachLivePoster(b.host, b.player, b.hass, "camera.d");
    const img = poster(b.host)!.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");
    expect(img.style.transform).not.toContain("rotate"); // already turned like the stream
    img.dispatchEvent(new Event("load"));
    expect(img.style.visibility).toBe("visible");
    expect(pre).toHaveLength(1); // no new snapshot

    // A kept frame older than 10 minutes: shown, and a snapshot is fetched as well (then turned).
    vi.setSystemTime(Date.now() + 11 * 60_000);
    const c = setup("camera.d", 8);
    attachLivePoster(c.host, c.player, c.hass, "camera.d");
    expect(poster(c.host)!.querySelector("img")!.getAttribute("src")).toContain("data:image/jpeg");
    expect(pre).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(0);
    pre[1].onload();
    const ci = poster(c.host)!.querySelector("img")!;
    expect(ci.getAttribute("src")).toBe(pre[1].src);
    expect(ci.style.transform).toContain("rotate(90deg)");
    // Six hours later it is not used at all.
    expect(keptFrame("camera.d", Date.now() + 7 * 3_600_000)).toBeNull();
  });

  it("nothing when the player already shows a picture or the camera has none; stop removes it", () => {
    const a = setup("camera.e");
    playing(a.video);
    attachLivePoster(a.host, a.player, a.hass, "camera.e");
    expect(poster(a.host)).toBeNull();

    const b = setup("camera.f");
    attachLivePoster(b.host, b.player, { states: {} }, "camera.f");
    expect(poster(b.host)).toBeNull();

    const c = setup("camera.g");
    const stop = attachLivePoster(c.host, c.player, c.hass, "camera.g");
    expect(poster(c.host)).not.toBeNull();
    stop();
    expect(poster(c.host)).toBeNull();
  });
});
