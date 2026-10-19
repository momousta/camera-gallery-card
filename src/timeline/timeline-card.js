/**
 * camera-timeline-card (BL-007): every camera on one timeline.
 *
 * One shared moment drives a grid of cameras: each tile shows that camera's frame at or just before the moment
 * (its small preview, BL-006), with how old it is. Drag or flick the time track under the centre playhead, or
 * play it forward; pausing holds every camera on that moment. Tap a camera for its full clip.
 *
 * Config:
 *   type: custom:camera-timeline-card
 *   path_datetime_format: YYYYMMDD_HHmmss     # how times are read from the file names (required)
 *   thumbnail_folder: thumbs                  # previews next to the files (recommended)
 *   preload: true                             # load the day's previews around the moment in the background
 *   cameras:                                  # FileTrack-style sensors with a `fileList` attribute
 *     - entity: sensor.filetrack_front_right
 *       name: Front Right
 *       navigation_path: /main-dashboard/front-right   # "Open camera" in the full view (optional)
 *       gallery_id: front_right                         # that page's gallery card `url_id`: open it on this
 *                                                       # exact file (cgc_src) and moment (cgc_time)
 *       nvr_channel: 7                                  # BL-008: Low / High in the full view play the NVR's
 *                                                       # recording from the moment on the track
 *   nvr_addon: local_nvr_playback             # the NVR Playback add-on's slug (default)
 */

import { LitElement, html } from "lit";
import { guard } from "lit/directives/guard.js";

import { monthOf } from "../data/calendar";
import { DEFAULT_NVR_ADDON, NVR_STREAM_LABEL, NVR_STREAMS, nvrChannelOf } from "../nvr/nvr-api";
import "../nvr/nvr-player.js";
import { ThumbPreloader } from "../data/preload";
import { sidecarFolder, sidecarUrl } from "../data/sidecar";
import { renderCalendarPicker } from "../ui/calendar-picker";
import { calendarPickerStyles } from "../ui/calendar-picker-styles";
import { formatDay, formatTimeFromMs } from "../util/locale";
import {
  ageLabel,
  buildTrack,
  dayBounds,
  dayKeyOf,
  daysWithItems,
  DEFAULT_ZOOM_INDEX,
  hourMarks,
  itemAtOrBefore,
  itemsBetween,
  msToPx,
  preloadOrder,
  pxToMs,
  ZOOM_LEVELS,
} from "./timeline-data";
import { timelineStyles } from "./timeline-styles";

const TAG = "camera-timeline-card";
/** Playback speeds: seconds of footage per real second. */
export const TIMELINE_SPEEDS = [60, 300, 900];
const SPEED_LABELS = ["1 min/s", "5 min/s", "15 min/s"];
/** A frame older than this at the moment shown is dimmed. */
const STALE_MS = 30 * 60_000;
/** Re-plan the preloading when the moment moves this far from the last plan. */
const REPLAN_MS = 45 * 60_000;
const PRELOAD_CONCURRENCY = 4;
const VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i;
const KIND_ICON = {
  person: "mdi:walk",
  car: "mdi:car",
  dog: "mdi:dog-side",
  visitor: "mdi:doorbell",
};
const MARK_KINDS = new Set(["person", "car", "dog", "visitor", "motion"]);

export class CameraTimelineCard extends LitElement {
  static get properties() {
    return {
      _t: { state: true },
      _day: { state: true },
      _zoom: { state: true },
      _playing: { state: true },
      _speedIdx: { state: true },
      _overlay: { state: true },
      _calOpen: { state: true },
      _calMonth: { state: true },
      _half: { state: true },
      _rev: { state: true },
    };
  }

  static get styles() {
    return [timelineStyles, calendarPickerStyles];
  }

  constructor() {
    super();
    this.config = null;
    this._hass = null;
    this._tracks = [];
    this._refs = new Map();
    this._days = [];
    this._day = "";
    this._t = null;
    this._zoom = DEFAULT_ZOOM_INDEX;
    this._playing = false;
    this._speedIdx = 0;
    this._overlay = null;
    this._calOpen = false;
    this._calMonth = "";
    this._half = 0;
    this._rev = 0;
    this._needsScrollSync = true;
    this._scrollRaf = 0;
    this._playRaf = 0;
    this._failed = new Set();
    this._lastFrame = new Map();
    this._preloader = null;
    this._planKey = "";
    this._planT = null;
    this._planTimer = 0;
    this._drag = null;
    this._userMoved = false;
    this._syncedLeft = null;
    this._resizeObserver = null;
    this._onVisibility = () => this._preloader?.pump();
  }

