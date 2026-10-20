/**
 * <cgc-nvr-player> (BL-008): plays the NVR's recording from one moment, inside the gallery viewer or the
 * timeline's full view.
 *
 * Properties (set by the card):
 *   hass, channel (NVR channel), time (epoch ms to start at), stream ("sub" = Low, "main" = High),
 *   addon (add-on slug, default local_nvr_playback), poster (picture shown while the recording is fetched),
 *   bare (true where the host shows its own Low / High and close buttons: then the bar is the clock and full
 *   screen), quiet (load unseen: no progress, no error; the player shows itself once the video plays)
 * Events (bubbling, composed):
 *   nvr-close: the viewer asked to go back to the snapshots; { quiet: true } when a quiet start failed
 *   nvr-stream: { stream } the viewer switched between Low and High
 *   nvr-reveal: a quiet player started playing and showed itself
 *
 * The add-on asks the NVR for the moment (or, as a fallback, downloads the recording up to it, with progress
 * over the poster). This element plays the add-on's HLS stream from the moment with native HLS (Safari, iOS)
 * or hls.js (loaded from the add-on), and goes on to the next recording at the end. Full screen is landscape:
 * the screen is turned where the browser can (Chrome), else the picture is turned while the screen is portrait
 * (an app's WebView can't turn the screen); iPhones use their own player, which turns with the phone.
 */

import { LitElement, html } from "lit";

import { portraitScreen, turnFromMotion, unturn } from "../util/landscape";
import { formatClockFromMs } from "../util/locale";
import {
  AddonLocator,
  DEFAULT_NVR_ADDON,
  HLS_JS_PATH,
  IngressSession,
  NVR_STREAM_LABEL,
  NVR_STREAMS,
  NvrError,
  clockAt,
  codecSupported,
  isNvrStream,
  messageOf,
  newClientId,
  nextFileTime,
  playbackMode,
  progressDetail,
} from "./nvr-api";
import { nvrPlayerStyles } from "./nvr-player-styles";

const TAG = "cgc-nvr-player";
const POLL_MS = 400;
const POLL_REPLAY_MS = 150; // the NVR's replay is ready in about a second
const KEEPALIVE_MS = 15_000;
const LIVE_EDGE_MS = 20_000;
const WARM_EVERY_MS = 10 * 60_000; // the add-on keeps a listed day for hours
const UI_HIDE_MS = 1800; // while playing, the controls hide this long after the last touch
const SEEK_STEP_S = 10;
const TAP_MS = 300; // a second tap within this is a double tap (so a single tap acts this much later)
const SKIP_S = 10; // a double tap on a side: back or forward this much
const STREAK_MS = 800; // after a double tap, each tap on the same side within this skips again
const MAX_ZOOM = 8;

let session = new IngressSession();
let locator = new AddonLocator();
let hlsLoading = null;
let warmed = new Map();

/** Tests: forget the page-wide session, add-on URL, hls.js loader and warm-ups. */
export function resetNvrShared() {
  session = new IngressSession();
  locator = new AddonLocator();
  hlsLoading = null;
  warmed = new Map();
}

/**
 * Have the add-on list a camera's recordings of today ahead of a play, so the first play needs no NVR search
 * (about a second). At most every 10 minutes per camera; problems are left for a play to report.
 */
