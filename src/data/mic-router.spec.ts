import { describe, expect, it, vi } from "vitest";

import { MicRouter, type MicTransport } from "./mic-router";
import type { MicState } from "./webrtc-mic";

function fakeTransport(name: string) {
  let state: MicState = "idle";
  const t = {
    name,
    state: () => state,
    isActive: () => state === "active",
    level: () => (name === "webrtc" ? 0.3 : 0),
    getFrequencyData: vi.fn(() => name === "nvr"),
    error: () => ({ code: "unknown" as const, detail: name }),
    stats: () => null,
    audioProcessing: () => ({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }),
    setAudioProcessing: vi.fn(),
    setIceConfig: vi.fn(),
    setHass: vi.fn(),
    toggle: vi.fn(async () => {
      state = state === "active" ? "idle" : "active";
    }),
    start: vi.fn(async () => {
      state = "active";
    }),
    stop: vi.fn(() => {
      state = "idle";
    }),
    dispose: vi.fn(),
  };
  return t satisfies MicTransport & { setIceConfig: unknown };
}

function setup() {
  const webrtc = fakeTransport("webrtc");
  const nvr = fakeTransport("nvr");
  return { webrtc, nvr, router: new MicRouter(webrtc, nvr) };
}

describe("MicRouter", () => {
  it("sends nvr:<channel> targets to the NVR and the rest to go2rtc", async () => {
    const { webrtc, nvr, router } = setup();
    await router.start("nvr:4");
    expect(nvr.start).toHaveBeenCalledWith("nvr:4");
    expect(webrtc.start).not.toHaveBeenCalled();
    router.stop();
    await router.toggle("ring_doorbell");
    expect(webrtc.toggle).toHaveBeenCalledWith("ring_doorbell");
    expect(nvr.toggle).not.toHaveBeenCalled();
  });

  it("answers for the transport last used", async () => {
    const { router } = setup();
    expect(router.error()?.detail).toBe("webrtc");
    await router.start("nvr:4");
    expect(router.state()).toBe("active");
    expect(router.isActive()).toBe(true);
    expect(router.error()?.detail).toBe("nvr");
    expect(router.getFrequencyData(new Uint8Array(4))).toBe(true);
    expect(router.level()).toBe(0);
  });

  it("stops the other transport on a switch", async () => {
    const { webrtc, nvr, router } = setup();
    await router.start("ring_doorbell");
    await router.start("nvr:0");
    expect(webrtc.stop).toHaveBeenCalled();
    expect(webrtc.state()).toBe("idle");
    expect(nvr.state()).toBe("active");
  });

  it("gives settings to the transports that use them", () => {
    const { webrtc, nvr, router } = setup();
    router.setIceConfig({ iceTransportPolicy: "relay" });
    expect(webrtc.setIceConfig).toHaveBeenCalledWith({ iceTransportPolicy: "relay" });
    expect(nvr.setIceConfig).not.toHaveBeenCalled();
    router.setAudioProcessing({ noiseSuppression: false });
    expect(webrtc.setAudioProcessing).toHaveBeenCalledWith({ noiseSuppression: false });
    expect(nvr.setAudioProcessing).toHaveBeenCalledWith({ noiseSuppression: false });
    router.setHass({});
    expect(nvr.setHass).toHaveBeenCalled();
    router.dispose();
    expect(webrtc.dispose).toHaveBeenCalled();
    expect(nvr.dispose).toHaveBeenCalled();
  });
});
