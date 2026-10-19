import { describe, expect, it, vi } from "vitest";

import {
  AddonLocator,
  IngressSession,
  NvrError,
  SESSION_REFRESH_MS,
  clockAt,
  codecSupported,
  formatEta,
  ingressCookie,
  messageOf,
  newClientId,
  nextFileTime,
  nvrChannelOf,
  playbackMode,
  progressDetail,
  type NvrStatus,
} from "./nvr-api";

// BL-008: the parts of NVR playback that don't need a DOM.

const UA = {
  chromeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  pixel:
    "Mozilla/5.0 (Linux; Android 16; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  haAndroid:
    "Mozilla/5.0 (Linux; Android 16; Pixel 6 Build/BP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 Home Assistant/2026.10.0",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  haIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Home Assistant/2026.10.0",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
};

function fakeHass(handlers: Record<string, (msg: any) => unknown>) {
  const calls: any[] = [];
  return {
    calls,
    callWS: vi.fn(async (msg: any): Promise<any> => {
      calls.push(msg);
      const h = handlers[msg.endpoint];
      if (!h) throw { code: "unknown" };
      return h(msg);
    }),
  };
}

describe("ingress session", () => {
  it("opens one session, sets the cookie, and reuses it for a minute", async () => {
    const cookies: string[] = [];
    let n = 0;
    const hass = fakeHass({ "/ingress/session": () => ({ session: `s${++n}` }) });
    const s = new IngressSession(
      (c) => cookies.push(c),
      () => false
    );
    await Promise.all([s.ensure(hass, 1000), s.ensure(hass, 1000)]);
    await s.ensure(hass, 1000 + SESSION_REFRESH_MS - 1);
    expect(hass.calls).toEqual([
      { type: "supervisor/api", endpoint: "/ingress/session", method: "post" },
    ]);
    expect(cookies).toEqual(["ingress_session=s1;path=/api/hassio_ingress/;SameSite=Strict"]);
  });

  it("validates the session after a minute, and opens a new one when it expired", async () => {
    const cookies: string[] = [];
    let valid = true;
    let n = 0;
    const hass = fakeHass({
      "/ingress/session": () => ({ session: `s${++n}` }),
      "/ingress/validate_session": () => {
        if (!valid) throw { code: "unknown_error" };
        return {};
      },
    });
    const s = new IngressSession(
      (c) => cookies.push(c),
      () => true
    );
    await s.ensure(hass, 0);
    await s.ensure(hass, SESSION_REFRESH_MS + 1);
    expect(hass.calls[1]).toEqual({
      type: "supervisor/api",
      endpoint: "/ingress/validate_session",
      method: "post",
      data: { session: "s1" },
    });
    valid = false;
    await s.ensure(hass, 3 * SESSION_REFRESH_MS);
    expect(hass.calls.map((c) => c.endpoint)).toEqual([
      "/ingress/session",
      "/ingress/validate_session",
      "/ingress/validate_session",
      "/ingress/session",
    ]);
    expect(cookies[cookies.length - 1]).toBe(
      "ingress_session=s2;path=/api/hassio_ingress/;SameSite=Strict;Secure"
    );
  });

  it("invalidate() forces a new session; a refusal is a session error", async () => {
    let n = 0;
    const hass = fakeHass({ "/ingress/session": () => ({ session: `s${++n}` }) });
    const s = new IngressSession(
      () => {},
      () => false
    );
    await s.ensure(hass, 0);
    s.invalidate();
    await s.ensure(hass, 1);
    expect(n).toBe(2);
    const refusing = fakeHass({});
    const err = await new IngressSession(
      () => {},
      () => false
    )
      .ensure(refusing, 0)
      .catch((e) => e);
    expect(err).toBeInstanceOf(NvrError);
    expect(err.code).toBe("session");
  });

  it("the cookie is scoped to ingress", () => {
    expect(ingressCookie("abc", false)).toBe(
      "ingress_session=abc;path=/api/hassio_ingress/;SameSite=Strict"
    );
    expect(ingressCookie("abc", true)).toMatch(/;Secure$/);
  });
});

