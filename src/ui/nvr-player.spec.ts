// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { formatClockFromMs } from "../util/locale";

// BL-008: <cgc-nvr-player> against a fake NVR Playback add-on and a fake hls.js.

const BASE = "/api/hassio_ingress/tok/";
const NAME = "1-7-0-01260919150001-00000";
const MAIN = "0-7-0-01260919150001-00000";
const FILE_START = Date.UTC(2026, 9, 19, 15, 0, 1);
const T = FILE_START + 753_000;
const NOW = new Date(Date.UTC(2026, 9, 19, 21, 0, 0));
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

class FakeHls {
  static instances: FakeHls[] = [];
  static isSupported() {
    return true;
  }
  static Events = { MANIFEST_PARSED: "manifestParsed", ERROR: "hlsError" };
  static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" };
  handlers: Record<string, (...a: any[]) => void> = {};
  src = "";
  media: HTMLVideoElement | null = null;
  destroyed = false;
  recovered = 0;
  constructor(public config: any) {
    FakeHls.instances.push(this);
  }
  on(ev: string, fn: (...a: any[]) => void) {
    this.handlers[ev] = fn;
  }
  loadSource(u: string) {
    this.src = u;
  }
  attachMedia(v: HTMLVideoElement) {
    this.media = v;
  }
  recoverMediaError() {
    this.recovered++;
  }
  destroy() {
    this.destroyed = true;
  }
}

const status = (over: Record<string, unknown> = {}) => ({
  name: NAME,
  channel: 7,
  stream: "sub",
  state: "downloading",
  error: "",
  file_start_ms: FILE_START,
  file_end_ms: FILE_START + 1_800_000,
  duration_s: 1800,
  available_s: 300,
  bytes: 1,
  rate_bps: 12_000_000,
  codecs: "avc1.640033,mp4a.40.2",
  width: 896,
  height: 512,
  target_s: 753,
  ready: false,
  progress: 0.4,
  eta_s: 5,
  ...over,
});

type Call = { url: string; init: any };
type Route = (url: string, init: any) => { status: number; body: unknown } | undefined;

function installFetch(route: Route): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any = {}) => {
      calls.push({ url, init });
      const r =
        route(url, init) ??
        (url.includes("api/stop/") ? { status: 200, body: { ok: true } } : undefined);
      const { status: code, body } = r ?? { status: 404, body: {} };
      return { status: code, ok: code >= 200 && code < 300, json: async () => body } as any;
    })
  );
  return calls;
}

/** api/play answers "fetching", the first status poll "ready". */
const happyRoute =
  (over: Record<string, unknown> = {}): Route =>
  (url) => {
    if (url === `${BASE}api/play`) return { status: 200, body: status(over) };
    if (url.startsWith(`${BASE}api/status/`))
      return {
        status: 200,
        body: status({ ready: true, progress: 1, eta_s: 0, available_s: 760, ...over }),
      };
    return undefined;
  };

function makeHass(over: Record<string, (msg: any) => unknown> = {}) {
  let n = 0;
  const handlers: Record<string, (msg: any) => unknown> = {
    "/addons/local_nvr_playback/info": () => ({ ingress_url: BASE, state: "started" }),
    "/ingress/session": () => ({ session: `sess${++n}` }),
    "/ingress/validate_session": () => ({}),
    ...over,
  };
  return {
    locale: { language: "en-US", time_format: "24", first_weekday: "sunday" },
    callWS: vi.fn(async (msg: any) => {
      const h = handlers[msg.endpoint];
      if (!h) throw { code: "not_found" };
      return h(msg);
    }),
  };
}

let resetNvrShared: () => void;
let warmNvr: (hass: any, addon: string, channel: number) => Promise<void>;
let cookies: string[] = [];

beforeAll(async () => {
  ({ resetNvrShared, warmNvr } = (await import("../nvr/nvr-player.js")) as any);
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetNvrShared();
  FakeHls.instances = [];
  vi.stubGlobal("Hls", FakeHls);
  vi.stubGlobal("MediaSource", { isTypeSupported: (t: string) => !t.includes("hvc1") });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
  // The cookie is scoped to /api/hassio_ingress/, so the test page (at /) can't read it back: record the writes.
  cookies = [];
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: (v: string) => {
      cookies.push(v);
    },
  });
});

