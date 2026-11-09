import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NVR_TALK_ERROR_MS,
  NVR_TALK_READY_MS,
  NvrTalkClient,
  nvrMicChannel,
  toPcm16,
} from "./nvr-talk";

// ─── Fakes ────────────────────────────────────────────────────────────

class FakeWs {
  readyState = 1;
  binaryType = "blob";
  sent: unknown[] = [];
  closed = false;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {}
  send(data: unknown): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
  reply(msg: object): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

function makeCtx(sampleRate = 16000) {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const ctx = {
    sampleRate,
    state: "running",
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => {
      ctx.state = "closed";
    }),
    source: null as ReturnType<typeof node> | null,
    proc: null as
      | (ReturnType<typeof node> & { onaudioprocess: ((e: unknown) => void) | null })
      | null,
    createMediaStreamSource: vi.fn(() => (ctx.source = node())),
    createAnalyser: vi.fn(() => ({
      ...node(),
      fftSize: 2048,
      getByteFrequencyData: (a: Uint8Array) => a.fill(7),
    })),
    createScriptProcessor: vi.fn(() => (ctx.proc = { ...node(), onaudioprocess: null })),
  };
  return ctx;
}

function makeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

function setup(
  opts: { getUserMedia?: () => Promise<MediaStream>; base?: () => Promise<string> } = {}
) {
  const { track, stream } = makeStream();
  const ctx = makeCtx();
  const sockets: FakeWs[] = [];
  const onChange = vi.fn();
  const getUserMedia = vi.fn(opts.getUserMedia ?? (async () => stream));
  const client = new NvrTalkClient({
    resolveBase: opts.base ?? (async () => "/api/hassio_ingress/tok/"),
    onChange,
    mediaDevices: { getUserMedia } as unknown as MediaDevices,
    audioContextFactory: () => ctx as unknown as AudioContext,
    webSocketFactory: (url) => {
      const ws = new FakeWs(url);
      sockets.push(ws);
      return ws as unknown as WebSocket;
    },
    pageUrl: () => "https://ha.example/dashboard-main/backyard-left",
  });
  return { client, ctx, track, sockets, onChange, getUserMedia };
}

