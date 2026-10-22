// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Owner 10-22: "why does the live stream player look different than streaming from the NVR? fix it". The live
// view plays in the NVR player (live mode): the host's stream as its children, the player's own controls.

const BASE = "/api/hassio_ingress/tok/";
const NOW = new Date(Date.UTC(2026, 9, 22, 19, 30, 0));

let resetNvrShared: () => void;
let localFileName: (t: string, ms: number) => string;

beforeAll(async () => {
  ({ resetNvrShared, localFileName } = (await import("../nvr/nvr-player.js")) as any);
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetNvrShared();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeHass() {
  return {
    locale: { language: "en-US" },
    callWS: vi.fn(async (msg: any) => {
      if (msg.endpoint === "/addons/local_nvr_playback/info")
        return { ingress_url: BASE, state: "started" };
      if (msg.endpoint === "/ingress/session") return { session: "sess1" };
      if (msg.endpoint === "/ingress/validate_session") return {};
      throw { code: "not_found" };
    }),
  };
}

/** The host's live stream: a video in a shadow root, as Home Assistant's player has it. */
function liveChild(w = 896, h = 512) {
  const wrap = document.createElement("div");
  const player = document.createElement("div");
  const video = document.createElement("video");
  Object.defineProperty(video, "videoWidth", { value: w, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: h, configurable: true });
  player.attachShadow({ mode: "open" }).append(video);
  wrap.append(player);
  return { wrap, video };
}

async function mount(props: Record<string, unknown> = {}, child = liveChild()) {
  const el: any = document.createElement("cgc-nvr-player");
  Object.assign(el, {
    hass: makeHass(),
    live: true,
    liveStreams: ["sub", "main"],
    stream: "main",
    liveMuted: true,
    docfs: true,
    ...props,
  });
  el.append(child.wrap);
  document.body.append(el);
  await el.updateComplete;
  await vi.advanceTimersByTimeAsync(0);
  await el.updateComplete;
  return el;
}

const q = (el: any, sel: string) => el.shadowRoot.querySelector(sel);
const events = (el: any, name: string) => {
  const got: any[] = [];
  el.addEventListener(name, (e: any) => got.push(e.detail));
  return got;
};

describe("<cgc-nvr-player live>", () => {
  it("shows the host's stream with the recording's controls: Low / High, snapshot, mute, full screen", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const el = await mount({
      actions: [{ id: "floodlight", icon: "mdi:flashlight", label: "Floodlight" }],
    });
    expect(el._phase).toBe("live");
    // The host's children are drawn in the picture's box; the player's own video is hidden.
    const slot = q(el, ".nvr-live slot") as HTMLSlotElement;
    expect(slot.assignedElements()).toHaveLength(1);
    expect(q(el, "video").hasAttribute("hidden")).toBe(true);
    const res = [...el.shadowRoot.querySelectorAll(".nvr-res button")] as HTMLButtonElement[];
    expect(res.map((b) => [b.textContent!.trim(), b.classList.contains("on")])).toEqual([
      ["Low", false],
      ["High", true],
    ]);
    expect(q(el, ".nvr-close")).toBeNull(); // the host's own buttons leave live
    const ctl = q(el, ".nvr-ctl-live");
    expect([...ctl.querySelectorAll("button")].map((b: any) => b.className)).toEqual([
      "nvr-icon nvr-shot",
      "nvr-icon nvr-mute",
      "nvr-icon nvr-fs",
    ]);
    expect(q(el, ".nvr-seek")).toBeNull();
    expect(q(el, ".nvr-rec")).toBeNull();
    expect(q(el, ".nvr-big")).toBeNull();
    expect(q(el, ".nvr-wait")).toBeNull();
    expect(q(el, ".cam-act.floodlight")).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled(); // nothing is asked of the NVR
  });

  it("one stream (the doorbell): no Low / High", async () => {
    const el = await mount({ liveStreams: [] });
    expect(q(el, ".nvr-res")).toBeNull();
    expect(q(el, ".nvr-ctl-live .nvr-fs")).not.toBeNull();
  });

  it("Low / High and mute ask the host, which owns the stream", async () => {
    const el = await mount();
    const streams = events(el, "nvr-stream");
    const mutes = events(el, "nvr-mute");
    (el.shadowRoot.querySelectorAll(".nvr-res button")[0] as HTMLButtonElement).click();
    await el.updateComplete;
    expect(streams).toEqual([{ stream: "sub", live: true }]);
    expect(q(el, ".nvr-res button.on").textContent.trim()).toBe("Low");
    q(el, ".nvr-mute").click();
    expect(mutes).toEqual([{ muted: false }]);
    expect(q(el, ".nvr-mute ha-icon").getAttribute("icon")).toBe("mdi:volume-off");
    el.liveMuted = false; // the host followed
    await el.updateComplete;
    expect(q(el, ".nvr-mute ha-icon").getAttribute("icon")).toBe("mdi:volume-high");
  });

  it("the controls hide a moment after they show, like a playing recording's; a tap brings them back", async () => {
    const el = await mount();
    expect(q(el, ".nvr-ui").classList.contains("shown")).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    await el.updateComplete;
    expect(q(el, ".nvr-ui").classList.contains("shown")).toBe(false);
    el._onTap();
    await el.updateComplete;
    expect(q(el, ".nvr-ui").classList.contains("shown")).toBe(true);
  });

  it("a swipe asks for the next camera's live view, in the same quality", async () => {
    const el = await mount();
    const swipes = events(el, "nvr-swipe");
    el._swipe(1);
    expect(swipes).toEqual([
      { dir: 1, time: NOW.getTime(), stream: "main", fullscreen: false, live: true },
    ]);
  });

  it("a double tap zooms the picture, as on a snapshot", async () => {
    const el = await mount();
    q(el, ".nvr-stage").getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 225, right: 400, bottom: 225 }) as DOMRect;
    el._tapAt(300, 100);
    el._tapAt(300, 100);
    await el.updateComplete;
    expect(el._zoom.s).toBeGreaterThan(1);
    expect(q(el, ".nvr-live").getAttribute("style")).toContain("scale(");
  });

  it("a portrait stream (a camera on its side) is known from the host's video", async () => {
    const el = await mount({}, liveChild(512, 896));
    await vi.advanceTimersByTimeAsync(600);
    await el.updateComplete;
    expect(q(el, ".nvr").classList.contains("portrait")).toBe(true);
    expect(el._portraitContent()).toBe(true);
  });

  it("children with slot=top (the doorbell's talk bar) lie over the picture", async () => {
    const child = liveChild();
    const el: any = document.createElement("cgc-nvr-player");
    Object.assign(el, { hass: makeHass(), live: true, liveStreams: [] });
    const talk = document.createElement("div");
    talk.slot = "top";
    el.append(child.wrap, talk);
    document.body.append(el);
    await el.updateComplete;
    expect((q(el, ".nvr-top slot[name=top]") as HTMLSlotElement).assignedElements()).toEqual([
      talk,
    ]);
  });

  describe("snapshot", () => {
    beforeEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        drawImage: () => {},
        translate: () => {},
        rotate: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(256).fill(200) }),
      } as any);
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: any) {
        cb(new Blob(["jpg"], { type: "image/jpeg" }));
      });
    });

    it("saves the frame on screen through the add-on (named and dated), as a recording's", async () => {
      const posts: any[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: any = {}) => {
          posts.push({ url, init });
          return {
            ok: true,
            status: 200,
            json: async () => ({ url: "export/1/Front Right.jpg", file: "Front Right.jpg" }),
          } as any;
        })
      );
      const clicks: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, "dispatchEvent").mockImplementation(function (
        this: HTMLAnchorElement
      ) {
        clicks.push(this.href);
        return true;
      });
      const el = await mount({ channel: 7, label: "Front Right" });
      await el._snapshot();
      const save = posts.find((p) => p.url.includes("api/save"));
      expect(save.url).toBe(`${BASE}api/save?channel=7&time=${NOW.getTime()}&title=Front+Right`);
      expect(clicks[0]).toContain(`${BASE}export/1/`);
      expect(el._toast.text).toBe("Saved · Front Right.jpg");
    });

    it("a camera without an NVR channel (the doorbell): downloaded from the page", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      vi.stubGlobal(
        "URL",
        Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} })
      );
      const names: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, "dispatchEvent").mockImplementation(function (
        this: HTMLAnchorElement
      ) {
        names.push(this.download);
        return true;
      });
      const el = await mount({ label: "Doorbell", liveStreams: [] });
      await el._snapshot();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(names).toEqual([`${localFileName("Doorbell", NOW.getTime())}.jpg`]);
      expect(names[0]).toMatch(/^Doorbell \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.jpg$/);
    });

    it("nothing on screen yet: says so", async () => {
      const el = await mount({ channel: 7 }, liveChild(0, 0));
      await el._snapshot();
      expect(el._toast.kind).toBe("err");
    });
  });

  it("set back to a recording: the NVR is asked as usual", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: false, status: 404, json: async () => ({}) } as any;
      })
    );
    const el = await mount({ channel: 7, time: NOW.getTime() - 60_000 });
    el.live = false;
    await el.updateComplete;
    await vi.advanceTimersByTimeAsync(10);
    expect(el._phase).not.toBe("live");
    expect(calls.some((u) => u.endsWith("api/play"))).toBe(true);
  });
});
