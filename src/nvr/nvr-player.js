/**
 * <cgc-nvr-player> (BL-008): plays the NVR's recording from one moment, inside the gallery viewer or the
 * timeline's full view.
 *
 * Properties (set by the card):
 *   hass, channel (NVR channel), time (epoch ms to start at), stream ("sub" = Low, "main" = High),
 *   addon (add-on slug, default local_nvr_playback), poster (picture shown while the recording is fetched),
 *   bare (true where the host shows its own Low / High and close buttons: then the bar is just the clock)
 * Events (bubbling, composed):
 *   nvr-close: the viewer asked to go back to the snapshots
 *   nvr-stream: { stream } the viewer switched between Low and High
 *
 * The NVR can only send a recording from its start (30-minute files), so the add-on downloads up to the
 * moment first; this element shows that progress over the poster, then plays the add-on's HLS stream from the
 * moment with native HLS (Safari, iOS) or hls.js (loaded from the add-on), and goes on to the next recording at
 * the end.
 */

import { LitElement, html } from "lit";

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

let session = new IngressSession();
let locator = new AddonLocator();
let hlsLoading = null;

/** Tests: forget the page-wide session, add-on URL and hls.js loader. */
export function resetNvrShared() {
  session = new IngressSession();
  locator = new AddonLocator();
  hlsLoading = null;
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
      _phase: { state: true },
      _status: { state: true },
      _error: { state: true },
      _errorCode: { state: true },
      _clock: { state: true },
      _active: { state: true },
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

  disconnectedCallback() {
    super.disconnectedCallback();
    this._run++;
    this._teardown();
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
    this._phase = "starting";
    this._status = null;
    this._error = "";
    this._errorCode = "";
    this._clock = atMs;
    this._recovered = false;
    this._target = atMs;
    this._go(run, atMs).catch((err) => {
      if (run !== this._run) return;
      this._teardown();
      this._phase = "error";
      this._errorCode = err instanceof NvrError ? err.code : "";
      this._error =
        this._errorCode === "no_recording" && atMs > Date.now() - 5 * 60_000
          ? "The NVR hasn't recorded past this moment yet."
          : messageOf(err);
    });
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
        // A part not downloaded yet is answered when it arrives (the add-on waits for the NVR).
        fragLoadPolicy: {
          default: {
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
    });
  }

  _onHlsError(Hls, hls, data, run) {
    if (!data?.fatal || run !== this._run) return;
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this._recovered) {
      this._recovered = true;
      hls.recoverMediaError();
      return;
    }
    this._teardown();
    this._phase = "error";
    this._errorCode = "playback";
    this._error =
      data.type === Hls.ErrorTypes.NETWORK_ERROR
        ? "Lost the connection to the NVR Playback add-on."
        : "The recording couldn't be played.";
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
    if (!this._status) return;
    this._clock = clockAt(this._status, e.target.currentTime);
    if (this._phase === "buffering" && !e.target.paused) this._phase = "playing";
  }

  _onPlaying() {
    if (this._phase === "buffering") this._phase = "playing";
  }

  _onEnded() {
    if (!this._status) return;
    this._begin(nextFileTime(this._status));
  }

  _onVideoError() {
    if (this._hls || this._phase === "idle" || this._phase === "error") return;
    const video = this._video();
    if (!video?.getAttribute("src")) return;
    this._teardown();
    this._phase = "error";
    this._errorCode = "playback";
    this._error = "The recording couldn't be played on this device.";
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

  // ── render ──────────────────────────────────────────────────────────

  render() {
    const locale = this.hass?.locale;
    const waiting = this._phase !== "playing";
    return html`
      <div
        class="nvr"
        @pointerdown=${stopEvent}
        @pointerup=${stopEvent}
        @pointercancel=${stopEvent}
        @click=${stopEvent}
        @dblclick=${stopEvent}
        @touchstart=${{ handleEvent: stopEvent, passive: true }}
        @touchend=${stopEvent}
        @wheel=${{ handleEvent: stopEvent, passive: true }}
      >
        <video
          class="nvr-video"
          playsinline
          muted
          controls
          @timeupdate=${(e) => this._onTimeUpdate(e)}
          @playing=${() => this._onPlaying()}
          @canplay=${() => this._onPlaying()}
          @ended=${() => this._onEnded()}
          @error=${() => this._onVideoError()}
        ></video>
        ${waiting ? this._renderWait() : ""}
        <div class="nvr-bar">
          <span class="nvr-tag"><ha-icon icon="mdi:filmstrip-box"></ha-icon>NVR</span>
          <span class="nvr-clock">${formatClockFromMs(this._clock ?? NaN, locale)}</span>
          ${this.bare ? "" : this._renderControls()}
        </div>
      </div>
    `;
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
        class="nvr-close"
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
