/**
 * Two-way audio through the NVR (owner fork): the talk target `nvr:<channel>`, e.g. `live_mic_streams:
 * { camera.backyard_left_main: "nvr:4" }`.
 *
 * The microphone goes as 16 kHz mono 16-bit PCM over a WebSocket to the NVR Playback add-on (`api/talk?channel=N`,
 * through Home Assistant ingress), which plays it on the camera's speaker the way the Reolink app does: no go2rtc
 * stream and no camera login in the dashboard. Same surface as `WebRtcMicClient`, so the card's talk button drives
 * either (see `mic-router.ts`).
 */
import { classifyMicError } from "./webrtc-mic";
import type { MicAudioProcessing, MicError, MicState, MicStats } from "./webrtc-mic";

export const NVR_MIC_PREFIX = "nvr:";
export const TALK_RATE = 16000;
/** ScriptProcessor buffer: 64 ms at 16 kHz, one ADPCM block at the add-on. */
const FRAME_SAMPLES = 1024;
export const NVR_TALK_READY_MS = 12_000;
export const NVR_TALK_ERROR_MS = 6_000;

/** The NVR channel of a talk target (`nvr:4` → 4), or null when it isn't one. */
export function nvrMicChannel(target: string): number | null {
  const m = /^nvr:(\d{1,2})$/.exec(String(target ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n <= 63 ? n : null;
}

/** Float samples at `inRate` to 16-bit PCM at 16 kHz (linear; the context normally runs at 16 kHz already). */
export function toPcm16(input: Float32Array, inRate: number): Int16Array {
  const ratio = inRate / TALK_RATE;
  const n = ratio === 1 ? input.length : Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const a = input[j] ?? 0;
    const b = input[j + 1] ?? a;
    const v = a + (b - a) * (pos - j);
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return out;
}

function defaultAudioContext(): AudioContext {
  try {
    return new AudioContext({ sampleRate: TALK_RATE });
  } catch {
    return new AudioContext();
  }
}

const DEFAULT_AP: MicAudioProcessing = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export interface NvrTalkClientOptions {
  /** The add-on's ingress URL ("/api/hassio_ingress/<token>/") with this page's ingress session in place. */
  resolveBase: () => Promise<string>;
  onChange: () => void;
  audioProcessing?: Partial<MicAudioProcessing>;
  // Injection seams (specs).
  mediaDevices?: MediaDevices;
  audioContextFactory?: () => AudioContext;
  webSocketFactory?: (url: string) => WebSocket;
  pageUrl?: () => string;
}

export class NvrTalkClient {
  private readonly _resolveBase: () => Promise<string>;
  private readonly _onChange: () => void;
  private readonly _mediaDevices: MediaDevices | undefined;
  private readonly _audioContextFactory: () => AudioContext;
  private readonly _webSocketFactory: (url: string) => WebSocket;
  private readonly _pageUrl: () => string;

  private _state: MicState = "idle";
  private _error: MicError | null = null;
  private _ap: MicAudioProcessing = { ...DEFAULT_AP };
  /** Bumped by every start and stop: callbacks of an older run do nothing. */
  private _run = 0;
  private _stream: MediaStream | null = null;
  private _ws: WebSocket | null = null;
  private _ctx: AudioContext | null = null;
  private _source: MediaStreamAudioSourceNode | null = null;
  private _proc: ScriptProcessorNode | null = null;
  private _analyser: AnalyserNode | null = null;
  private _readyTimer: ReturnType<typeof setTimeout> | null = null;
  private _errorTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: NvrTalkClientOptions) {
    this._resolveBase = opts.resolveBase;
    this._onChange = opts.onChange;
    this._mediaDevices =
      opts.mediaDevices ?? (typeof navigator !== "undefined" ? navigator.mediaDevices : undefined);
    this._audioContextFactory = opts.audioContextFactory ?? defaultAudioContext;
    this._webSocketFactory = opts.webSocketFactory ?? ((url): WebSocket => new WebSocket(url));
    this._pageUrl = opts.pageUrl ?? ((): string => window.location.href);
    if (opts.audioProcessing) this._ap = { ...DEFAULT_AP, ...opts.audioProcessing };
  }

  setHass(_hass: unknown): void {
    /* resolveBase already holds hass */
  }

  state(): MicState {
    return this._state;
  }

  isActive(): boolean {
    return this._state === "active";
  }

  level(): number {
    return 0;
  }

  getFrequencyData(target: Uint8Array): boolean {
    const a = this._analyser;
    if (!a) return false;
    a.getByteFrequencyData(new Uint8Array(target.buffer as ArrayBuffer));
    return true;
  }

  error(): MicError | null {
    return this._error;
  }

  stats(): MicStats | null {
    return null;
  }

  audioProcessing(): MicAudioProcessing {
    return { ...this._ap };
  }

  setAudioProcessing(ap: Partial<MicAudioProcessing>): void {
    this._ap = { ...this._ap, ...ap };
  }

  async toggle(target: string): Promise<void> {
    if (this._state === "active") {
      this.stop();
      return;
    }
    if (this._state === "connecting") return;
    await this.start(target);
  }

  async start(target: string): Promise<void> {
    if (this._state !== "idle") return;
    const channel = nvrMicChannel(target);
    if (channel === null) {
      this._fail({ code: "stream-not-found" });
      return;
    }
    if (!this._mediaDevices || typeof this._mediaDevices.getUserMedia !== "function") {
      this._fail({ code: "https-required" });
      return;
    }
    const run = ++this._run;
    this._clearError();
    this._set("connecting");
    try {
      // Made inside the tap, so a phone lets it run (it plays nothing: it carries the microphone to the socket).
      this._ctx = this._audioContextFactory();
      const stream = await this._mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this._ap.echoCancellation,
          noiseSuppression: this._ap.noiseSuppression,
          autoGainControl: this._ap.autoGainControl,
          channelCount: 1,
        },
      });
      if (run !== this._run) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this._stream = stream;
      const base = await this._resolveBase();
      if (run !== this._run) return;
      const url = new URL(`${base}api/talk?channel=${channel}`, this._pageUrl());
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ws = this._webSocketFactory(url.toString());
      ws.binaryType = "arraybuffer";
      this._ws = ws;
      ws.onmessage = (ev: MessageEvent): void => {
        if (run !== this._run || typeof ev.data !== "string") return;
        let msg: { state?: string; message?: string };
        try {
          msg = JSON.parse(ev.data) as { state?: string; message?: string };
        } catch {
          return;
        }
        if (msg.state === "talking" && this._state === "connecting") this._startAudio(run);
        else if (msg.state === "error")
          this._fail({ code: "unknown", detail: msg.message || "the camera can't talk now" });
      };
      ws.onclose = (): void => {
        if (run !== this._run) return;
        if (this._state === "connecting")
          this._fail({ code: "unknown", detail: "couldn't reach the NVR Playback add-on" });
        else this.stop();
      };
      this._readyTimer = setTimeout(() => {
        if (run === this._run && this._state === "connecting")
          this._fail({ code: "unknown", detail: "the camera didn't answer in time" });
      }, NVR_TALK_READY_MS);
    } catch (err) {
      if (run === this._run) this._fail(classifyMicError(err));
    }
  }

  private _startAudio(run: number): void {
    this._clearReadyTimer();
    const ctx = this._ctx;
    const stream = this._stream;
    if (!ctx || !stream) return;
    try {
      void ctx.resume().catch(() => undefined);
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const proc = ctx.createScriptProcessor(FRAME_SAMPLES, 1, 1);
      proc.onaudioprocess = (e: AudioProcessingEvent): void => {
        e.outputBuffer.getChannelData(0).fill(0);
        const ws = this._ws;
        if (run !== this._run || !ws || ws.readyState !== 1) return;
        ws.send(toPcm16(e.inputBuffer.getChannelData(0), ctx.sampleRate).buffer as ArrayBuffer);
      };
      // A processor only runs while it reaches the output; it writes silence there.
      source.connect(proc);
      proc.connect(ctx.destination);
      this._source = source;
      this._proc = proc;
      this._analyser = analyser;
      this._set("active");
    } catch (err) {
      this._fail(classifyMicError(err));
    }
  }

  stop(): void {
    this._run++;
    this._clearReadyTimer();
    const ws = this._ws;
    this._ws = null;
    if (ws) {
      ws.onmessage = null;
      ws.onclose = null;
      try {
        if (ws.readyState === 1) ws.send("stop");
        ws.close();
      } catch {
        /* already closing */
      }
    }
    if (this._proc) this._proc.onaudioprocess = null;
    try {
      this._proc?.disconnect();
      this._source?.disconnect();
    } catch {
      /* already disconnected */
    }
    this._proc = null;
    this._source = null;
    this._analyser = null;
    const ctx = this._ctx;
    this._ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);
    this._stream?.getTracks().forEach((t) => t.stop());
    this._stream = null;
    this._set("idle");
  }

  dispose(): void {
    this.stop();
    this._clearError();
  }

  private _fail(err: MicError): void {
    this.stop();
    this._clearError();
    this._error = err;
    this._errorTimer = setTimeout(() => {
      this._errorTimer = null;
      this._error = null;
      this._onChange();
    }, NVR_TALK_ERROR_MS);
    this._onChange();
  }

  private _clearError(): void {
    if (this._errorTimer) clearTimeout(this._errorTimer);
    this._errorTimer = null;
    this._error = null;
  }

  private _clearReadyTimer(): void {
    if (this._readyTimer) clearTimeout(this._readyTimer);
    this._readyTimer = null;
  }

  private _set(state: MicState): void {
    if (this._state === state) return;
    this._state = state;
    this._onChange();
  }
}