function audioEvent(samples: Float32Array) {
  const out = new Float32Array(samples.length).fill(0.5);
  return {
    inputBuffer: { getChannelData: () => samples },
    outputBuffer: { getChannelData: () => out },
    out,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

// ─── Pure helpers ─────────────────────────────────────────────────────

describe("nvrMicChannel", () => {
  it("reads nvr:<channel> targets only", () => {
    expect(nvrMicChannel("nvr:4")).toBe(4);
    expect(nvrMicChannel("nvr:0")).toBe(0);
    expect(nvrMicChannel(" nvr:63 ")).toBe(63);
    expect(nvrMicChannel("nvr:64")).toBeNull();
    expect(nvrMicChannel("nvr:")).toBeNull();
    expect(nvrMicChannel("nvr:x")).toBeNull();
    expect(nvrMicChannel("ring_doorbell")).toBeNull();
  });
});

describe("toPcm16", () => {
  it("scales and clips 16 kHz floats", () => {
    expect(Array.from(toPcm16(new Float32Array([0, 0.5, -1, 1, 2, -2]), 16000))).toEqual([
      0, 16384, -32767, 32767, 32767, -32768,
    ]);
  });

  it("resamples another rate to 16 kHz", () => {
    const out = toPcm16(new Float32Array([0.25, 0, 0, 0.5, 0, 0]), 48000);
    expect(Array.from(out)).toEqual([Math.round(0.25 * 32767), Math.round(0.5 * 32767)]);
  });
});

// ─── The client ──────────────────────────────────────────────────────

describe("NvrTalkClient", () => {
  it("talks once the add-on is ready, sending the microphone as 16-bit PCM", async () => {
    const { client, ctx, sockets, getUserMedia } = setup();
    await client.start("nvr:4");
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    expect(client.state()).toBe("connecting");
    const ws = sockets[0]!;
    expect(ws.url).toBe("wss://ha.example/api/hassio_ingress/tok/api/talk?channel=4");
    expect(ws.binaryType).toBe("arraybuffer");
    expect(ctx.createScriptProcessor).not.toHaveBeenCalled();

    ws.reply({ state: "talking", rate: 16000 });
    expect(client.state()).toBe("active");
    expect(client.isActive()).toBe(true);
    expect(ctx.createScriptProcessor).toHaveBeenCalledWith(1024, 1, 1);

    const ev = audioEvent(new Float32Array(1024).fill(0.25));
    ctx.proc!.onaudioprocess!(ev);
    const sent = ws.sent[0] as ArrayBuffer;
    expect(sent.byteLength).toBe(2048);
    expect(new Int16Array(sent)[0]).toBe(Math.round(0.25 * 32767));
    expect(ev.out.every((v) => v === 0)).toBe(true);

    const bins = new Uint8Array(256);
    expect(client.getFrequencyData(bins)).toBe(true);
    expect(bins[0]).toBe(7);
  });

  it("stop() ends the talk and releases the microphone", async () => {
    const { client, ctx, track, sockets } = setup();
    await client.start("nvr:4");
    const ws = sockets[0]!;
    ws.reply({ state: "talking" });
    client.stop();
    expect(ws.sent).toEqual(["stop"]);
    expect(ws.closed).toBe(true);
    expect(track.stop).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
    expect(client.state()).toBe("idle");
    expect(client.error()).toBeNull();
    expect(client.getFrequencyData(new Uint8Array(4))).toBe(false);
  });

  it("toggle() starts, then stops", async () => {
    const { client, sockets } = setup();
    await client.toggle("nvr:0");
    sockets[0]!.reply({ state: "talking" });
    await client.toggle("nvr:0");
    expect(client.state()).toBe("idle");
    expect(sockets).toHaveLength(1);
  });

  it("shows the add-on's error, then clears it", async () => {
    vi.useFakeTimers();
    const { client, sockets, track } = setup();
    await client.start("nvr:4");
    sockets[0]!.reply({ state: "error", message: "someone else is talking through this camera" });
    expect(client.state()).toBe("idle");
    expect(client.error()).toEqual({
      code: "unknown",
      detail: "someone else is talking through this camera",
    });
    expect(track.stop).toHaveBeenCalled();
    vi.advanceTimersByTime(NVR_TALK_ERROR_MS);
    expect(client.error()).toBeNull();
  });

  it("reports an add-on it can't reach", async () => {
    const { client, sockets } = setup();
    await client.start("nvr:4");
    sockets[0]!.onclose!();
    expect(client.state()).toBe("idle");
    expect(client.error()?.detail).toBe("couldn't reach the NVR Playback add-on");
  });

  it("gives up when the camera doesn't answer in time", async () => {
    vi.useFakeTimers();
    const { client, sockets } = setup();
    await client.start("nvr:4");
    vi.advanceTimersByTime(NVR_TALK_READY_MS);
    expect(client.state()).toBe("idle");
    expect(client.error()?.detail).toBe("the camera didn't answer in time");
    expect(sockets[0]!.closed).toBe(true);
  });

  it("ends quietly when the add-on closes a talk", async () => {
    const { client, sockets } = setup();
    await client.start("nvr:4");
    sockets[0]!.reply({ state: "talking" });
    sockets[0]!.onclose!();
    expect(client.state()).toBe("idle");
    expect(client.error()).toBeNull();
  });

  it("maps a refused microphone", async () => {
    const { client, sockets } = setup({
      getUserMedia: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
    });
    await client.start("nvr:4");
    expect(client.error()?.code).toBe("permission-denied");
    expect(sockets).toHaveLength(0);
  });

  it("reports an add-on it can't find", async () => {
    const { client, track } = setup({
      base: () => Promise.reject(new Error("NVR Playback isn't running")),
    });
    await client.start("nvr:4");
    expect(client.error()).toEqual({ code: "unknown", detail: "NVR Playback isn't running" });
    expect(track.stop).toHaveBeenCalled();
  });

  it("a stop while the microphone is asked for wins", async () => {
    const { track, stream } = makeStream();
    let give: (s: MediaStream) => void = () => undefined;
    const { client, sockets } = setup({ getUserMedia: () => new Promise((r) => (give = r)) });
    const started = client.start("nvr:4");
    client.stop();
    give(stream);
    await started;
    expect(track.stop).toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
    expect(client.state()).toBe("idle");
  });

  it("refuses a target that isn't an NVR channel", async () => {
    const { client, getUserMedia } = setup();
    await client.start("nvr:x");
    expect(client.error()?.code).toBe("stream-not-found");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("passes the configured audio processing to the microphone", async () => {
    const { client, getUserMedia } = setup();
    client.setAudioProcessing({ echoCancellation: false });
    await client.start("nvr:4");
    expect(getUserMedia.mock.calls[0]).toEqual([
      {
        audio: {
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      },
    ]);
  });
});