afterEach(() => {
  delete (document as any).cookie;
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flush = async (ms = 0) => {
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(i === 0 ? ms : 0);
};

async function mount(props: Record<string, unknown> = {}, hass = makeHass()) {
  const el: any = document.createElement("cgc-nvr-player");
  Object.assign(el, {
    hass,
    channel: 7,
    time: T,
    stream: "sub",
    addon: "local_nvr_playback",
    poster: "/local/p.jpg",
    ...props,
  });
  document.body.append(el);
  await el.updateComplete;
  await flush();
  await el.updateComplete;
  return el;
}

const text = (el: any) => (el.shadowRoot.textContent as string).replace(/\s+/g, " ");
const video = (el: any): HTMLVideoElement => el.shadowRoot.querySelector("video");
const button = (el: any, label: string): HTMLButtonElement =>
  [...el.shadowRoot.querySelectorAll("button")].find(
    (b: HTMLButtonElement) => b.textContent!.trim() === label
  );
const plays = (calls: Call[]) =>
  calls.filter((c) => c.url === `${BASE}api/play`).map((c) => JSON.parse(c.init.body));

describe("<cgc-nvr-player>", () => {
  it("fetches up to the moment with progress over the poster, then plays it from there with hls.js", async () => {
    const calls = installFetch(happyRoute());
    const el = await mount();
    expect(plays(calls)).toEqual([{ channel: 7, stream: "sub", time: T, client: el._client }]);
    expect(cookies).toEqual(["ingress_session=sess1;path=/api/hassio_ingress/;SameSite=Strict"]);
    expect(text(el)).toContain("Fetching the low-resolution recording from the NVR");
    expect(text(el)).toContain("40% · skipping 13 min of the recording · ~5 s");
    expect(el.shadowRoot.querySelector(".nvr-wait").getAttribute("style")).toContain(
      "/local/p.jpg"
    );

    await flush(450);
    await el.updateComplete;
    const hls = FakeHls.instances[0]!;
    expect(hls.config.startPosition).toBe(753);
    expect(hls.src).toBe(`${BASE}hls/${NAME}/index.m3u8?c=${el._client}&start=753.000`);
    expect(hls.media).toBe(video(el));
    expect(text(el)).toContain("Starting playback");

    video(el).dispatchEvent(new Event("canplay"));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector(".nvr-wait")).toBeNull();
    Object.defineProperty(video(el), "currentTime", { value: 754.5, configurable: true });
    video(el).dispatchEvent(new Event("timeupdate"));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector(".nvr-clock").textContent).toBe(
      formatClockFromMs(FILE_START + 754_500, el.hass.locale)
    );

    el.remove();
    expect(hls.destroyed).toBe(true);
    expect(
      calls.some(
        (c) => c.url === `${BASE}api/stop/${NAME}?c=${el._client}` && c.init.method === "POST"
      )
    ).toBe(true);
  });

  it("plays with the browser's own HLS on an iPhone, from the moment", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockImplementation((t: string) =>
      t === "application/vnd.apple.mpegurl" ? "maybe" : "probably"
    );
    installFetch(happyRoute());
    const el = await mount();
    await flush(450);
    expect(FakeHls.instances).toHaveLength(0);
    expect(video(el).getAttribute("src")).toBe(
      `${BASE}hls/${NAME}/index.m3u8?c=${el._client}&start=753.000`
    );
  });

  it("High on a device without HEVC: says so, frees the NVR, and offers Low", async () => {
    const calls = installFetch((url) => {
      const main = {
        name: MAIN,
        stream: "main",
        codecs: "hvc1.1.6.L150,mp4a.40.2",
        width: 4512,
        height: 2512,
      };
      if (url === `${BASE}api/play`) return { status: 200, body: status(main) };
      return undefined;
    });
    const el = await mount({ stream: "main" });
    expect(text(el)).toContain("This device can't play the High stream (HEVC 4512×2512)");
    expect(calls.some((c) => c.url.startsWith(`${BASE}api/stop/${MAIN}`))).toBe(true);
    const events: string[] = [];
    el.addEventListener("nvr-stream", (e: any) => events.push(e.detail.stream));
    button(el, "Play Low").click();
    await flush();
    expect(events).toEqual(["sub"]);
    expect(plays(calls).map((p) => p.stream)).toEqual(["main", "sub"]);
  });

  it("no recording at that moment: says so, without a retry", async () => {
    installFetch((url) =>
      url === `${BASE}api/play`
        ? { status: 404, body: { error: "no_recording", message: "x" } }
        : undefined
    );
    const el = await mount();
    expect(text(el)).toContain("The NVR has no recording at this moment.");
    expect(button(el, "Try again")).toBeUndefined();
    expect(button(el, "Back")).toBeDefined();
  });

  it("the add-on missing is explained, and Back asks the card to close", async () => {
    installFetch(() => undefined);
    const el = await mount(
      {},
      makeHass({ "/addons/local_nvr_playback/info": () => Promise.reject({ code: "x" }) })
    );
    expect(text(el)).toContain("The NVR Playback add-on isn't installed.");
    let closed = 0;
    el.addEventListener("nvr-close", () => closed++);
    button(el, "Back").click();
    expect(closed).toBe(1);
  });

  it("an expired ingress session is replaced once and the request repeated", async () => {
    let first = true;
    const calls = installFetch((url) => {
      if (url === `${BASE}api/play` && first) {
        first = false;
        return { status: 401, body: null };
      }
      return happyRoute()(url, {});
    });
    const hass = makeHass();
    await mount({}, hass);
    const sessions = hass.callWS.mock.calls.filter(
      ([m]: any[]) => m.endpoint === "/ingress/session"
    );
    expect(sessions).toHaveLength(2);
    expect(plays(calls)).toHaveLength(2);
    expect(cookies[cookies.length - 1]).toContain("ingress_session=sess2;");
  });

  it("switching to High keeps the moment being watched; the end of a recording goes on to the next", async () => {
    const calls = installFetch(happyRoute());
    const el = await mount();
    await flush(450);
    video(el).dispatchEvent(new Event("canplay"));
    Object.defineProperty(video(el), "currentTime", { value: 800, configurable: true });
    video(el).dispatchEvent(new Event("timeupdate"));
    await el.updateComplete;
    button(el, "High").click();
    await flush();
    expect(plays(calls)[1]).toMatchObject({ stream: "main", time: FILE_START + 800_000 });

    video(el).dispatchEvent(new Event("ended"));
    await flush();
    expect(plays(calls)[2]).toMatchObject({ stream: "main", time: FILE_START + 1_800_000 + 1000 });
  });

  it("bare: the clock and full screen, the host has its own Low / High and close", async () => {
    installFetch(happyRoute());
    const el = await mount({ bare: true });
    expect(el.shadowRoot.querySelector(".nvr-clock")).not.toBeNull();
    expect(el.shadowRoot.querySelector(".nvr-fs")).not.toBeNull();
    expect(el.shadowRoot.querySelector(".nvr-res")).toBeNull();
    expect(el.shadowRoot.querySelector(".nvr-close")).toBeNull();
  });

  it("a moment at 'now' starts a little earlier, where the NVR has video", async () => {
    const calls = installFetch(happyRoute());
    await mount({ time: NOW.getTime() });
    expect(plays(calls)[0]!.time).toBe(NOW.getTime() - 20_000);
  });

  it("a fatal hls.js media error is retried once, then shown", async () => {
    installFetch(happyRoute());
    const el = await mount();
    await flush(450);
    const hls = FakeHls.instances[0]!;
    hls.handlers["hlsError"]!({}, { fatal: true, type: "mediaError" });
    expect(hls.recovered).toBe(1);
    hls.handlers["hlsError"]!({}, { fatal: true, type: "mediaError" });
    await el.updateComplete;
    expect(text(el)).toContain("The recording couldn't be played.");
    expect(hls.destroyed).toBe(true);
  });

  it("quiet: loads unseen, without progress, and shows itself once the video plays", async () => {
    installFetch(happyRoute({ engine: "replay", state: "streaming" }));
    const el = await mount({ quiet: true });
    const events: string[] = [];
    el.addEventListener("nvr-reveal", () => events.push("reveal"));
    expect(el.hasAttribute("quiet")).toBe(true);
    expect(el.hasAttribute("revealed")).toBe(false);
    expect(el.shadowRoot.querySelector(".nvr-wait")).toBeNull();
    await flush(200);
    await el.updateComplete;
    expect(FakeHls.instances).toHaveLength(1);
    expect(el.shadowRoot.querySelector(".nvr-wait")).toBeNull();
    video(el).dispatchEvent(new Event("canplay")); // a first frame isn't playing yet
    await el.updateComplete;
    expect(el.hasAttribute("revealed")).toBe(false);
    video(el).dispatchEvent(new Event("playing"));
    await el.updateComplete;
    expect(el.hasAttribute("revealed")).toBe(true);
    expect(events).toEqual(["reveal"]);
  });

  it("quiet: a start that fails closes itself without a word", async () => {
    const calls = installFetch((url) =>
      url === `${BASE}api/play`
        ? { status: 404, body: { error: "no_recording", message: "x" } }
        : undefined
    );
    const closes: any[] = [];
    document.addEventListener("nvr-close", (e: any) => closes.push(e.detail), { once: true });
    const el = await mount({ quiet: true });
    expect(closes).toEqual([{ quiet: true, error: "The NVR has no recording at this moment." }]);
    expect(el.hasAttribute("revealed")).toBe(false);
    expect(el.shadowRoot.querySelector(".nvr-box")).toBeNull();
    expect(plays(calls)).toHaveLength(1);
  });

  it("quiet turned off while it loads (the viewer tapped Low) shows the progress", async () => {
    installFetch(happyRoute({ engine: "replay", state: "streaming" }));
    const el = await mount({ quiet: true });
    el.quiet = false;
    await el.updateComplete;
    expect(el.hasAttribute("quiet")).toBe(false);
    expect(text(el)).toContain("Opening the low-resolution recording");
  });

  it("the replay engine asks again for a slow part; the download fallback waits for it", async () => {
    installFetch(happyRoute({ engine: "replay", state: "streaming" }));
    await mount();
    await flush(200);
    expect(FakeHls.instances[0]!.config.fragLoadPolicy.default.maxTimeToFirstByteMs).toBe(15_000);
    document.body.replaceChildren();
    FakeHls.instances = [];
    installFetch(happyRoute());
    await mount();
    await flush(450);
    expect(FakeHls.instances[0]!.config.fragLoadPolicy.default.maxTimeToFirstByteMs).toBe(240_000);
  });

  describe("full screen", () => {
    // As in Home Assistant: the document sees only the outermost host; the player's own root sees its element.
    let fsElement: Element | null = null;
    let fsInner: Element | null = null;
    const enter = (el: Element) => {
      fsInner = el;
      fsElement = document.body;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    const request = vi.fn(async function (this: Element) {
      enter(this);
    });
    const exit = vi.fn(async () => {
      fsElement = fsInner = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    const lock = vi.fn(() => Promise.reject(new Error("NotSupportedError")));
    const unlock = vi.fn();

    beforeEach(() => {
      fsElement = fsInner = null;
      request.mockClear();
      exit.mockClear();
      Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
        configurable: true,
        value: request,
      });
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => fsElement,
      });
      Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
      Object.defineProperty(ShadowRoot.prototype, "fullscreenElement", {
        configurable: true,
        get(this: ShadowRoot) {
          return fsInner && this.contains(fsInner) ? fsInner : null;
        },
      });
      vi.stubGlobal("screen", { orientation: { lock, unlock } });
      vi.stubGlobal("DeviceMotionEvent", class {});
    });

    afterEach(() => {
      delete (HTMLElement.prototype as any).requestFullscreen;
      delete (document as any).fullscreenElement;
      delete (document as any).exitFullscreen;
      delete (ShadowRoot.prototype as any).fullscreenElement;
    });

    const motion = (x: number) => {
      const e: any = new Event("devicemotion");
      e.accelerationIncludingGravity = { x, y: 0, z: 0 };
      window.dispatchEvent(e);
    };

    it("is the player's own (the native button is hidden), landscape, and turns with the phone", async () => {
      installFetch(happyRoute());
      const el = await mount();
      expect(video(el).getAttribute("controlslist")).toBe("nofullscreen");
      el.shadowRoot.querySelector(".nvr-fs").click();
      await flush();
      await el.updateComplete;
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.contexts[0]).toBe(el.shadowRoot.querySelector(".nvr"));
      expect(lock).toHaveBeenCalledWith("landscape"); // refused (a WebView): the picture is turned instead
      expect(el.shadowRoot.querySelector(".nvr").classList.contains("fs")).toBe(true);
      expect(el.shadowRoot.querySelector(".nvr-fs").getAttribute("title")).toBe("Exit full screen");
      const stage = () => el.shadowRoot.querySelector(".nvr-stage").getAttribute("style");
      expect(stage()).toBe("--nvr-rot:90deg");
      motion(-9.5); // held with its top to the right
      await el.updateComplete;
      expect(stage()).toBe("--nvr-rot:-90deg");
      motion(2); // in between: no change
      await el.updateComplete;
      expect(stage()).toBe("--nvr-rot:-90deg");

      el.shadowRoot.querySelector(".nvr-fs").click();
      await flush();
      await el.updateComplete;
      expect(exit).toHaveBeenCalledTimes(1);
      expect(el.shadowRoot.querySelector(".nvr").classList.contains("fs")).toBe(false);
      motion(9.5); // no longer listened to
      await el.updateComplete;
      expect(stage()).toBe("--nvr-rot:-90deg");
    });

    it("someone else's full screen isn't the player's", async () => {
      installFetch(happyRoute());
      const el = await mount();
      fsInner = document.createElement("div");
      fsElement = fsInner;
      document.dispatchEvent(new Event("fullscreenchange"));
      await el.updateComplete;
      expect(el.shadowRoot.querySelector(".nvr").classList.contains("fs")).toBe(false);
    });

    it("an iPhone uses the video's own full screen, whose player turns with the phone", async () => {
      delete (HTMLElement.prototype as any).requestFullscreen;
      const native = vi.fn();
      (HTMLVideoElement.prototype as any).webkitEnterFullscreen = native;
      try {
        installFetch(happyRoute());
        const el = await mount();
        el.shadowRoot.querySelector(".nvr-fs").click();
        await flush();
        expect(native).toHaveBeenCalledTimes(1);
        expect(native.mock.contexts[0]).toBe(video(el));
      } finally {
        delete (HTMLVideoElement.prototype as any).webkitEnterFullscreen;
      }
    });
  });

  it("warmNvr has the add-on list the camera's day, at most every 10 minutes", async () => {
    const calls = installFetch((url) =>
      url === `${BASE}api/warm` ? { status: 202, body: { ok: true } } : undefined
    );
    const hass = makeHass();
    await warmNvr(hass, "local_nvr_playback", 7);
    await warmNvr(hass, "local_nvr_playback", 7);
    const warms = () => calls.filter((c) => c.url === `${BASE}api/warm`);
    expect(warms()).toHaveLength(1);
    expect(JSON.parse(warms()[0]!.init.body)).toEqual({ channel: 7 });
    expect(warms()[0]!.init.method).toBe("POST");
    await warmNvr(hass, "local_nvr_playback", 6); // another camera
    expect(warms()).toHaveLength(2);
    vi.setSystemTime(NOW.getTime() + 10 * 60_000 + 1);
    await warmNvr(hass, "local_nvr_playback", 7);
    expect(warms()).toHaveLength(3);
    await warmNvr(null, "local_nvr_playback", 5); // no hass yet: nothing
    expect(warms()).toHaveLength(3);
  });

  it("a warm-up that failed is tried again a minute later, not ten", async () => {
    const calls = installFetch(() => undefined);
    const broken = makeHass({
      "/addons/local_nvr_playback/info": () => Promise.reject({ code: "x" }),
    });
    await warmNvr(broken, "local_nvr_playback", 7);
    vi.setSystemTime(NOW.getTime() + 61_000);
    await warmNvr(makeHass(), "local_nvr_playback", 7);
    expect(calls.filter((c) => c.url === `${BASE}api/warm`)).toHaveLength(1);
  });
});
