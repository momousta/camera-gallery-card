/**
 * BL-008: play the NVR's recordings from an exact moment, through the NVR Playback add-on.
 *
 * The add-on (/addons/nvr_playback) fetches the Reolink recording that holds the moment and serves it as HLS,
 * behind Home Assistant ingress. This module holds the parts both cards share and that don't need a DOM:
 * - the ingress session (cookie) and the add-on's ingress URL;
 * - choosing native HLS or hls.js, and codec support;
 * - text for progress and errors.
 */

export const DEFAULT_NVR_ADDON = "local_nvr_playback";
export const NVR_STREAMS = ["sub", "main"] as const;
export type NvrStream = (typeof NVR_STREAMS)[number];
export const NVR_STREAM_LABEL: Record<NvrStream, string> = { sub: "Low", main: "High" };
/** The add-on's hls.js copy (vendored, Apache-2.0). */
export const HLS_JS_PATH = "static/hls.light.min.js";
/** Re-validate the ingress session this often (the Supervisor keeps a session 15 minutes from its last use). */
export const SESSION_REFRESH_MS = 60_000;

export type NvrState = "queued" | "downloading" | "complete" | "error" | "cancelled";

export interface NvrStatus {
  name: string;
  channel: number;
  stream: NvrStream;
  state: NvrState;
  error: string;
  file_start_ms: number;
  file_end_ms: number;
  duration_s: number;
  available_s: number;
  bytes: number;
  rate_bps: number;
  codecs: string;
  width: number;
  height: number;
  target_s?: number;
  ready?: boolean;
  progress?: number;
  eta_s?: number;
  requested_ms?: number;
  playlist?: string;
}

export type NvrErrorCode =
  | "addon"
  | "session"
  | "no_recording"
  | "nvr"
  | "codec"
  | "browser"
  | "gone"
  | "playback"
  | "network";

export class NvrError extends Error {
  readonly code: NvrErrorCode;
  constructor(code: NvrErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "NvrError";
  }
}

export interface HassWs {
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
}

export const isNvrStream = (v: unknown): v is NvrStream => v === "sub" || v === "main";

/** A config `nvr_channel` as a channel number, or null when it isn't one. */
export function nvrChannelOf(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 63 ? v : null;
}

export function ingressCookie(session: string, secure: boolean): string {
  return `ingress_session=${session};path=/api/hassio_ingress/;SameSite=Strict${secure ? ";Secure" : ""}`;
}

/** One ingress session per page, shared by every player (as the HA frontend does for its add-on panels). */
export class IngressSession {
  private id: string | null = null;
  private at = 0;
  private pending: Promise<void> | null = null;

  constructor(
    private readonly setCookie: (cookie: string) => void = (c) => {
      document.cookie = c;
    },
    private readonly secure: () => boolean = () => location.protocol === "https:"
  ) {}