export async function warmNvr(hass, addon, channel) {
  if (!hass || !Number.isInteger(channel)) return;
  const slug = addon || DEFAULT_NVR_ADDON;
  const key = `${slug}:${channel}`;
  const now = Date.now();
  if (warmed.has(key) && now - warmed.get(key) < WARM_EVERY_MS) return;
  warmed.set(key, now);
  try {
    const base = await locator.base(hass, slug);
    await session.ensure(hass);
    await fetch(`${base}api/warm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    // The play itself reports what is wrong; try again in a minute.
    warmed.set(key, now - WARM_EVERY_MS + 60_000);
  }
}

/** hls.js from the add-on, once per page (the UMD build sets window.Hls). */
function loadHlsJs(base) {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsLoading) {
    hlsLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      // An AMD loader on the page would capture the UMD build instead of window.Hls.
      const amd = window.define && window.define.amd ? window.define : null;
      if (amd) window.define = undefined;
      const done = () => {
        if (amd) window.define = amd;
      };
      script.src = base + HLS_JS_PATH;
      script.async = true;
      script.onload = () => {
        done();
        if (window.Hls) resolve(window.Hls);
        else reject(new NvrError("playback", "The video player didn't load."));
      };
      script.onerror = () => {
        done();
        hlsLoading = null;
        script.remove();
        reject(
          new NvrError("addon", "Couldn't load the video player from the NVR Playback add-on.")
        );
      };
      document.head.appendChild(script);
    });
  }
  return hlsLoading;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stopEvent = (e) => e.stopPropagation();

/** m:ss, or h:mm:ss from an hour on. */
export function fmtTime(s) {
  let t = Number.isFinite(s) && s > 0 ? Math.floor(s) : 0;
  const h = Math.floor(t / 3600);
  t -= h * 3600;
  const m = Math.floor(t / 60);
  const sec = String(t - m * 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The end of the buffered stretch the playhead is in (seconds), or 0. */
function bufferedEnd(video) {
  const b = video?.buffered;
  const t = video?.currentTime ?? 0;
  if (!b) return 0;
  for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.5 && t <= b.end(i)) return b.end(i);
  return 0;
}

export class CgcNvrPlayer extends LitElement {
  static get properties() {
    return {
      hass: { attribute: false },
      channel: { type: Number },
      time: { type: Number },
      stream: { type: String },
      addon: { type: String },
      poster: { type: String },
      bare: { type: Boolean },
      quiet: { type: Boolean, reflect: true },
      _phase: { state: true },
      _status: { state: true },
      _error: { state: true },
      _errorCode: { state: true },
      _clock: { state: true },
      _active: { state: true },
      _revealed: { state: true },
      _fullscreen: { state: true },
      _rot: { state: true },
      _ui: { state: true },
      _paused: { state: true },
      _muted: { state: true },
      _pos: { state: true },
      _dur: { state: true },
      _buf: { state: true },
      _drag: { state: true },
      _zoom: { state: true },
      _skip: { state: true },
    };
  }

  static get styles() {
    return nvrPlayerStyles;
  }

  constructor() {
    super();
    this.hass = null;
    this.channel = null;
    this.time = null;
    this.stream = "sub";
    this.addon = DEFAULT_NVR_ADDON;
    this.poster = "";
    this.bare = false;
    this.quiet = false;
    this._revealed = false;
    this._fullscreen = false;
    this._rot = 90;
    this._locked = false;
    this._fsAsked = false;
    this._motionOn = false;
    this._ui = true; // the overlay controls (they hide while playing, a tap brings them back)
    this._paused = true;
    this._muted = true;
    this._pos = 0;
    this._dur = 0;
    this._buf = 0;
    this._drag = null; // { id, ratio } while a finger drags the seek bar
    this._hideTimer = 0;
    // Gestures on the picture: taps, double taps (skip), pinch zoom and panning while zoomed.
    this._zoom = { s: 1, x: 0, y: 0 }; // scale, then the picture's pan in its own frame (px)
    this._skip = null; // { side, secs } shown a moment after a double-tap skip
    this._ptrs = new Map();
    this._gest = null;
    this._lastTap = null;
    this._tapTimer = 0;
    this._streak = null;
    this._skipTimer = 0;
    this._onFsChange = () => this._fsChanged();
    this._onMotion = (e) => this._motion(e);
    this._phase = "idle"; // idle | starting | fetching | buffering | playing | error
    this._status = null;
    this._error = "";
    this._errorCode = "";
    this._clock = null;
    this._active = "sub";
    this._client = newClientId();
    this._run = 0;
    this._base = "";
    this._name = "";
    this._hls = null;
    this._keepAlive = 0;
    this._recovered = false;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("fullscreenchange", this._onFsChange);
    document.addEventListener("webkitfullscreenchange", this._onFsChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("fullscreenchange", this._onFsChange);
    document.removeEventListener("webkitfullscreenchange", this._onFsChange);
    this._run++;
    clearTimeout(this._hideTimer);
    clearTimeout(this._tapTimer);
    clearTimeout(this._skipTimer);
    this._teardown();
    this._leftFullscreen();
  }

  updated() {
    // Hidden (see the styles) while a quiet start loads.
    this.toggleAttribute("revealed", this._revealed);
  }

  willUpdate(changed) {
    if (!this.hass || !Number.isInteger(this.channel) || !Number.isFinite(this.time)) return;
    if (changed.has("channel") || changed.has("time") || changed.has("addon")) {
      this._active = isNvrStream(this.stream) ? this.stream : "sub";
      this._begin(this.time);
    } else if (changed.has("stream") && isNvrStream(this.stream) && this.stream !== this._active) {
      this._active = this.stream;
      this._begin(this._clock ?? this.time);
    } else if (this._phase === "idle") {
      this._begin(this.time);
    }
  }

  // ── flow ────────────────────────────────────────────────────────────

  _begin(atMs) {
    // The NVR has nothing newer than a few seconds ago; start a little before "now" so there is something to see.
    atMs = Math.min(atMs, Date.now() - LIVE_EDGE_MS);
    const run = ++this._run;
    this._teardown();
    this._resetZoom();
    this._phase = "starting";
    this._status = null;
    this._error = "";
    this._errorCode = "";
    this._clock = atMs;
    this._recovered = false;
    this._target = atMs;
    this._go(run, atMs).catch((err) => {
      if (run !== this._run) return;
      const code = err instanceof NvrError ? err.code : "";
      this._fail(
        code,
        code === "no_recording" && atMs > Date.now() - 5 * 60_000
          ? "The NVR hasn't recorded past this moment yet."
          : messageOf(err)
      );
    });
  }

  /** Stop and show why; a quiet start that never showed itself asks the host to drop it instead. */
  _fail(code, message) {
    this._teardown();
    this._phase = "error";
    this._errorCode = code;
    this._error = message;
    if (this.quiet && !this._revealed)
      this.dispatchEvent(
        new CustomEvent("nvr-close", {
          detail: { quiet: true, error: message },
          bubbles: true,
          composed: true,
        })
      );
  }

  async _go(run, atMs) {
    this._base = await locator.base(this.hass, this.addon || DEFAULT_NVR_ADDON);
    await session.ensure(this.hass);
    if (run !== this._run) return;
    let st = await this._api("api/play", {
      channel: this.channel,
      stream: this._active,
      time: Math.round(atMs),
      client: this._client,
    });
    this._name = st.name;
    if (run !== this._run) return;
    this._status = st;
    this._phase = "fetching";
    const mode = this._mode();
    while (!st.ready) {
      if (st.state === "error")
        throw new NvrError("nvr", `NVR: ${st.error || "the download failed"}`);
      if (st.state === "cancelled") throw new NvrError("gone", "The download was stopped.");
      this._checkCodecs(st, mode);
      await sleep(st.engine === "replay" ? POLL_REPLAY_MS : POLL_MS);
      if (run !== this._run) return;
      const target = st.target_s ?? 0;
      st = await this._api(`api/status/${st.name}?c=${this._client}&t=${target}`);
      if (run !== this._run) return;
      this._status = st;
    }
    this._checkCodecs(st, mode);
    await this._attach(run, st, mode);
  }

  async _api(path, body = null, retried = false) {
    let r;
    try {
      r = await fetch(this._base + path, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      throw new NvrError("network", "Can't reach Home Assistant.");
    }
    if ((r.status === 401 || r.status === 403) && !retried) {
      session.invalidate();
      await session.ensure(this.hass);
      return this._api(path, body, true);
    }
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const code = data?.error;
      if (code === "no_recording")
        throw new NvrError("no_recording", "The NVR has no recording at this moment.");
      if (code === "gone") throw new NvrError("gone", "The download stopped. Try again.");
      if (code === "nvr") throw new NvrError("nvr", `NVR: ${data.message}`);
      if (r.status === 502 || r.status === 503) {
        locator.forget(this.addon || DEFAULT_NVR_ADDON);
        throw new NvrError("addon", "The NVR Playback add-on isn't answering.");
      }
      throw new NvrError("addon", data?.message || `The NVR Playback add-on answered ${r.status}.`);
    }
    return data;
  }

  _video() {
    return this.renderRoot?.querySelector("video") ?? null;
  }

  _mode() {
    const video = this._video();
    return playbackMode({
      nativeHls: video?.canPlayType?.("application/vnd.apple.mpegurl") || "",
      mse: !!(window.ManagedMediaSource || window.MediaSource),
      userAgent: navigator.userAgent || "",
    });
  }

  _checkCodecs(st, mode) {
    if (!st.codecs) return;
    const MS = window.ManagedMediaSource || window.MediaSource;
    const video = this._video();
    const ok = codecSupported(st.codecs, mode, {
      mse: MS?.isTypeSupported ? (t) => MS.isTypeSupported(t) : undefined,
      native: video?.canPlayType ? (t) => video.canPlayType(t) : undefined,
    });
    if (ok) return;
    if (st.stream === "main")
      throw new NvrError(
        "codec",
        `This device can't play the High stream (HEVC ${st.width}×${st.height}). Low works everywhere.`
      );
    throw new NvrError("codec", "This device can't play this recording's video format.");
  }

  async _attach(run, st, mode) {
    const video = this._video();
    if (!video) throw new NvrError("playback", "No video element.");
    const target = st.target_s ?? 0;
    const url = `${this._base}hls/${st.name}/index.m3u8?c=${this._client}&start=${target.toFixed(3)}`;
    this._phase = "buffering";
    if (mode === "native") {
      video.src = url;
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (Math.abs(video.currentTime - target) > 0.75) {
            try {
              video.currentTime = target;
            } catch {
              /* Safari applies EXT-X-START itself */
            }
          }
          this._play(video);
        },
        { once: true }
      );
    } else if (mode === "hlsjs") {
      const Hls = await loadHlsJs(this._base);
      if (run !== this._run) return;
      if (!Hls.isSupported())
        throw new NvrError("browser", "This browser can't play the recording.");
      const hls = new Hls({
        startPosition: target,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 60,
        enableWorker: true,
        fragLoadPolicy: {
          default:
            st.engine === "replay"
              ? // The NVR sends any part in a second or two: a part that takes long is asked again.
                {
                  maxTimeToFirstByteMs: 15_000,
                  maxLoadTimeMs: 40_000,
                  timeoutRetry: { maxNumRetry: 3, retryDelayMs: 0, maxRetryDelayMs: 0 },
                  errorRetry: { maxNumRetry: 6, retryDelayMs: 500, maxRetryDelayMs: 4000 },
                }
              : // Download fallback: a part not downloaded yet is answered when it arrives.
                {
                  maxTimeToFirstByteMs: 240_000,
                  maxLoadTimeMs: 300_000,
                  timeoutRetry: { maxNumRetry: 2, retryDelayMs: 1000, maxRetryDelayMs: 4000 },
                  errorRetry: { maxNumRetry: 4, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
                },
        },
      });
      this._hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => this._play(video));
      hls.on(Hls.Events.ERROR, (_e, data) => this._onHlsError(Hls, hls, data, run));
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      throw new NvrError("browser", "This browser can't play HLS video.");
    }
    this._startKeepAlive(run);
  }

  /** Autoplay can be refused (iOS Low Power Mode): then show the video and let its controls start it. */
  _play(video) {
    video.play().catch(() => {
      if (this._phase === "buffering") this._phase = "playing";
      this._reveal();
    });
  }

  _onHlsError(Hls, hls, data, run) {
    if (!data?.fatal || run !== this._run) return;
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this._recovered) {
      this._recovered = true;
      hls.recoverMediaError();
      return;
    }
    this._fail(
      "playback",
      data.type === Hls.ErrorTypes.NETWORK_ERROR
        ? "Lost the connection to the NVR Playback add-on."
        : "The recording couldn't be played."
    );
  }

  _startKeepAlive(run) {
    clearInterval(this._keepAlive);
    this._keepAlive = setInterval(async () => {
      if (run !== this._run) return;
      try {
        await session.ensure(this.hass);
        if (this._status && this._status.state !== "complete") {
          const st = await this._api(`api/status/${this._name}?c=${this._client}`);
          if (run === this._run) this._status = { ...this._status, ...st };
        }
      } catch {
        /* the next tick tries again; playback errors surface through the player */
      }
    }, KEEPALIVE_MS);
  }

  _teardown() {
    clearInterval(this._keepAlive);
    this._keepAlive = 0;
    if (this._hls) {
      try {
        this._hls.destroy();
      } catch {
        /* already gone */
      }
      this._hls = null;
    }
    const video = this._video();
    if (video && video.getAttribute("src")) {
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* nothing loaded */
      }
    }
    if (this._name && this._base) {
      const name = this._name;
      this._name = "";
      fetch(`${this._base}api/stop/${name}?c=${this._client}`, {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {});
    }
  }

  // ── video events ────────────────────────────────────────────────────

  _onTimeUpdate(e) {
    const video = e.target;
    if (!this._drag) this._pos = video.currentTime;
    this._buf = bufferedEnd(video);
    if (!this._status) return;
    this._clock = clockAt(this._status, video.currentTime);
    if (!video.paused) {
      if (this._phase === "buffering") this._phase = "playing";
      this._reveal();
    }
  }

  /** started: the video plays (a quiet player shows itself); else it can play (the first frame is up). */
  _onPlaying(started) {
    if (this._phase === "buffering") this._phase = "playing";
    if (started) {
      this._paused = false;
      this._reveal();
      this._armHide();
    }
  }

  _onDuration(e) {
    const d = e.target.duration;
    if (Number.isFinite(d) && d > 0) this._dur = d;
  }

  _onPlay() {
    this._paused = false;
    this._armHide();
  }

  _onPause() {
    this._paused = true;
    this._showUi(false);
  }

  _reveal() {
    if (this._revealed) return;
    this._revealed = true;
    this._showUi(); // shown a moment, so the viewer sees what plays (and Low / High)
    if (this.quiet)
      this.dispatchEvent(new CustomEvent("nvr-reveal", { bubbles: true, composed: true }));
  }

  // ── the overlay controls ────────────────────────────────────────────

  _showUi(autoHide = true) {
    this._ui = true;
    clearTimeout(this._hideTimer);
    if (autoHide) this._armHide();
  }

  _armHide() {
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => {
      const video = this._video();
      if (this._drag || !video || video.paused || this._phase !== "playing") return;
      this._ui = false;
    }, UI_HIDE_MS);
  }

  // ── gestures on the picture ─────────────────────────────────────────

  /** The picture's centre on screen and its own width (the frame it is drawn in, turned or not). */
  _frame() {
    const stage = this.renderRoot?.querySelector(".nvr-stage");
    const r = stage?.getBoundingClientRect();
    if (!r) return null;
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      w: stage.offsetWidth || r.width,
      h: stage.offsetHeight || r.height,
    };
  }

  _tapDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (tests) */
    }
    this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._ptrs.size === 1) {
      this._gest = {
        kind: "tap",
        x0: e.clientX,
        y0: e.clientY,
        t0: performance.now(),
        moved: false,
        pan: { ...this._zoom },
      };
    } else if (this._ptrs.size === 2) {
      const [a, b] = [...this._ptrs.values()];
      this._gest = { kind: "pinch", d0: dist(a, b) || 1, z0: { ...this._zoom }, m0: mid(a, b) };
      clearTimeout(this._tapTimer);
      this._lastTap = null;
    }
  }

  _tapMove(e) {
    const p = this._ptrs.get(e.pointerId);
    const g = this._gest;
    if (!p || !g) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (g.kind === "pinch" && this._ptrs.size >= 2) {
      const [a, b] = [...this._ptrs.values()];
      const f = this._frame();
      if (!f) return;
      const turn = this._turn();
      const s = Math.min(MAX_ZOOM, Math.max(1, g.z0.s * (dist(a, b) / g.d0)));
      // The point of the picture under the fingers when they landed stays under them.
      const [ux, uy] = unturn(g.m0.x - f.cx, g.m0.y - f.cy, turn);
      const lx = (ux - g.z0.x) / g.z0.s;
      const ly = (uy - g.z0.y) / g.z0.s;
      const m = mid(a, b);
      const [vx, vy] = unturn(m.x - f.cx, m.y - f.cy, turn);
      this._setZoom(s, vx - s * lx, vy - s * ly);
    } else if (g.kind === "tap") {
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.moved && Math.hypot(dx, dy) > 10) g.moved = true;
      if (g.moved && this._zoom.s > 1) {
        const [lx, ly] = unturn(dx, dy, this._turn());
        this._setZoom(this._zoom.s, g.pan.x + lx, g.pan.y + ly);
      }
    }
  }

  _tapUp(e) {
    const g = this._gest;
    if (!this._ptrs.delete(e.pointerId) || !g) return;
    if (g.kind === "pinch") {
      if (this._ptrs.size === 1) {
        // One finger stays: it pans from here.
        const [p] = [...this._ptrs.values()];
        this._gest = {
          kind: "tap",
          x0: p.x,
          y0: p.y,
          t0: performance.now(),
          moved: true,
          pan: { ...this._zoom },
        };
      } else if (!this._ptrs.size) {
        this._gest = null;
      }
      return;
    }
    if (!this._ptrs.size) this._gest = null;
    if (e.type === "pointercancel" || g.moved || performance.now() - g.t0 > 500) return;
    this._tapAt(e.clientX, e.clientY);
  }

  /** -1 / 1: the left / right side of the picture (in its own frame); 0: the middle fifth. */
  _sideAt(x, y) {
    const f = this._frame();
    if (!f) return 0;
    const [lx] = unturn(x - f.cx, y - f.cy, this._turn());
    return lx < -f.w * 0.1 ? -1 : lx > f.w * 0.1 ? 1 : 0;
  }

  _tapAt(x, y) {
    const now = performance.now();
    const side = this._sideAt(x, y);
    if (this._streak && now < this._streak.until && side && side === this._streak.side) {
      this._skipBy(side); // tapping on after a double tap keeps skipping
      return;
    }
    const last = this._lastTap;
    if (last && now - last.t < TAP_MS && Math.hypot(x - last.x, y - last.y) < 80) {
      clearTimeout(this._tapTimer);
      this._lastTap = null;
      if (side) this._skipBy(side);
      return;
    }
    this._lastTap = { t: now, x, y };
    clearTimeout(this._tapTimer);
    this._tapTimer = setTimeout(() => {
      this._lastTap = null;
      this._onTap();
    }, TAP_MS);
  }

  _skipBy(side) {
    if (this._phase !== "playing") return;
    const now = performance.now();
    const going = this._streak && now < this._streak.until && this._streak.side === side;
    this._streak = { side, until: now + STREAK_MS, secs: (going ? this._streak.secs : 0) + SKIP_S };
    this._seekTo((this._video()?.currentTime ?? 0) + side * SKIP_S);
    this._skip = { side, secs: this._streak.secs };
    clearTimeout(this._skipTimer);
    this._skipTimer = setTimeout(() => {
      this._skip = null;
    }, STREAK_MS);
  }

  _onWheel(e) {
    if (!e.ctrlKey) return; // a trackpad pinch (or Ctrl + wheel) zooms; a plain wheel scrolls the page
    e.preventDefault();
    const f = this._frame();
    if (!f) return;
    const z = this._zoom;
    const s = Math.min(MAX_ZOOM, Math.max(1, z.s * (e.deltaY > 0 ? 0.9 : 1.1)));
    const [ux, uy] = unturn(e.clientX - f.cx, e.clientY - f.cy, this._turn());
    const lx = (ux - z.x) / z.s;
    const ly = (uy - z.y) / z.s;
    this._setZoom(s, ux - s * lx, uy - s * ly);
  }

  _setZoom(s, x, y) {
    if (s <= 1.01) {
      this._resetZoom();
      return;
    }
    const f = this._frame();
    const mx = f ? (f.w * (s - 1)) / 2 : 0;
    const my = f ? (f.h * (s - 1)) / 2 : 0;
    this._zoom = { s, x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  }

  _resetZoom() {
    if (this._zoom.s !== 1 || this._zoom.x || this._zoom.y) this._zoom = { s: 1, x: 0, y: 0 };
  }

  /** A tap on the picture: hide the controls while playing, else show them. */
  _onTap() {
    const video = this._video();
    if (this._ui && video && !video.paused && this._phase === "playing" && !this._drag) {
      clearTimeout(this._hideTimer);
      this._ui = false;
    } else {
      this._showUi();
    }
  }

  _togglePlay() {
    const video = this._video();
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    this._showUi();
  }

  _toggleMute() {
    const video = this._video();
    if (!video) return;
    video.muted = !video.muted;
    this._muted = video.muted;
    this._showUi();
  }

  /** How far the picture is turned (degrees): full screen on a portrait screen (see the styles). */
  _turn() {
    return this._fullscreen && portraitScreen() ? this._rot : 0;
  }

  /** Where along the seek bar a pointer is (0..1), along the bar's own axis: turned with the picture, the bar
   * runs down the screen (90°) or up it (-90°). The native video timeline measured the screen's x there. */
  _seekRatio(e, bar) {
    const r = bar.getBoundingClientRect();
    const turn = this._turn();
    let p;
    if (turn === 90) p = r.height ? (e.clientY - r.top) / r.height : 0;
    else if (turn === -90) p = r.height ? (r.bottom - e.clientY) / r.height : 0;
    else p = r.width ? (e.clientX - r.left) / r.width : 0;
    return Math.min(1, Math.max(0, p));
  }

  _seekDown(e) {
    if (!this._dur || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const bar = e.currentTarget;
    try {
      bar.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (tests) */
    }
    this._drag = { id: e.pointerId, ratio: this._seekRatio(e, bar) };
    this._showUi(false);
  }

  _seekMove(e) {
    if (!this._drag || e.pointerId !== this._drag.id) return;
    this._drag = { ...this._drag, ratio: this._seekRatio(e, e.currentTarget) };
  }

  _seekUp(e) {
    if (!this._drag || e.pointerId !== this._drag.id) return;
    const ratio = this._seekRatio(e, e.currentTarget);
    this._drag = null;
    this._seekTo(ratio * this._dur); // on release: every seek moves the NVR
    this._showUi();
  }

  _seekCancel(e) {
    if (!this._drag || e.pointerId !== this._drag.id) return;
    this._drag = null;
    this._showUi();
  }

  _seekKey(e) {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? SEEK_STEP_S
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -SEEK_STEP_S
          : 0;
    if (!step) return;
    e.preventDefault();
    this._seekTo((this._video()?.currentTime ?? 0) + step);
    this._showUi();
  }

  _seekTo(t) {
    const video = this._video();
    if (!video) return;
    const end = this._dur || video.duration || 0;
    video.currentTime = Math.min(Math.max(0, t), Math.max(0, end - 0.5));
    this._pos = video.currentTime;
  }

  _onEnded() {
    if (!this._status) return;
    this._begin(nextFileTime(this._status));
  }

  _onVideoError() {
    if (this._hls || this._phase === "idle" || this._phase === "error") return;
    const video = this._video();
    if (!video?.getAttribute("src")) return;
    this._fail("playback", "The recording couldn't be played on this device.");
  }

  // ── actions ─────────────────────────────────────────────────────────

  _switchStream(stream) {
    if (stream === this._active && this._phase !== "error") return;
    this._active = stream;
    this._begin(this._clock ?? this.time);
    this.dispatchEvent(
      new CustomEvent("nvr-stream", { detail: { stream }, bubbles: true, composed: true })
    );
  }

  _retry() {
    this._begin(this._target ?? this.time);
  }

  _close() {
    this.dispatchEvent(new CustomEvent("nvr-close", { bubbles: true, composed: true }));
  }

  // ── full screen (landscape) ─────────────────────────────────────────

  async _toggleFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      try {
        await exit?.call(document);
      } catch {
        /* already left */
      }
      return;
    }
    const el = this.renderRoot?.querySelector(".nvr");
    const video = this._video();
    const request = el?.requestFullscreen || el?.webkitRequestFullscreen;
    if (request) {
      try {
        this._fsAsked = true;
        await request.call(el, { navigationUI: "hide" });
        // Chrome turns the screen; a WebView (the Home Assistant app) can't, and the picture is turned instead.
        await screen.orientation
          ?.lock?.("landscape")
          .then(() => {
            this._locked = true;
          })
          .catch(() => {});
        return;
      } catch {
        this._fsAsked = false; // not allowed for an element here: the video's own full screen
      }
    }
    // iPhone: only the video's own full screen, whose player turns with the phone.
    if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else video?.requestFullscreen?.().catch(() => {});
  }

  _fsChanged() {
    // The document only sees the outermost shadow host (in Home Assistant, <home-assistant>): ask our own root,
    // or (engines without ShadowRoot.fullscreenElement) whether we asked for it.
    const any = document.fullscreenElement || document.webkitFullscreenElement;
    const root = this.renderRoot;
    const ours =
      root && "fullscreenElement" in root
        ? root.fullscreenElement === root.querySelector(".nvr")
        : this._fsAsked;
    const now = !!any && ours;
    if (!any) this._fsAsked = false;
    if (now === this._fullscreen) return;
    this._fullscreen = now;
    this._resetZoom(); // the frame changed size (and maybe turned)
    if (now) this._startMotion();
    else this._leftFullscreen();
  }

  _leftFullscreen() {
    this._fullscreen = false;
    if (this._motionOn) {
      this._motionOn = false;
      window.removeEventListener("devicemotion", this._onMotion);
    }
    if (this._locked) {
      this._locked = false;
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* nothing locked */
      }
    }
  }

  /** Which way the phone is turned (where the browser tells: https), so the turned picture is upright. */
  _startMotion() {
    if (this._motionOn || typeof window.DeviceMotionEvent === "undefined") return;
    this._motionOn = true;
    window.addEventListener("devicemotion", this._onMotion);
  }

  _motion(e) {
    const next = turnFromMotion(e?.accelerationIncludingGravity?.x, this._rot);
    if (next !== this._rot) this._rot = next;
  }

  // ── render ──────────────────────────────────────────────────────────

  render() {
    const locale = this.hass?.locale;
    const waiting = this._phase !== "playing" && (!this.quiet || this._revealed);
    const shown = this._ui || this._phase !== "playing" || this._paused || !!this._drag;
    const z = this._zoom;
    const zoomed = z.s > 1;
    return html`
      <div
        class="nvr ${this._fullscreen ? "fs" : ""} ${zoomed ? "zoomed" : ""}"
        @pointerdown=${stopEvent}
        @pointerup=${stopEvent}
        @pointercancel=${stopEvent}
        @click=${stopEvent}
        @dblclick=${stopEvent}
        @touchstart=${{ handleEvent: stopEvent, passive: true }}
        @touchend=${stopEvent}
        @wheel=${{ handleEvent: stopEvent, passive: true }}
      >
        <div class="nvr-stage" style="--nvr-rot:${this._rot}deg">
          <video
            class="nvr-video"
            style=${zoomed ? `transform:translate(${z.x}px,${z.y}px) scale(${z.s})` : ""}
            playsinline
            muted
            @timeupdate=${(e) => this._onTimeUpdate(e)}
            @durationchange=${(e) => this._onDuration(e)}
            @loadedmetadata=${(e) => this._onDuration(e)}
            @progress=${(e) => (this._buf = bufferedEnd(e.target))}
            @play=${() => this._onPlay()}
            @pause=${() => this._onPause()}
            @volumechange=${(e) => (this._muted = e.target.muted)}
            @playing=${() => this._onPlaying(true)}
            @canplay=${() => this._onPlaying(false)}
            @ended=${() => this._onEnded()}
            @error=${() => this._onVideoError()}
          ></video>
          <div
            class="nvr-tap"
            @pointerdown=${(e) => this._tapDown(e)}
            @pointermove=${(e) => this._tapMove(e)}
            @pointerup=${(e) => this._tapUp(e)}
            @pointercancel=${(e) => this._tapUp(e)}
            @wheel=${(e) => this._onWheel(e)}
          ></div>
          ${this._skip
            ? html`<div class="nvr-skip ${this._skip.side < 0 ? "back" : "fwd"}" aria-live="polite">
                <ha-icon icon=${this._skip.side < 0 ? "mdi:rewind" : "mdi:fast-forward"}></ha-icon>
                ${this._skip.side < 0 ? "−" : "+"}${this._skip.secs} s
              </div>`
            : ""}
          ${waiting ? this._renderWait() : ""}
          <div class="nvr-ui ${shown ? "shown" : ""}">
            ${this.bare
              ? "" /* the host has its own Low / High and close; the camera shows the time itself */
              : html`<div class="nvr-bar">
                  ${zoomed ? this._renderZoomChip() : ""}
                  <span class="nvr-gap"></span>
                  ${this._renderControls()}
                </div>`}
            ${this.bare && zoomed
              ? html`<div class="nvr-bar nvr-bar-min">${this._renderZoomChip()}</div>`
              : ""}
            ${this._phase === "playing"
              ? this._renderTransport(locale)
              : html`<div class="nvr-ctl nvr-ctl-min">${this._renderFullscreen()}</div>`}
          </div>
        </div>
      </div>
    `;
  }

  _renderTransport(locale) {
    const dur = this._dur;
    const pos = this._drag ? this._drag.ratio * dur : this._pos;
    const pct = dur ? Math.min(100, Math.max(0, (pos / dur) * 100)) : 0;
    const buf = dur ? Math.min(100, (this._buf / dur) * 100) : 0;
    const play = this._paused ? "Play" : "Pause";
    return html`
      <button class="nvr-big" title=${play} aria-label=${play} @click=${() => this._togglePlay()}>
        <ha-icon icon=${this._paused ? "mdi:play" : "mdi:pause"}></ha-icon>
      </button>
      <div class="nvr-ctl">
        <span class="nvr-time">${fmtTime(pos)} / ${fmtTime(dur)}</span>
        <div
          class="nvr-seek ${this._drag ? "drag" : ""}"
          role="slider"
          tabindex="0"
          aria-label="Seek"
          aria-valuemin="0"
          aria-valuemax=${Math.round(dur)}
          aria-valuenow=${Math.round(pos)}
          @pointerdown=${(e) => this._seekDown(e)}
          @pointermove=${(e) => this._seekMove(e)}
          @pointerup=${(e) => this._seekUp(e)}
          @pointercancel=${(e) => this._seekCancel(e)}
          @keydown=${(e) => this._seekKey(e)}
        >
          <div class="nvr-seek-track">
            <div class="nvr-seek-buf" style="width:${buf}%"></div>
            <div class="nvr-seek-fill" style="width:${pct}%"></div>
          </div>
          <div class="nvr-seek-thumb" style="left:${pct}%"></div>
          ${this._drag
            ? html`<div class="nvr-seek-tip" style="left:${pct}%">
                ${formatClockFromMs(this._status ? clockAt(this._status, pos) : NaN, locale)}
              </div>`
            : ""}
        </div>
        <button
          class="nvr-icon nvr-mute"
          title=${this._muted ? "Unmute" : "Mute"}
          aria-label=${this._muted ? "Unmute" : "Mute"}
          @click=${() => this._toggleMute()}
        >
          <ha-icon icon=${this._muted ? "mdi:volume-off" : "mdi:volume-high"}></ha-icon>
        </button>
        ${this._renderFullscreen()}
      </div>
    `;
  }

  _renderZoomChip() {
    return html`<button
      class="nvr-zoom"
      title="Back to the whole picture"
      aria-label="Zoom ${this._zoom.s.toFixed(1)}×, reset"
      @click=${() => this._resetZoom()}
    >
      <ha-icon icon="mdi:magnify-minus-outline"></ha-icon>${this._zoom.s.toFixed(1)}×
    </button>`;
  }

  _renderFullscreen() {
    const label = this._fullscreen ? "Exit full screen" : "Full screen";
    return html`<button
      class="nvr-icon nvr-fs"
      title=${label}
      aria-label=${label}
      @click=${() => this._toggleFullscreen()}
    >
      <ha-icon icon=${this._fullscreen ? "mdi:fullscreen-exit" : "mdi:fullscreen"}></ha-icon>
    </button>`;
  }

  _renderControls() {
    return html`
      <span class="nvr-res" role="group" aria-label="Resolution">
        ${NVR_STREAMS.map(
          (s) =>
            html`<button
              class=${s === this._active ? "on" : ""}
              aria-pressed=${s === this._active ? "true" : "false"}
              title=${s === "sub" ? "Low resolution (fast)" : "High resolution (slower to start)"}
              @click=${() => this._switchStream(s)}
            >
              ${NVR_STREAM_LABEL[s]}
            </button>`
        )}
      </span>
      <button
        class="nvr-icon nvr-close"
        title="Back to the snapshots"
        aria-label="Close"
        @click=${() => this._close()}
      >
        <ha-icon icon="mdi:close"></ha-icon>
      </button>
    `;
  }

  _renderWait() {
    const bg = this.poster ? `background-image:url("${this.poster}")` : "";
    if (this._phase === "error") {
      return html`<div class="nvr-wait" style=${bg}>
        <div class="nvr-box error" role="alert">
          <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
          <div>${this._error}</div>
          <div class="nvr-actions">
            ${this._errorCode === "codec" && this._active === "main"
              ? html`<button @click=${() => this._switchStream("sub")}>Play Low</button>`
              : this._errorCode === "no_recording"
                ? ""
                : html`<button @click=${() => this._retry()}>Try again</button>`}
            <button @click=${() => this._close()}>Back</button>
          </div>
        </div>
      </div>`;
    }
    const st = this._status;
    const label = NVR_STREAM_LABEL[this._active] || "";
    const title =
      this._phase === "buffering"
        ? "Starting playback…"
        : this._phase === "fetching"
          ? st?.engine === "replay"
            ? `Opening the ${label.toLowerCase()}-resolution recording…`
            : `Fetching the ${label.toLowerCase()}-resolution recording from the NVR…`
          : "Connecting to the NVR…";
    const pct = Math.round((st?.progress ?? 0) * 100);
    return html`<div class="nvr-wait" style=${bg}>
      <div class="nvr-box" role="status">
        <div class="nvr-spin"></div>
        <div>${title}</div>
        ${this._phase === "fetching"
          ? html`<div class="nvr-progress"><div style="width:${pct}%"></div></div>
              <div class="nvr-detail">${progressDetail(st)}</div>`
          : ""}
      </div>
    </div>`;
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, CgcNvrPlayer);
