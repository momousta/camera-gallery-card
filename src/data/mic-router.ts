/**
 * The card's talk button drives one of two transports: a go2rtc WebRTC back channel (a stream name, the doorbell)
 * or the NVR (`nvr:<channel>`, Reolink cameras through the NVR Playback add-on). Same surface as both, so the card
 * holds one `_micClient`; the transport last asked for answers for state, errors and the level bars.
 */
import { NVR_MIC_PREFIX } from "./nvr-talk";
import type { MicAudioProcessing, MicError, MicState, MicStats } from "./webrtc-mic";

export interface MicTransport {
  state(): MicState;
  isActive(): boolean;
  level(): number;
  getFrequencyData(target: Uint8Array): boolean;
  error(): MicError | null;
  stats(): MicStats | null;
  audioProcessing(): MicAudioProcessing;
  setAudioProcessing(ap: Partial<MicAudioProcessing>): void;
  setHass(hass: unknown): void;
  toggle(target: string): Promise<void>;
  start(target: string): Promise<void>;
  stop(): void;
  dispose(): void;
}

type IceConfig = {
  iceServers?: ReadonlyArray<RTCIceServer> | null;
  iceTransportPolicy?: RTCIceTransportPolicy | null;
};

export class MicRouter implements MicTransport {
  private _last: MicTransport;

  constructor(
    private readonly _webrtc: MicTransport & { setIceConfig(opts: IceConfig): void },
    private readonly _nvr: MicTransport
  ) {
    this._last = _webrtc;
  }

  private _use(target: string): MicTransport {
    const t = String(target ?? "").startsWith(NVR_MIC_PREFIX) ? this._nvr : this._webrtc;
    if (t !== this._last) {
      this._last.stop();
      this._last = t;
    }
    return t;
  }

  state(): MicState {
    return this._last.state();
  }

  isActive(): boolean {
    return this._last.isActive();
  }

  level(): number {
    return this._last.level();
  }

  getFrequencyData(target: Uint8Array): boolean {
    return this._last.getFrequencyData(target);
  }

  error(): MicError | null {
    return this._last.error();
  }

  stats(): MicStats | null {
    return this._last.stats();
  }

  audioProcessing(): MicAudioProcessing {
    return this._webrtc.audioProcessing();
  }

  setAudioProcessing(ap: Partial<MicAudioProcessing>): void {
    this._webrtc.setAudioProcessing(ap);
    this._nvr.setAudioProcessing(ap);
  }

  setIceConfig(opts: IceConfig): void {
    this._webrtc.setIceConfig(opts);
  }

  setHass(hass: unknown): void {
    this._webrtc.setHass(hass);
    this._nvr.setHass(hass);
  }

  toggle(target: string): Promise<void> {
    return this._use(target).toggle(target);
  }

  start(target: string): Promise<void> {
    return this._use(target).start(target);
  }

  stop(): void {
    this._webrtc.stop();
    this._nvr.stop();
  }

  dispose(): void {
    this._webrtc.dispose();
    this._nvr.dispose();
  }
}