describe("add-on lookup", () => {
  it("returns the ingress URL with a trailing slash and caches it", async () => {
    const hass = fakeHass({
      "/addons/local_nvr_playback/info": () => ({
        ingress_url: "/api/hassio_ingress/tok",
        state: "started",
      }),
    });
    const loc = new AddonLocator();
    expect(await loc.base(hass, "local_nvr_playback")).toBe("/api/hassio_ingress/tok/");
    expect(await loc.base(hass, "local_nvr_playback")).toBe("/api/hassio_ingress/tok/");
    expect(hass.callWS).toHaveBeenCalledTimes(1);
    expect(hass.calls[0]).toEqual({
      type: "supervisor/api",
      endpoint: "/addons/local_nvr_playback/info",
      method: "get",
    });
    loc.forget("local_nvr_playback");
    await loc.base(hass, "local_nvr_playback");
    expect(hass.callWS).toHaveBeenCalledTimes(2);
  });

  it("says when the add-on is missing or stopped, and asks again next time", async () => {
    let state = "stopped";
    const hass = fakeHass({
      "/addons/local_nvr_playback/info": () => ({ ingress_url: "/api/hassio_ingress/tok/", state }),
    });
    const loc = new AddonLocator();
    await expect(loc.base(hass, "local_nvr_playback")).rejects.toThrow("isn't running");
    state = "started";
    await expect(loc.base(hass, "local_nvr_playback")).resolves.toBe("/api/hassio_ingress/tok/");
    await expect(loc.base(fakeHass({}), "local_other")).rejects.toThrow("isn't installed");
  });

  it("refuses a slug that isn't one, without asking Home Assistant", async () => {
    const hass = fakeHass({});
    await expect(new AddonLocator().base(hass, "../../core/info")).rejects.toBeInstanceOf(NvrError);
    expect(hass.callWS).not.toHaveBeenCalled();
  });
});

describe("how to play", () => {
  it("Apple's WebKit plays HLS itself; the rest use hls.js", () => {
    const env = (ua: string, nativeHls: string, mse = true) =>
      playbackMode({ userAgent: ua, nativeHls, mse });
    expect(env(UA.chromeWin, "")).toBe("hlsjs");
    expect(env(UA.chromeWin, "maybe")).toBe("hlsjs");
    expect(env(UA.edge, "")).toBe("hlsjs");
    expect(env(UA.firefox, "")).toBe("hlsjs");
    expect(env(UA.pixel, "maybe")).toBe("hlsjs");
    expect(env(UA.haAndroid, "maybe")).toBe("hlsjs");
    expect(env(UA.iphone, "maybe")).toBe("native");
    expect(env(UA.haIphone, "maybe")).toBe("native");
    expect(env(UA.chromeIphone, "maybe")).toBe("native");
    expect(env(UA.macSafari, "maybe")).toBe("native");
    expect(env(UA.iphone, "maybe", false)).toBe("native");
    expect(env(UA.firefox, "", false)).toBe("none");
  });

  it("checks the recording's codecs with the right API", () => {
    const mse = (t: string) => !t.includes("hvc1");
    const native = (t: string) => (t.includes("hvc1") ? "maybe" : "probably");
    expect(codecSupported("avc1.640033,mp4a.40.2", "hlsjs", { mse })).toBe(true);
    expect(codecSupported("hvc1.1.6.L150,mp4a.40.2", "hlsjs", { mse })).toBe(false);
    expect(codecSupported("hvc1.1.6.L150,mp4a.40.2", "native", { native })).toBe(true);
    expect(codecSupported("hvc1.1.6.L150", "native", { native: () => "" })).toBe(false);
    expect(codecSupported("", "hlsjs", { mse })).toBe(true);
    expect(codecSupported("avc1.640033", "none", {})).toBe(false);
  });
});

describe("helpers", () => {
  const st = (over: Partial<NvrStatus> = {}): NvrStatus => ({
    name: "1-7-0-01260919150001-00000",
    channel: 7,
    stream: "sub",
    state: "downloading",
    error: "",
    file_start_ms: 1_000_000,
    file_end_ms: 2_800_000,
    duration_s: 1800,
    available_s: 300,
    bytes: 1,
    rate_bps: 1,
    codecs: "",
    width: 0,
    height: 0,
    target_s: 753,
    progress: 0.42,
    eta_s: 6.2,
    ...over,
  });

  it("the clock and the next recording", () => {
    expect(clockAt(st(), 753.4)).toBe(1_753_400);
    expect(nextFileTime(st())).toBe(2_801_000);
  });

  it("progress text", () => {
    expect(progressDetail(st())).toBe("42% · skipping 13 min of the recording · ~7 s");
    expect(progressDetail(st({ target_s: 10, eta_s: 0 }))).toBe("42%");
    expect(progressDetail(st({ state: "queued" }))).toBe("Waiting for another download to finish");
    expect(progressDetail(null)).toBe("");
  });

  it("formats the wait", () => {
    expect(formatEta(undefined)).toBe("");
    expect(formatEta(0.2)).toBe("");
    expect(formatEta(5.1)).toBe("~6 s");
    expect(formatEta(120)).toBe("~2 min");
    expect(formatEta(95)).toBe("~1 min 35 s");
  });

  it("channels, client ids and messages", () => {
    expect(nvrChannelOf(7)).toBe(7);
    expect(nvrChannelOf(0)).toBe(0);
    expect(nvrChannelOf("7")).toBeNull();
    expect(nvrChannelOf(7.5)).toBeNull();
    expect(nvrChannelOf(64)).toBeNull();
    expect(nvrChannelOf(undefined)).toBeNull();
    expect(newClientId(() => 0)).toBe("aaaaaaaaaaaaaaaa");
    expect(newClientId()).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(messageOf(new NvrError("nvr", "NVR: down"))).toBe("NVR: down");
    expect(messageOf("x")).toMatch(/NVR Playback add-on/);
  });
});