  setConfig(config) {
    const cams = Array.isArray(config?.cameras)
      ? config.cameras
          .map((c) => (typeof c === "string" ? { entity: c } : c))
          .filter((c) => c && typeof c.entity === "string" && c.entity)
      : [];
    if (!cams.length)
      throw new Error(
        "camera-timeline-card: add `cameras:` with an `entity` (a FileTrack sensor) each"
      );
    if (!config.path_datetime_format) {
      throw new Error("camera-timeline-card: set `path_datetime_format` (e.g. YYYYMMDD_HHmmss)");
    }
    this.config = {
      thumbnail_folder: "",
      preload: true,
      nvr_addon: DEFAULT_NVR_ADDON,
      ...config,
      cameras: cams,
    };
    this._refs = new Map();
    this._rebuild();
  }

  getCardSize() {
    return 8;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._sourcesChanged()) this._rebuild();
    else if (first) this.requestUpdate();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this._onVisibility);
    this._needsScrollSync = true;
    if (this.hasUpdated) this.requestUpdate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._pause();
    if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf);
    this._scrollRaf = 0;
    clearTimeout(this._planTimer);
    this._planKey = "";
    this._preloader?.setQueue([]);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
  }

  // ── data ──────────────────────────────────────────────────────────────

  _sourcesChanged() {
    if (!this.config || !this._hass) return false;
    return this.config.cameras.some(
      (c) => this._refs.get(c.entity) !== this._hass.states?.[c.entity]?.attributes?.fileList
    );
  }

  _rebuild() {
    if (!this.config) return;
    const fmt = this.config.path_datetime_format;
    this._refs = new Map();
    this._tracks = this.config.cameras.map((c) => {
      const ref = this._hass?.states?.[c.entity]?.attributes?.fileList;
      this._refs.set(c.entity, ref);
      return buildTrack(ref, fmt);
    });
    this._days = daysWithItems(this._tracks);
    const newest = this._days[0] ?? dayKeyOf(Date.now());
    if (!this._day || (!this._userMoved && this._day !== newest)) this._setDay(newest);
    this._rev++;
  }

  /** Day bounds; `last` is the end of the scrollable range (now, for today). */
  _bounds() {
    const b = dayBounds(this._day);
    if (!b) return null;
    const last = Math.min(b.end - 1000, Math.max(b.start, Date.now()));
    return { ...b, last };
  }

  _ppm() {
    return ZOOM_LEVELS[this._zoom] ?? ZOOM_LEVELS[DEFAULT_ZOOM_INDEX];
  }

  _previewFor(src) {
    if (!src || this._failed.has(src)) return "";
    const folder = sidecarFolder(this.config?.thumbnail_folder);
    return folder ? sidecarUrl(src, folder) : "";
  }

  /** What a tile shows for an item: its preview, else the file itself (never a video file). */
  _tileUrl(item) {
    return this._previewFor(item.src) || (VIDEO_RE.test(item.src) ? "" : item.src);
  }

  // ── moment, day, zoom, play ─────────────────────────────────────────

  _setDay(day, t = null) {
    this._day = day;
    const b = dayBounds(day);
    if (!b) return;
    if (t === null) {
      // The newest moment of the day: now for today, else the day's last frame.
      const last = Math.min(b.end - 1000, Math.max(b.start, Date.now()));
      let latest = b.start;
      for (const items of this._tracks) {
        const i = itemAtOrBefore(items, last);
        if (i >= 0 && items[i].ms >= b.start) latest = Math.max(latest, items[i].ms);
      }
      t = dayKeyOf(Date.now()) === day ? last : latest;
    }
    this._t = Math.min(Math.max(t, b.start), Math.min(b.end - 1000, Math.max(b.start, Date.now())));
    this._needsScrollSync = true;
    this._schedulePreload(true);
  }

  _setT(t, { scroll = false } = {}) {
    const b = this._bounds();
    if (!b) return;
    this._t = Math.min(Math.max(t, b.start), b.last);
    if (scroll) this._needsScrollSync = true;
    this._schedulePreload(false);
  }

  /** The nearest day with clips before (-1) or after (+1) the shown day, or "". */
  _neighbourDay(delta) {
    let found = "";
    for (const d of this._days) {
      // _days is newest first.
      if (delta < 0 && d < this._day) return d;
      if (delta > 0 && d > this._day) found = d;
    }
    return found;
  }

  _stepDay(delta) {
    const next = this._neighbourDay(delta);
    if (!next) return;
    this._userMoved = true;
    this._pause();
    this._setDay(next);
  }

  _goNow() {
    this._userMoved = false;
    this._pause();
    this._setDay(dayKeyOf(Date.now()));
  }

  _zoomBy(delta) {
    const z = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, this._zoom + delta));
    if (z === this._zoom) return;
    this._zoom = z;
    this._needsScrollSync = true;
  }

  _togglePlay() {
    if (this._playing) this._pause();
    else this._play();
  }

  _play() {
    const b = this._bounds();
    if (!b || this._playing) return;
    if (this._t >= b.last - 1000) this._setT(b.start, { scroll: true });
    this._playing = true;
    let last = performance.now();
    const step = (now) => {
      if (!this._playing) return;
      const dt = Math.max(0, now - last);
      last = now;
      const bb = this._bounds();
      const next = this._t + dt * TIMELINE_SPEEDS[this._speedIdx];
      if (!bb || next >= bb.last) {
        this._setT(bb ? bb.last : this._t, { scroll: true });
        this._pause();
        return;
      }
      this._setT(next, { scroll: true });
      this._playRaf = requestAnimationFrame(step);
    };
    this._playRaf = requestAnimationFrame(step);
  }

  _pause() {
    this._playing = false;
    if (this._playRaf) cancelAnimationFrame(this._playRaf);
    this._playRaf = 0;
  }

  _cycleSpeed() {
    this._speedIdx = (this._speedIdx + 1) % TIMELINE_SPEEDS.length;
  }

  // ── the time track ──────────────────────────────────────────────────

  _scroller() {
    return this.renderRoot?.querySelector(".tl-scroll") ?? null;
  }

  _onScroll() {
    if (this._scrollRaf) return;
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = 0;
      const el = this._scroller();
      const b = this._bounds();
      if (!el || !b || this._needsScrollSync || this._playing) return;
      if (this._syncedLeft !== null && Math.abs(el.scrollLeft - this._syncedLeft) < 1) return;
      this._syncedLeft = null;
      this._userMoved = true;
      this._setT(pxToMs(el.scrollLeft, b.start, this._ppm()));
    });
  }

  /** A press, touch or wheel on the track takes over from playback. */
  _onUserTrack() {
    this._userMoved = true;
    if (this._playing) this._pause();
  }

  _onPointerDown(e) {
    this._onUserTrack();
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = this._scroller();
    if (!el) return;
    this._drag = { x: e.clientX, left: el.scrollLeft, id: e.pointerId };
    el.classList.add("dragging");
    el.setPointerCapture?.(e.pointerId);
  }

  _onPointerMove(e) {
    if (!this._drag || e.pointerId !== this._drag.id) return;
    const el = this._scroller();
    if (el) el.scrollLeft = this._drag.left - (e.clientX - this._drag.x);
  }

  _onPointerUp(e) {
    if (!this._drag || e.pointerId !== this._drag.id) return;
    this._drag = null;
    this._scroller()?.classList.remove("dragging");
  }

  _onWheel(e) {
    this._onUserTrack();
    const el = this._scroller();
    if (!el || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }

  _renderTrack(b, ppm, half) {
    const width = msToPx(b.last, b.start, ppm);
    const marks = hourMarks(b.start, b.end, ppm).filter((m) => m.ms <= b.last);
    const locale = this._hass?.locale;
    const laneStep = "calc(var(--tl-lane-h) + 2px)";
    const lanes = this._tracks.map((items) =>
      itemsBetween(items, b.start, b.end).filter((x) => MARK_KINDS.has(x.kind))
    );
    return html`
      <div
        class="tl-track"
        style="width:${Math.ceil(width + 2 * half)}px;--tl-lanes:${lanes.length}"
      >
        ${marks.map(
          (m) =>
            html`<div
              class="tl-hour ${m.major ? "major" : ""}"
              style="left:${half + msToPx(m.ms, b.start, ppm)}px"
            >
              <span>${formatTimeFromMs(m.ms, locale)}</span>
            </div>`
        )}
        ${b.last < b.end - 1000
          ? html`<div class="tl-now-edge" style="left:${half + width}px" title="Now"></div>`
          : ""}
        ${lanes.map(
          (items, ci) =>
            html`<div class="tl-lane" style="top:calc(30px + ${ci} * ${laneStep})">
              ${items.map(
                (it) =>
                  html`<i
                    class="tl-mark k-${it.kind}"
                    style="left:${half + msToPx(it.ms, b.start, ppm) - 1}px"
                  ></i>`
              )}
            </div>`
        )}
      </div>
    `;
  }

  // ── preloading ───────────────────────────────────────────────────────

  _schedulePreload(force) {
    if (!this.config?.preload || !sidecarFolder(this.config?.thumbnail_folder)) return;
    const key = `${this._day}|${this._rev}`;
    const moved = this._planT === null || Math.abs((this._t ?? 0) - this._planT) > REPLAN_MS;
    if (!force && key === this._planKey && !moved) return;
    clearTimeout(this._planTimer);
    this._planTimer = setTimeout(() => this._planPreload(), this._planKey ? 300 : 900);
  }

  _planPreload() {
    this._planTimer = 0;
    const b = this._bounds();
    if (!b || !this.isConnected || this._t === null) return;
    this._planKey = `${this._day}|${this._rev}`;
    this._planT = this._t;
    const dayItems = this._tracks.map((items) => itemsBetween(items, b.start, b.end));
    const entries = [];
    for (const it of preloadOrder(dayItems, this._t)) {
      const url = this._previewFor(it.src);
      if (url) entries.push({ src: it.src, url });
    }
    if (!this._preloader) {
      this._preloader = new ThumbPreloader({
        concurrency: PRELOAD_CONCURRENCY,
        onResult: (entry, ok) => {
          if (!ok) this._onPreviewError(entry.src);
        },
      });
    }
    this._preloader.setQueue(entries);
  }

  _onPreviewError(src) {
    if (this._failed.has(src)) return;
    this._failed.add(src);
    this.requestUpdate();
  }

  // ── navigation and the full view ────────────────────────────────────

  /** "Open camera": the camera's page, opened on this exact file and moment when its gallery has a `url_id`. */
  _openCamera(cam, item) {
    let path = cam?.navigation_path;
    if (!path) return;
    const id = typeof cam.gallery_id === "string" ? cam.gallery_id.trim() : "";
    if (id && item) {
      const q = new URLSearchParams({
        cgc_id: id,
        cgc_view: "gallery",
        cgc_src: item.src,
        cgc_time: String(item.ms),
      });
      path += (path.includes("?") ? "&" : "?") + q.toString();
    }
    this._overlay = null;
    this._navigate(path);
  }

  _navigate(path) {
    if (!path) return;
    window.history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  _openCalendar() {
    this._pause();
    this._calMonth = monthOf(this._day);
    this._calOpen = true;
  }

  // ── render ───────────────────────────────────────────────────────────

  willUpdate() {
    if (this.config && this._day && this._t === null) this._setDay(this._day);
  }

  render() {
    if (!this.config) return html``;
    const b = this._bounds();
    const locale = this._hass?.locale;
    if (!b || !this._tracks.some((items) => items.length)) {
      return html`<ha-card
        ><div class="tl-root">
          <div class="tl-empty-all">No clips for these cameras yet.</div>
        </div></ha-card
      >`;
    }
    const t = this._t;
    const ppm = this._ppm();
    const half = this._half;

    return html`
      <ha-card>
        <div class="tl-root">
          <div class="tl-head">
            <div class="tl-date">
              <button
                class="tl-btn icon"
                ?disabled=${!this._neighbourDay(-1)}
                @click=${() => this._stepDay(-1)}
                title="Previous day"
                aria-label="Previous day"
              >
                <ha-icon icon="mdi:chevron-left"></ha-icon>
              </button>
              <button
                class="tl-btn tl-day"
                @click=${() => this._openCalendar()}
                title="Pick a date"
              >
                <ha-icon icon="mdi:calendar-month-outline"></ha-icon>${formatDay(this._day, locale)}
              </button>
              <button
                class="tl-btn icon"
                ?disabled=${!this._neighbourDay(1)}
                @click=${() => this._stepDay(1)}
                title="Next day"
                aria-label="Next day"
              >
                <ha-icon icon="mdi:chevron-right"></ha-icon>
              </button>
            </div>
            <div class="tl-time" aria-live="off">${formatTimeFromMs(t, locale)}</div>
            <div class="tl-ctrls">
              <button
                class="tl-btn icon ${this._playing ? "on" : ""}"
                @click=${() => this._togglePlay()}
                title=${this._playing ? "Pause" : "Play"}
                aria-label=${this._playing ? "Pause" : "Play"}
              >
                <ha-icon icon=${this._playing ? "mdi:pause" : "mdi:play"}></ha-icon>
              </button>
              <button
                class="tl-btn tl-speed"
                @click=${() => this._cycleSpeed()}
                title="Playback speed"
              >
                ${SPEED_LABELS[this._speedIdx]}
              </button>
              <button
                class="tl-btn icon"
                ?disabled=${this._zoom <= 0}
                @click=${() => this._zoomBy(-1)}
                title="Zoom out"
                aria-label="Zoom out"
              >
                <ha-icon icon="mdi:magnify-minus-outline"></ha-icon>
              </button>
              <button
                class="tl-btn icon"
                ?disabled=${this._zoom >= ZOOM_LEVELS.length - 1}
                @click=${() => this._zoomBy(1)}
                title="Zoom in"
                aria-label="Zoom in"
              >
                <ha-icon icon="mdi:magnify-plus-outline"></ha-icon>
              </button>
              <button class="tl-btn tl-now" @click=${() => this._goNow()} title="Now">Now</button>
            </div>
          </div>

          <div class="tl-grid">
            ${this.config.cameras.map((cam, ci) => this._renderTile(cam, ci, t, b))}
          </div>

          <div class="tl-track-wrap">
            <div class="tl-playhead"></div>
            <div
              class="tl-scroll"
              @scroll=${() => this._onScroll()}
              @pointerdown=${(e) => this._onPointerDown(e)}
              @pointermove=${(e) => this._onPointerMove(e)}
              @pointerup=${(e) => this._onPointerUp(e)}
              @pointercancel=${(e) => this._onPointerUp(e)}
              @touchstart=${{ handleEvent: () => this._onUserTrack(), passive: true }}
              @wheel=${(e) => this._onWheel(e)}
            >
              ${guard([this._day, this._zoom, this._rev, half, Math.floor(b.last / 60_000)], () =>
                this._renderTrack(b, ppm, half)
              )}
            </div>
          </div>
        </div>
        ${this._overlay ? this._renderOverlay() : ""}
        ${this._calOpen
          ? renderCalendarPicker({
              days: this._days,
              month: this._calMonth,
              selected: this._day,
              locale,
              onMonth: (m) => (this._calMonth = m),
              onPick: (day) => {
                this._calOpen = false;
                this._userMoved = true;
                this._setDay(day);
              },
              onClose: () => (this._calOpen = false),
            })
          : ""}
      </ha-card>
    `;
  }

  _renderTile(cam, ci, t, b) {
    const items = this._tracks[ci] ?? [];
    const idx = itemAtOrBefore(items, t);
    const item = idx >= 0 && items[idx].ms >= b.start ? items[idx] : null;
    const name = cam.name || cam.entity;
    if (!item) {
      return html`<button class="tl-tile empty" title=${name} disabled>
        <div class="tl-empty">No clips yet</div>
        <div class="tl-label top">${name}</div>
      </button>`;
    }
    const url = this._tileUrl(item);
    const age = t - item.ms;
    const stale = age > STALE_MS;
    const under = this._lastFrame.get(ci);
    const locale = this._hass?.locale;
    const icon = KIND_ICON[item.kind];
    return html`<button
      class="tl-tile ${stale ? "stale" : ""}"
      title=${name}
      @click=${() => {
        this._pause();
        // t: the moment on the track, where NVR playback starts (BL-008).
        this._overlay = { ci, item, t, nvr: null };
      }}
    >
      ${url
        ? html`<img
            class="tl-img"
            src=${url}
            alt=""
            style=${under && under !== url ? `background-image:url("${under}")` : ""}
            @load=${() => this._lastFrame.set(ci, url)}
            @error=${() => this._onPreviewError(item.src)}
          />`
        : html`<div class="tl-empty"><ha-icon icon="mdi:filmstrip"></ha-icon></div>`}
      <div class="tl-label top">${name}</div>
      <div class="tl-label bottom">
        <span
          >${formatTimeFromMs(item.ms, locale)} <span class="tl-age">${ageLabel(age)}</span></span
        >
        ${icon ? html`<ha-icon class="tl-kind" icon=${icon}></ha-icon>` : ""}
      </div>
    </button>`;
  }

  _renderOverlay() {
    const { ci, item, t, nvr } = this._overlay;
    const cam = this.config.cameras[ci];
    const preview = this._previewFor(item.src);
    const close = () => (this._overlay = null);
    const locale = this._hass?.locale;
    const channel = nvrChannelOf(cam?.nvr_channel);
    const setNvr = (stream) => (this._overlay = { ...this._overlay, nvr: stream });
    return html`
      <div class="tl-overlay-backdrop" @click=${close}></div>
      <div class="tl-overlay" role="dialog" aria-label=${cam?.name || cam?.entity || ""}>
        <div class="tl-overlay-head">
          <span
            >${cam?.name || cam?.entity} ·
            ${nvr
              ? `NVR from ${formatTimeFromMs(t, locale)}`
              : formatTimeFromMs(item.ms, locale)}</span
          >
          <span class="tl-overlay-actions">
            ${channel !== null
              ? NVR_STREAMS.map(
                  (s) =>
                    html`<button
                      class="tl-btn ${nvr === s ? "on" : ""}"
                      title=${nvr === s
                        ? "Back to the snapshot"
                        : s === "sub"
                          ? "Play the NVR recording from this moment (low resolution, starts fast)"
                          : "Play the NVR recording from this moment (high resolution, slower to start)"}
                      aria-pressed=${nvr === s ? "true" : "false"}
                      @click=${() => setNvr(nvr === s ? null : s)}
                    >
                      <ha-icon icon="mdi:filmstrip-box"></ha-icon>${NVR_STREAM_LABEL[s]}
                    </button>`
                )
              : ""}
            ${cam?.navigation_path
              ? html`<button class="tl-btn" @click=${() => this._openCamera(cam, item)}>
                  <ha-icon icon="mdi:cctv"></ha-icon>Open camera
                </button>`
              : ""}
            <button class="tl-btn icon" @click=${close} title="Close" aria-label="Close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </span>
        </div>
        ${nvr && channel !== null
          ? html`<div class="tl-overlay-nvr">
              <cgc-nvr-player
                .hass=${this._hass}
                .channel=${channel}
                .time=${Number.isFinite(t) ? t : item.ms}
                .stream=${nvr}
                .addon=${this.config.nvr_addon || DEFAULT_NVR_ADDON}
                .poster=${preview}
                .bare=${true}
                @nvr-close=${() => setNvr(null)}
                @nvr-stream=${(e) => setNvr(e.detail.stream)}
              ></cgc-nvr-player>
            </div>`
          : VIDEO_RE.test(item.src)
            ? html`<video
                class="tl-overlay-media"
                src=${item.src}
                poster=${preview}
                controls
                autoplay
                muted
                playsinline
              ></video>`
            : html`<img
                class="tl-overlay-media"
                src=${item.src}
                alt=""
                style=${preview ? `background-image:url("${preview}")` : ""}
              />`}
      </div>
    `;
  }

  updated() {
    const el = this._scroller();
    if (!el) return;
    if (!this._resizeObserver && typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => {
        const half = Math.round(el.clientWidth / 2);
        if (half !== this._half) {
          this._half = half;
          this._needsScrollSync = true;
        }
      });
      this._resizeObserver.observe(el);
    }
    const half = Math.round(el.clientWidth / 2);
    if (half && half !== this._half) {
      this._half = half;
      this._needsScrollSync = true;
      return;
    }
    if (this._needsScrollSync && this._t !== null) {
      const b = this._bounds();
      if (b) {
        el.scrollLeft = msToPx(this._t, b.start, this._ppm());
        this._syncedLeft = el.scrollLeft;
      }
      this._needsScrollSync = false;
    }
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, CameraTimelineCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TAG)) {
  window.customCards.push({
    type: TAG,
    name: "Camera Timeline Card",
    description: "Every camera on one timeline: drag the time and all cameras follow (owner fork).",
  });
}