  ensure(hass: HassWs, now: number = Date.now()): Promise<void> {
    if (this.id && now - this.at < SESSION_REFRESH_MS) return Promise.resolve();
    if (!this.pending) {
      this.pending = this.refresh(hass, now).finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  /** Forget the session (the add-on answered 401): the next ensure() opens a new one. */
  invalidate(): void {
    this.id = null;
  }

  private async refresh(hass: HassWs, now: number): Promise<void> {
    if (this.id) {
      try {
        await hass.callWS({
          type: "supervisor/api",
          endpoint: "/ingress/validate_session",
          method: "post",
          data: { session: this.id },
        });
        this.at = now;
        this.setCookie(ingressCookie(this.id, this.secure()));
        return;
      } catch {
        this.id = null;
      }
    }
    let reply: { session?: string } | null;
    try {
      reply = await hass.callWS<{ session?: string }>({
        type: "supervisor/api",
        endpoint: "/ingress/session",
        method: "post",
      });
    } catch {
      reply = null;
    }
    if (!reply?.session)
      throw new NvrError(
        "session",
        "Home Assistant didn't open a session to the NVR Playback add-on."
      );
    this.id = reply.session;
    this.at = now;
    this.setCookie(ingressCookie(reply.session, this.secure()));
  }
}

const SLUG_RE = /^[a-z0-9_]{1,64}$/;

/** The add-on's ingress URL ("/api/hassio_ingress/<token>/"), cached per slug while it works. */
export class AddonLocator {
  private readonly cache = new Map<string, Promise<string>>();

  base(hass: HassWs, slug: string): Promise<string> {
    if (!SLUG_RE.test(slug))
      return Promise.reject(new NvrError("addon", `Not an add-on slug: ${slug}`));
    let p = this.cache.get(slug);
    if (!p) {
      p = this.lookup(hass, slug);
      this.cache.set(slug, p);
      p.catch(() => this.cache.delete(slug));
    }
    return p;
  }

  forget(slug: string): void {
    this.cache.delete(slug);
  }

  private async lookup(hass: HassWs, slug: string): Promise<string> {
    let info: { ingress_url?: string; state?: string } | null;
    try {
      info = await hass.callWS<{ ingress_url?: string; state?: string }>({
        type: "supervisor/api",
        endpoint: `/addons/${slug}/info`,
        method: "get",
      });
    } catch {
      info = null;
    }
    if (!info?.ingress_url) throw new NvrError("addon", "The NVR Playback add-on isn't installed.");
    if (info.state && info.state !== "started")
      throw new NvrError("addon", "The NVR Playback add-on isn't running.");
    return info.ingress_url.endsWith("/") ? info.ingress_url : `${info.ingress_url}/`;
  }
}

export function newClientId(random: () => number = Math.random): string {
  const abc = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 16; i++) out += abc[Math.floor(random() * abc.length)];
  return out;
}

export type PlaybackMode = "native" | "hlsjs" | "none";

export interface PlaybackEnv {
  /** video.canPlayType("application/vnd.apple.mpegurl") */
  nativeHls: string;
  /** window.MediaSource or window.ManagedMediaSource exists */
  mse: boolean;
  userAgent: string;
}

/**
 * Apple's WebKit (every iOS/iPadOS browser and the HA app's web view there, and Safari on macOS) plays HLS
 * itself; everything else (Chrome, Edge, Firefox, Android and its HA app) uses hls.js.
 */
export function playbackMode(env: PlaybackEnv): PlaybackMode {
  const ua = env.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua);
  const webkitOnly =
    /applewebkit/i.test(ua) && !/chrome|chromium|android|edg|firefox|opr\//i.test(ua);
  if (env.nativeHls && (ios || webkitOnly || !env.mse)) return "native";
  if (env.mse) return "hlsjs";
  return env.nativeHls ? "native" : "none";
}

/** Whether the browser can decode the recording's codecs (`avc1...,mp4a...`, `hvc1...` for High). */
export function codecSupported(
  codecs: string,
  mode: PlaybackMode,
  checks: { mse?: (type: string) => boolean; native?: (type: string) => string }
): boolean {
  if (!codecs) return true;
  const type = `video/mp4; codecs="${codecs}"`;
  if (mode === "hlsjs") return checks.mse ? checks.mse(type) : true;
  if (mode === "native") return checks.native ? checks.native(type) !== "" : true;
  return false;
}

export function formatEta(s: number | undefined): string {
  if (s === undefined || !Number.isFinite(s) || s <= 0.5) return "";
  if (s < 60) return `~${Math.ceil(s)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `~${m} min ${r} s` : `~${m} min`;
}

/** The wall-clock moment shown at `currentTime` seconds into the recording. */
export function clockAt(status: Pick<NvrStatus, "file_start_ms">, currentTime: number): number {
  return status.file_start_ms + Math.round(currentTime * 1000);
}

/** Where to continue when a recording ends: just after it, which the add-on resolves to the next one. */
export function nextFileTime(status: Pick<NvrStatus, "file_end_ms">): number {
  return status.file_end_ms + 1000;
}

/** The download progress line under the bar. */
export function progressDetail(status: NvrStatus | null): string {
  if (!status) return "";
  if (status.state === "queued") return "Waiting for another download to finish";
  const pct = Math.round((status.progress ?? 0) * 100);
  const eta = formatEta(status.eta_s);
  const skip = Math.max(0, Math.round((status.target_s ?? 0) / 60));
  const parts = [`${pct}%`];
  if (skip >= 1) parts.push(`skipping ${skip} min of the recording`);
  if (eta) parts.push(eta);
  return parts.join(" · ");
}

export function messageOf(err: unknown): string {
  if (err instanceof NvrError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong talking to the NVR Playback add-on.";
}
