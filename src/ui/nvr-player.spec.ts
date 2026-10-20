// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
let fmtTime: (s: number) => string;
let cookies: string[] = [];

beforeAll(async () => {
  ({ resetNvrShared, warmNvr, fmtTime } = (await import("../nvr/nvr-player.js")) as any);
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
    expect(el._clock).toBe(FILE_START + 754_500); // kept for Low / High; not shown (the camera shows the time)
    expect(el.shadowRoot.querySelector(".nvr-clock")).toBeNull();
    expect(el.shadowRoot.textContent).not.toContain("NVR");

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

  it("bare: no top bar (the host has its own Low / High and close), full screen in the controls", async () => {
    installFetch(happyRoute());
    const el = await mount({ bare: true });
    expect(el.shadowRoot.querySelector(".nvr-bar")).toBeNull();
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

    it("is the player's own (no native controls), landscape, and turns with the phone", async () => {
      installFetch(happyRoute());
      const el = await mount();
      expect(video(el).hasAttribute("controls")).toBe(false);
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

  describe("the overlay controls", () => {
    const pe = (type: string, x: number, y: number): any =>
      new ((window as any).PointerEvent ?? MouseEvent)(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
      });
    const ui = (el: any) => el.shadowRoot.querySelector(".nvr-ui");
    const q = (el: any, sel: string) => el.shadowRoot.querySelector(sel);
    /** A pointer event with its own id (jsdom has no PointerEvent). */
    const ptr = (type: string, id: number, x: number, y: number): any => {
      const e: any = new MouseEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
      });
      Object.defineProperty(e, "pointerId", { value: id });
      Object.defineProperty(e, "pointerType", { value: "touch" });
      return e;
    };
    /** The picture laid out at 400 × 225 px from the top-left corner (jsdom has no layout). */
    const layout = (el: any) => {
      q(el, ".nvr-stage").getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 400, height: 225, right: 400, bottom: 225 }) as DOMRect;
    };
    let nextId = 1;
    async function tapAt(el: any, x: number, y: number, wait = 350) {
      const id = nextId++;
      q(el, ".nvr-tap").dispatchEvent(ptr("pointerdown", id, x, y));
      q(el, ".nvr-tap").dispatchEvent(ptr("pointerup", id, x, y));
      if (wait) await vi.advanceTimersByTimeAsync(wait);
      await el.updateComplete;
    }

    /** A player that plays: 30 minutes long, at 753 s; `paused` is the test's to set. `extra` answers the add-on
     * calls the test adds (clips, snapshots); the calls are in `calls`. */
    let calls: Call[] = [];
    async function playing(props: Record<string, unknown> = {}, extra?: Route, engine = "replay") {
      const base = happyRoute({ engine, state: "streaming" });
      calls = installFetch((u, i) => extra?.(u, i) ?? base(u, i));
      const el = await mount(props);
      await flush(engine === "replay" ? 200 : 500); // the download engine's status polls are slower
      const v: any = video(el);
      const state = { paused: false, t: 753, muted: true };
      Object.defineProperty(v, "paused", { configurable: true, get: () => state.paused });
      Object.defineProperty(v, "duration", { configurable: true, get: () => 1800 });
      Object.defineProperty(v, "currentTime", {
        configurable: true,
        get: () => state.t,
        set: (x: number) => (state.t = x),
      });
      Object.defineProperty(v, "muted", {
        configurable: true,
        get: () => state.muted,
        set: (x: boolean) => (state.muted = x),
      });
      v.dispatchEvent(new Event("durationchange"));
      v.dispatchEvent(new Event("playing"));
      v.dispatchEvent(new Event("timeupdate"));
      await el.updateComplete;
      return { el, v, state };
    }

    it("lie over the video, hide while it plays, and come back with a tap", async () => {
      const { el, v, state } = await playing();
      expect(q(el, ".nvr-video").hasAttribute("controls")).toBe(false);
      expect(ui(el).classList.contains("shown")).toBe(true); // shown a moment when it starts
      expect(q(el, ".nvr-time").textContent.trim()).toBe("12:33 / 30:00");
      await vi.advanceTimersByTimeAsync(1900);
      await el.updateComplete;
      expect(ui(el).classList.contains("shown")).toBe(false);
      await tapAt(el, 200, 110); // a tap on the picture
      expect(ui(el).classList.contains("shown")).toBe(true);
      await tapAt(el, 200, 110); // and again: away
      expect(ui(el).classList.contains("shown")).toBe(false);

      // Paused: they stay.
      state.paused = true;
      v.dispatchEvent(new Event("pause"));
      await vi.advanceTimersByTimeAsync(5000);
      await el.updateComplete;
      expect(ui(el).classList.contains("shown")).toBe(true);
      expect(q(el, ".nvr-big").getAttribute("aria-label")).toBe("Play");
    });

    it("play / pause and mute", async () => {
      const { el, state } = await playing();
      const play = vi.mocked(HTMLMediaElement.prototype.play);
      const pause = vi.mocked(HTMLMediaElement.prototype.pause);
      q(el, ".nvr-big").click();
      expect(pause).toHaveBeenCalledTimes(1);
      state.paused = true;
      q(el, ".nvr-big").click();
      expect(play).toHaveBeenCalled();
      q(el, ".nvr-mute").click();
      await el.updateComplete;
      expect(state.muted).toBe(false);
      expect(q(el, ".nvr-mute").getAttribute("aria-label")).toBe("Mute");
    });

    it("the seek bar seeks where the finger lifts, along its own axis, also turned in full screen", async () => {
      const { el, state } = await playing();
      const bar = q(el, ".nvr-seek");
      let rect = { left: 100, width: 200, right: 300, top: 300, height: 20, bottom: 320 };
      bar.getBoundingClientRect = () => rect as DOMRect;
      bar.dispatchEvent(pe("pointerdown", 150, 310));
      await el.updateComplete;
      expect(el._drag.ratio).toBeCloseTo(0.25);
      expect(q(el, ".nvr-seek-tip")).not.toBeNull(); // the moment under the finger
      bar.dispatchEvent(pe("pointermove", 250, 310));
      await el.updateComplete;
      expect(q(el, ".nvr-seek-thumb").getAttribute("style")).toBe("left:75%");
      expect(state.t).toBe(753); // no seek while dragging (each would move the NVR)
      bar.dispatchEvent(pe("pointerup", 250, 310));
      expect(state.t).toBe(1350);

      // Turned with the picture (full screen, portrait): the bar runs down the screen, or up it.
      vi.stubGlobal("matchMedia", (m: string) => ({ matches: m.includes("portrait") }));
      el._fullscreen = true;
      el._rot = 90;
      rect = { left: 380, width: 20, right: 400, top: 100, height: 600, bottom: 700 };
      bar.dispatchEvent(pe("pointerdown", 390, 250));
      bar.dispatchEvent(pe("pointerup", 390, 250));
      expect(state.t).toBe(450); // (250 - 100) / 600 of 1800 s
      el._rot = -90;
      bar.dispatchEvent(pe("pointerdown", 390, 250));
      bar.dispatchEvent(pe("pointerup", 390, 250));
      expect(state.t).toBe(1350); // (700 - 250) / 600

      bar.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      expect(state.t).toBe(1340);
    });

    it("a quiet start shows them a moment when it shows itself", async () => {
      const { el } = await playing({ quiet: true });
      expect(el.hasAttribute("revealed")).toBe(true);
      expect(ui(el).classList.contains("shown")).toBe(true);
      await vi.advanceTimersByTimeAsync(1900);
      await el.updateComplete;
      expect(ui(el).classList.contains("shown")).toBe(false);
    });

    it("a double tap on a side skips 10 s back or forward; tapping on keeps skipping", async () => {
      const { el, state } = await playing();
      layout(el);
      await tapAt(el, 350, 110, 100);
      await tapAt(el, 350, 110, 0); // the second tap within 300 ms
      expect(state.t).toBe(763);
      expect(q(el, ".nvr-skip").textContent.replace(/\s+/g, " ").trim()).toBe("+10 s");
      await tapAt(el, 350, 110, 0); // a third tap right after: on
      expect(state.t).toBe(773);
      expect(q(el, ".nvr-skip").textContent).toContain("+20 s");
      expect(ui(el).classList.contains("shown")).toBe(true); // a skip doesn't toggle the controls
      await vi.advanceTimersByTimeAsync(900);
      await el.updateComplete;
      expect(q(el, ".nvr-skip")).toBeNull();
      await tapAt(el, 40, 110, 100);
      await tapAt(el, 40, 110, 0);
      expect(state.t).toBe(763); // the left side: back
      await vi.advanceTimersByTimeAsync(900);
      await tapAt(el, 200, 110, 100); // the middle: no skip
      await tapAt(el, 200, 110, 0);
      expect(state.t).toBe(763);
    });

    it("a single tap waits for a possible second one before it shows or hides the controls", async () => {
      const { el } = await playing();
      layout(el);
      await vi.advanceTimersByTimeAsync(1900);
      await el.updateComplete;
      await tapAt(el, 200, 110, 100);
      expect(ui(el).classList.contains("shown")).toBe(false);
      await vi.advanceTimersByTimeAsync(250);
      await el.updateComplete;
      expect(ui(el).classList.contains("shown")).toBe(true);
    });

    it("pinch zooms on the point between the fingers; one finger pans; the chip and full screen reset it", async () => {
      const { el } = await playing();
      layout(el);
      const tap = q(el, ".nvr-tap");
      tap.dispatchEvent(ptr("pointerdown", 21, 150, 112));
      tap.dispatchEvent(ptr("pointerdown", 22, 250, 112));
      tap.dispatchEvent(ptr("pointermove", 21, 100, 112));
      tap.dispatchEvent(ptr("pointermove", 22, 300, 112)); // twice as far apart
      await el.updateComplete;
      expect(el._zoom.s).toBeCloseTo(2);
      expect(q(el, ".nvr-video").getAttribute("style")).toContain("scale(2)");
      expect(el.shadowRoot.querySelector(".nvr").classList.contains("zoomed")).toBe(true);
      tap.dispatchEvent(ptr("pointerup", 22, 300, 112));
      // The finger left on the picture pans it.
      const x0 = el._zoom.x;
      tap.dispatchEvent(ptr("pointermove", 21, 70, 112));
      expect(el._zoom.x).toBeCloseTo(x0 - 30);
      tap.dispatchEvent(ptr("pointerup", 21, 70, 112));
      await el.updateComplete;
      expect(q(el, ".nvr-zoom").textContent).toContain("2.0×");
      q(el, ".nvr-zoom").click();
      await el.updateComplete;
      expect(el._zoom).toEqual({ s: 1, x: 0, y: 0 });
      expect(q(el, ".nvr-video").getAttribute("style")).toBe("");

      // Turned full screen: a finger moving down the screen pans the picture to its right.
      el._setZoom(2, 0, 0);
      vi.stubGlobal("matchMedia", (m: string) => ({ matches: m.includes("portrait") }));
      el._fullscreen = true;
      el._rot = 90;
      tap.dispatchEvent(ptr("pointerdown", 31, 200, 100));
      tap.dispatchEvent(ptr("pointermove", 31, 200, 140));
      expect([el._zoom.x, el._zoom.y + 0]).toEqual([40, 0]);
      tap.dispatchEvent(ptr("pointerup", 31, 200, 140));
      el._fsChanged(); // leaving full screen (nothing is full screen in jsdom)
      expect(el._zoom.s).toBe(1);
    });

    describe("saved to the device", () => {
      const CLIP = {
        url: "export/k1/Front%20Right%202026-10-19%2015-12-33.mp4",
        file: "Front Right 2026-10-19 15-12-33.mp4",
      };
      const SHOT = {
        url: "export/k2/Front%20Right%202026-10-19%2015-12-33.jpg",
        file: "Front Right 2026-10-19 15-12-33.jpg",
      };
      let downloads: { href: string | null; download: string; bubbles: boolean }[] = [];
      const route =
        (maxS = 900): Route =>
        (url) => {
          if (url === `${BASE}api/clip`) return { status: 200, body: { id: "clip1", max_s: maxS } };
          if (url === `${BASE}api/clip/clip1/stop`)
            return { status: 200, body: { ...CLIP, bytes: 9, seconds: 22 } };
          if (url === `${BASE}api/clip/clip1/cancel`) return { status: 200, body: { ok: true } };
          if (url.startsWith(`${BASE}api/save?`))
            return { status: 200, body: { ...SHOT, bytes: 3 } };
          return undefined;
        };
      const body = (url: string) => JSON.parse(calls.find((c) => c.url === url)!.init.body);
      const at = async (el: any, v: any, state: any, t: number) => {
        state.t = t;
        v.dispatchEvent(new Event("timeupdate"));
        await el.updateComplete;
      };

      beforeEach(() => {
        downloads = [];
        vi.spyOn(HTMLAnchorElement.prototype, "dispatchEvent").mockImplementation(function (
          this: HTMLAnchorElement,
          e: Event
        ) {
          downloads.push({
            href: this.getAttribute("href"),
            download: this.download,
            bubbles: e.bubbles,
          });
          return true;
        });
      });

      it("a snapshot posts the frame on screen and downloads the add-on's named file", async () => {
        const ctx = {
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(256).fill(40) })),
        };
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as any);
        vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: any) {
          cb(new Blob(["jpeg"], { type: "image/jpeg" }));
        });
        const { el, v } = await playing({ label: "Front Right" }, route());
        Object.defineProperty(v, "videoWidth", { configurable: true, get: () => 896 });
        Object.defineProperty(v, "videoHeight", { configurable: true, get: () => 512 });
        q(el, ".nvr-shot").click();
        await flush();
        await el.updateComplete;
        const save = calls.find((c) => c.url.startsWith(`${BASE}api/save?`))!;
        const params = new URL(save.url, "http://x").searchParams;
        expect([params.get("channel"), params.get("time"), params.get("title")]).toEqual([
          "7",
          String(FILE_START + 753_000),
          "Front Right",
        ]);
        expect(save.init.method).toBe("POST");
        expect(save.init.body).toBeInstanceOf(Blob);
        expect(ctx.drawImage).toHaveBeenCalledWith(v, 0, 0, 896, 512);
        expect(downloads).toEqual([
          { href: `${BASE}${SHOT.url}`, download: SHOT.file, bubbles: false },
        ]);
        expect(q(el, ".nvr-toast").textContent).toContain(SHOT.file);

        // A device that hands over only black: nothing is posted.
        ctx.getImageData.mockReturnValue({ data: new Uint8ClampedArray(256) });
        q(el, ".nvr-shot").click();
        await flush();
        await el.updateComplete;
        expect(calls.filter((c) => c.url.startsWith(`${BASE}api/save?`))).toHaveLength(1);
        expect(q(el, ".nvr-toast.err")).not.toBeNull();
      });

      it("records the stretches played (a skip starts a new one) and downloads the clip on stop", async () => {
        const { el, v, state } = await playing({ label: "Front Right" }, route());
        layout(el);
        q(el, ".nvr-rec").click();
        await flush();
        await el.updateComplete;
        expect(body(`${BASE}api/clip`)).toEqual({ name: NAME, client: el._client, from: 753 });
        expect(q(el, ".nvr-recchip").textContent).toContain("REC 0:00");
        expect(q(el, ".nvr-rec").getAttribute("aria-pressed")).toBe("true");
        await at(el, v, state, 760);
        await at(el, v, state, 770.5);
        expect(q(el, ".nvr-recchip").textContent).toContain("REC 0:17");
        await tapAt(el, 350, 110, 100); // a double tap: +10 s
        await tapAt(el, 350, 110, 0);
        expect(state.t).toBe(780.5);
        v.dispatchEvent(new Event("seeking"));
        await at(el, v, state, 786);
        await vi.advanceTimersByTimeAsync(900);
        q(el, ".nvr-rec").click();
        await flush();
        await el.updateComplete;
        expect(body(`${BASE}api/clip/clip1/stop`)).toEqual({
          ranges: [
            [753, 770.5],
            [780.5, 786],
          ],
          title: "Front Right",
        });
        expect(downloads).toEqual([
          { href: `${BASE}${CLIP.url}`, download: CLIP.file, bubbles: false },
        ]);
        expect(q(el, ".nvr-recchip")).toBeNull();
        expect(q(el, ".nvr-toast").textContent).toContain(CLIP.file);
      });

      it("saves the clip so far on Low / High, closing, or the longest a clip may be", async () => {
        const { el, v, state } = await playing({}, route(10));
        q(el, ".nvr-rec").click();
        await flush();
        await at(el, v, state, 758);
        button(el, "High").click(); // a new start saves what was recorded
        await flush();
        expect(body(`${BASE}api/clip/clip1/stop`)).toEqual({ ranges: [[753, 758]], title: "" });

        const p2 = await playing({}, route(10));
        p2.el.shadowRoot.querySelector(".nvr-rec").click();
        await flush();
        await at(p2.el, p2.v, p2.state, 760);
        await at(p2.el, p2.v, p2.state, 764); // 11 s: past the add-on's 10
        await flush();
        expect(body(`${BASE}api/clip/clip1/stop`)).toEqual({ ranges: [[753, 764]], title: "" });
        expect(p2.el.shadowRoot.querySelector(".nvr-toast").textContent).toContain(
          "0:10 is the longest"
        );

        const p3 = await playing({}, route());
        p3.el.shadowRoot.querySelector(".nvr-rec").click();
        await flush();
        p3.el.shadowRoot.querySelector(".nvr-rec").click(); // stopped at once: nothing played
        await flush();
        expect(calls.some((c) => c.url === `${BASE}api/clip/clip1/cancel`)).toBe(true);
        expect(calls.some((c) => c.url === `${BASE}api/clip/clip1/stop`)).toBe(false);
      });

      it("records only on the NVR's replay; a snapshot works on both engines", async () => {
        const { el } = await playing({}, route(), "download");
        expect(q(el, ".nvr-rec")).toBeNull();
        expect(q(el, ".nvr-shot")).not.toBeNull();
      });
    });

    describe("a swipe along the picture", () => {
      /** A touch event (jsdom has no Touch): `fingers` on the screen at its start. */
      const tev = (type: string, x: number, y: number, fingers = 1): any => {
        const e: any = new Event(type, { bubbles: true, composed: true, cancelable: true });
        const t = { clientX: x, clientY: y };
        Object.defineProperty(e, "touches", {
          value: type === "touchend" ? [] : Array(fingers).fill(t),
        });
        Object.defineProperty(e, "changedTouches", { value: [t] });
        return e;
      };
      /** A finger's swipe, as the browser sends it: pointer and touch events. `cancel`: the browser took the
       * gesture to pan after the first move (pointercancel); the touch events go on. */
      const swipe = async (
        el: any,
        from: [number, number],
        to: [number, number],
        { on = ".nvr-tap", cancel = false } = {}
      ) => {
        const id = nextId++;
        const target = q(el, on);
        target.dispatchEvent(ptr("pointerdown", id, ...from));
        target.dispatchEvent(tev("touchstart", ...from));
        target.dispatchEvent(ptr("pointermove", id, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2));
        if (cancel) target.dispatchEvent(ptr("pointercancel", id, 0, 0));
        else {
          target.dispatchEvent(ptr("pointermove", id, ...to));
          target.dispatchEvent(ptr("pointerup", id, ...to));
        }
        target.dispatchEvent(tev("touchend", ...to));
        await el.updateComplete;
      };
      const listen = (el: any, handled = false) => {
        const got: any[] = [];
        el.addEventListener("nvr-swipe", (e: CustomEvent) => {
          got.push(e.detail);
          if (handled) e.preventDefault();
        });
        return got;
      };

      it("asks the host for the next or previous camera, at the moment on screen, in the same quality", async () => {
        const { el } = await playing();
        layout(el);
        const got = listen(el);
        await swipe(el, [300, 100], [150, 110]); // to the left: next
        await swipe(el, [100, 100], [260, 90]); // to the right: previous
        expect(got).toEqual([
          { dir: 1, time: FILE_START + 753_000, stream: "sub", fullscreen: false },
          { dir: -1, time: FILE_START + 753_000, stream: "sub", fullscreen: false },
        ]);
        await swipe(el, [200, 40], [215, 200]); // up or down the picture: the page scrolls
        await swipe(el, [200, 100], [170, 100]); // too short
        expect(got).toHaveLength(2);
        el._setZoom(2, 0, 0); // zoomed: the finger pans
        await swipe(el, [300, 100], [150, 100]);
        expect(got).toHaveLength(2);
        expect(el._zoom.x).toBeLessThan(0);
      });

      it("counts a swipe the browser began to pan, one up to 45 degrees off, and a slow one", async () => {
        const { el } = await playing();
        layout(el);
        const got = listen(el);
        await swipe(el, [300, 100], [140, 120], { cancel: true }); // the pointer cancelled: the touch decides
        await swipe(el, [300, 60], [150, 180]); // 39 degrees down
        expect(got.map((d) => d.dir)).toEqual([1, 1]);
        await swipe(el, [300, 60], [180, 200]); // steeper than 45 degrees: no
        expect(got).toHaveLength(2);
      });

      it("works over the loading and error screens, not from the seek bar, not with two fingers", async () => {
        installFetch((url) => (url === `${BASE}api/play` ? undefined : undefined)); // the add-on never answers
        const el = await mount();
        layout(el);
        const got = listen(el);
        await swipe(el, [300, 100], [140, 100], { on: ".nvr-wait" });
        expect(got).toEqual([{ dir: 1, time: T, stream: "sub", fullscreen: false }]);

        const p = await playing();
        layout(p.el);
        const got2 = listen(p.el);
        await swipe(p.el, [100, 200], [300, 200], { on: ".nvr-seek" });
        const tap = q(p.el, ".nvr-tap");
        tap.dispatchEvent(tev("touchstart", 300, 100));
        tap.dispatchEvent(tev("touchstart", 300, 100, 2)); // a second finger: a pinch
        tap.dispatchEvent(tev("touchend", 120, 100));
        expect(got2).toEqual([]);
      });

      it("a mouse drags it too", async () => {
        const { el } = await playing();
        layout(el);
        const got = listen(el);
        const m = (type: string, x: number): any => {
          const e: any = new MouseEvent(type, {
            bubbles: true,
            composed: true,
            clientX: x,
            clientY: 100,
            button: 0,
          });
          Object.defineProperty(e, "pointerId", { value: 77 });
          Object.defineProperty(e, "pointerType", { value: "mouse" });
          return e;
        };
        const tap = q(el, ".nvr-tap");
        tap.dispatchEvent(m("pointerdown", 320));
        tap.dispatchEvent(m("pointermove", 250));
        tap.dispatchEvent(m("pointermove", 120));
        tap.dispatchEvent(m("pointerup", 120));
        expect(got.map((d) => d.dir)).toEqual([1]);
      });

      it("follows the turned picture in full screen, and a handled swipe saves the clip being recorded", async () => {
        const { el, v, state } = await playing({}, (url) =>
          url === `${BASE}api/clip`
            ? { status: 200, body: { id: "c9", max_s: 900 } }
            : url === `${BASE}api/clip/c9/stop`
              ? { status: 200, body: { url: "export/a/b.mp4", file: "b.mp4" } }
              : undefined
        );
        layout(el);
        vi.spyOn(HTMLAnchorElement.prototype, "dispatchEvent").mockReturnValue(true);
        vi.stubGlobal("matchMedia", (m: string) => ({ matches: m.includes("portrait") }));
        el._fullscreen = true;
        el._rot = 90;
        const got = listen(el);
        await swipe(el, [200, 40], [200, 190]); // down the screen = to the turned picture's right: previous
        expect(got.map((d) => [d.dir, d.fullscreen])).toEqual([[-1, true]]);
        q(el, ".nvr-rec").click();
        await flush();
        state.t = 760;
        v.dispatchEvent(new Event("timeupdate"));
        await swipe(el, [200, 190], [200, 40]); // nobody moved to another camera: still recording
        expect(el._rec).not.toBeNull();
        listen(el, true);
        await swipe(el, [200, 190], [200, 40]);
        await flush();
        expect(el._rec).toBeNull();
        expect(calls.some((c) => c.url === `${BASE}api/clip/c9/stop`)).toBe(true);
      });
    });

    describe("a camera on its side (the add-on's rotate)", () => {
      it("turns the video upright, its zoom and full screen follow, and its snapshot stands upright", async () => {
        installFetch((url) =>
          url.startsWith(`${BASE}api/save?`)
            ? { status: 200, body: { url: "export/k/x.jpg", file: "x.jpg" } }
            : undefined
        );
        const base = happyRoute({ engine: "replay", state: "streaming", rotate: 90 });
        calls = installFetch((u, i) =>
          u.startsWith(`${BASE}api/save?`)
            ? { status: 200, body: { url: "export/k/x.jpg", file: "x.jpg" } }
            : base(u, i)
        );
        const el = await mount();
        await flush(200);
        const v: any = video(el);
        Object.defineProperty(v, "paused", { configurable: true, get: () => false });
        Object.defineProperty(v, "currentTime", { configurable: true, get: () => 753 });
        Object.defineProperty(v, "videoWidth", { configurable: true, get: () => 896 });
        Object.defineProperty(v, "videoHeight", { configurable: true, get: () => 512 });
        v.dispatchEvent(new Event("playing"));
        await el.updateComplete;
        expect(el.shadowRoot.querySelector(".nvr").classList.contains("portrait")).toBe(true);
        expect(v.classList.contains("quarter")).toBe(true);
        expect(v.getAttribute("style")).toBe("transform:translate(-50%,-50%) rotate(90deg)");
        el._setZoom(2, 0, 0);
        await el.updateComplete;
        expect(v.getAttribute("style")).toBe(
          "transform:translate(-50%,-50%) translate(0px,0px) scale(2) rotate(90deg)"
        );
        el._resetZoom();
        // Full screen on a portrait screen: a portrait picture isn't turned to landscape.
        vi.stubGlobal("matchMedia", (m: string) => ({ matches: m.includes("portrait") }));
        el._fullscreen = true;
        expect(el._turn()).toBe(0);
        // The snapshot: the canvas is the turned size, drawn turned a quarter clockwise.
        const ctx = {
          drawImage: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(256).fill(40) })),
        };
        const sizes: number[][] = [];
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
          this: HTMLCanvasElement
        ) {
          sizes.push([this.width, this.height]);
          return ctx as any;
        });
        vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: any) {
          cb(new Blob(["jpeg"], { type: "image/jpeg" }));
        });
        vi.spyOn(HTMLAnchorElement.prototype, "dispatchEvent").mockReturnValue(true);
        await el._snapshot();
        expect(sizes[0]).toEqual([512, 896]);
        expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
        expect(ctx.drawImage).toHaveBeenCalledWith(v, -448, -256, 896, 512);
      });

      it("a picture the add-on doesn't turn stays as it is", async () => {
        const { el, v } = await playing();
        expect(el.shadowRoot.querySelector(".nvr").classList.contains("portrait")).toBe(false);
        expect(v.classList.contains("quarter")).toBe(false);
        expect(v.getAttribute("style")).toBe("");
      });
    });

    it("times read m:ss, or h:mm:ss from an hour", () => {
      expect([fmtTime(0), fmtTime(75.9), fmtTime(1800), fmtTime(3725), fmtTime(NaN)]).toEqual([
        "0:00",
        "1:15",
        "30:00",
        "1:02:05",
        "0:00",
      ]);
    });
  });
});
