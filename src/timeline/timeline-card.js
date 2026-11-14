/**
 * camera-timeline-card (BL-007): every camera on one timeline.
 *
 * One shared moment drives a grid of cameras: each tile shows that camera's frame at or just before the moment
 * (its small preview, BL-006), with how old it is. Drag or flick the time track under the centre playhead, or
 * play it forward; pausing holds every camera on that moment.
 *
 * Tap a camera to open its page (its gallery card: the one viewer for snapshots, GIFs, clips and NVR recordings)
 * on the frame shown, at the moment on the track: Low / High there play from that moment, and a swipe goes on to
 * the next camera at the same moment. Back returns here, on the same moment.
 *
 * Zoom (owner 10-23): pinch the time track (or Ctrl + wheel, or the buttons) from the whole day on the screen to a
 * pixel a second; the moment stays under the playhead, and the phone remembers the zoom. Scrolling to either end
 * of the day goes on into the day before or after (the nearest with clips), as the camera pages' strips do.
 *
 * Config:
 *   type: custom:camera-timeline-card
 *   path_datetime_format: YYYYMMDD_HHmmss     # how times are read from the file names (required)
 *   thumbnail_folder: thumbs                  # previews next to the files (recommended)
 *   preload: true                             # load the day's previews around the moment in the background
 *   cameras:                                  # FileTrack-style sensors with a `fileList` attribute
 *     - entity: sensor.filetrack_front_right
 *       name: Front Right
 *       navigation_path: /main-dashboard/front-right   # the camera's page, opened by a tap on its tile
 *       gallery_id: front_right                         # that page's gallery card `url_id`: open it on this
 *                                                       # exact file (cgc_src) and moment (cgc_time)
 */

import { LitElement, html, svg } from "lit";
import { guard } from "lit/directives/guard.js";

import { monthOf } from "../data/calendar";
import { ThumbPreloader } from "../data/preload";
import { sidecarFolder, sidecarUrl } from "../data/sidecar";
import { OutsidePress, renderCalendarPicker } from "../ui/calendar-picker";
import { calendarPickerStyles } from "../ui/calendar-picker-styles";
import { formatDay, formatTimeFromMs } from "../util/locale";
import {
  ageLabel,
  buildTrack,
  dayBounds,
  dayKeyOf,
  daysWithItems,
  clampPpm,
  DEFAULT_PPM,
  fitPpm,
  hourMarks,
  itemAtOrBefore,
  itemsBetween,
  markStepMin,
  MAX_PPM,
  msToPx,
  preloadPlanOrder,
  pxToMs,
  ZOOM_STEP,
} from "./timeline-data";
import { EdgeFlip } from "../ui/edge-flip";
import { canOpenReolinkApp, openReolinkApp } from "../ui/reolink-app";
import { timelineStyles } from "./timeline-styles";

const TAG = "camera-timeline-card";
/** Playback speeds: seconds of footage per real second. */
export const TIMELINE_SPEEDS = [60, 300, 900];
const SPEED_LABELS = ["1 min/s", "5 min/s", "15 min/s"];
/** A frame older than this at the moment shown is dimmed. */
const STALE_MS = 30 * 60_000;
/** Re-plan the preloading when the moment moves this far from the last plan. */
const REPLAN_MS = 45 * 60_000;
// The browser fetches at most 6 at a time from one server; the tiles' own pictures still go first (high priority).
const PRELOAD_CONCURRENCY = 6;
/** The neighbour days' previews (owner 11-13): this far into each from where a day change lands, */
const NEIGHBOUR_SPAN_MS = 8 * 3600_000;
/** loading right after the previews this near the moment (the way the viewer is heading; 4x later the other way). */
const LANDING_OFFSET_MS = 15 * 60_000;
/** A moment change this big tells which way the viewer is moving (a finger's jitter doesn't). */
const DIR_MIN_MS = 60_000;
/** The moment is moving (a drag, a fling, play) until it rests this long. */
const MOVE_REST_MS = 150;
const VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i;

const KIND_ICON = {
  person: "mdi:walk",
  car: "mdi:car",
  dog: "mdi:dog-side",
  visitor: "mdi:doorbell",
};
const MARK_KINDS = new Set(["person", "car", "dog", "visitor", "motion"]);
/** The zoom, kept on the device. */
const PPM_KEY = "cgc-timeline-ppm";
/** Gone on into the next / previous day: land this far inside it, so turning back doesn't return at once. */
const EDGE_LAND_MS = 60_000;
/** The track counts as at rest this long after its last scroll, with no finger on it. */
const SETTLE_MS = 250;
const DAY_MS = 86_400_000;

function loadPpm() {
  try {
    const v = Number(globalThis.localStorage?.getItem(PPM_KEY));
    return v > 0 ? v : DEFAULT_PPM;
  } catch {
    return DEFAULT_PPM;
  }
}

export class CameraTimelineCard extends LitElement {
  static get properties() {
    return {
      _t: { state: true },
      _day: { state: true },
      _playing: { state: true },
      _speedIdx: { state: true },
      _calOpen: { state: true },
      _calMonth: { state: true },
      _half: { state: true },
      _rev: { state: true },
      _appError: { state: true },
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
    this._dir = -1; // which way the viewer last moved: -1 back in time, +1 forward
    this._ppmV = loadPpm(); // the asked zoom; `_ppm()` is it within what the track allows
    this._pinch = null; // { d0, p0 } while two fingers pinch the track
    this._touching = false;
    this._settleTimer = 0;
    this._edge = new EdgeFlip({ onEdge: (side) => this._flipDay(side) });
    this._playing = false;
    this._speedIdx = 0;
    this._calOpen = false;
    this._calMonth = "";
    // A press anywhere outside the open calendar closes it.
    this._calOutside = new OutsidePress(
      () => this.renderRoot,
      () => (this._calOpen = false)
    );
    this._half = 0;
    this._rev = 0;
    this._appError = "";
    this._needsScrollSync = true;
    this._scrollRaf = 0;
    this._playRaf = 0;
    this._failed = new Set();
    this._lastFrame = new Map(); // tile -> the picture it has loaded (a tile shows no other picture)
    this._broken = new Set(); // pictures that didn't load: "Picture missing", not a spinner
    this._seen = new Set(); // pictures the tiles have loaded
    this._moving = false;
    this._moveTimer = 0;
    this._lastSetAt = 0;
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
      ...config,
      cameras: cams,
    };
    this._refs = new Map();
    this._tracks = [];
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
    this._calOutside.stop();
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._pause();
    if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf);
    this._scrollRaf = 0;
    clearTimeout(this._planTimer);
    this._planTimer = 0; // a reconnect plans again (_schedulePreload waits for a pending one)
    clearTimeout(this._settleTimer);
    clearTimeout(this._moveTimer);
    this._moveTimer = 0;
    this._moving = false;
    this._pinch = null;
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
    let changed = this._tracks.length !== this.config.cameras.length;
    this._tracks = this.config.cameras.map((c, index) => {
      const ref = this._hass?.states?.[c.entity]?.attributes?.fileList;
      if (this._refs.has(c.entity) && this._refs.get(c.entity) === ref && this._tracks[index])
        return this._tracks[index];
      changed = true;
      this._refs.set(c.entity, ref);
      return buildTrack(ref, fmt, this._tracks[index]);
    });
    if (!changed) return;
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

  /** Pixels per minute that show the whole day on the track. */
  _fit() {
    const b = dayBounds(this._day);
    return fitPpm(2 * this._half, b ? b.end - b.start : DAY_MS);
  }

  _ppm() {
    return clampPpm(this._ppmV, this._fit());
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
    const before = this._t;
    this._t = Math.min(Math.max(t, b.start), b.last);
    if (before !== null && Math.abs(this._t - before) >= DIR_MIN_MS) this._dir = this._t > before ? 1 : -1;
    if (before !== null && this._t !== before) {
      // Moving = moment changes in quick succession (a drag, a fling, play); one jump fetches at once.
      const now = Date.now();
      if (now - this._lastSetAt < MOVE_REST_MS) this._markMoving();
      this._lastSetAt = now;
    }
    if (scroll) this._needsScrollSync = true;
    this._schedulePreload(false);
  }

  /** While the moment moves, tiles ask for no picture of their own (owner 11-13: a drag asked for every picture it
   * passed and dropped most of them half-way, which costs the phone its connections); the preloader, ahead of the
   * drag, fetches. When the moment rests, each tile asks for its picture. */
  _markMoving() {
    this._moving = true;
    clearTimeout(this._moveTimer);
    this._moveTimer = setTimeout(() => {
      this._moveTimer = 0;
      this._moving = false;
      this.requestUpdate();
    }, MOVE_REST_MS);
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
    this._dir = delta < 0 ? -1 : 1;
    this._setDay(next);
  }

  _goNow() {
    this._userMoved = false;
    this._pause();
    this._setDay(dayKeyOf(Date.now()));
  }

  _zoomBy(delta) {
    this._zoomTo(this._ppm() * (delta > 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
  }

  /** Zoom to `ppm` (kept within the track's range), the moment staying under the playhead. Only the track's CSS
   * variable and scroll change (smooth while pinching); `commit` re-renders and keeps the zoom on the device. */
  _zoomTo(ppm, { commit = true } = {}) {
    const before = this._ppm();
    const next = clampPpm(ppm, this._fit());
    if (Math.abs(next - before) > 1e-9) {
      this._ppmV = next;
      const el = this._scroller();
      const b = this._bounds();
      if (el) {
        el.style.setProperty("--tl-ppm", String(next));
        if (b && this._t !== null) {
          el.scrollLeft = msToPx(this._t, b.start, next);
          this._syncedLeft = el.scrollLeft;
        }
      }
      if (!commit && markStepMin(next) !== markStepMin(before)) this.requestUpdate(); // new labels
    }
    if (commit) {
      this._savePpm();
      this.requestUpdate();
    }
  }

  _savePpm() {
    try {
      globalThis.localStorage?.setItem(PPM_KEY, String(this._ppmV));
    } catch {
      /* private mode: the zoom isn't kept */
    }
  }

  /** The user scrolled to the start (-1) or end (1) of the day: on into the day before or after, near its other
   * end. False when there is no such day with clips. */
  _flipDay(side) {
    const next = this._neighbourDay(side);
    const nb = next ? dayBounds(next) : null;
    if (!nb) return false;
    this._userMoved = true;
    this._pause();
    this._dir = side < 0 ? -1 : 1;
    this._setDay(next, side < 0 ? nb.end - 1000 - EDGE_LAND_MS : nb.start + EDGE_LAND_MS);
    return true;
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
      if (!el || !b || this._needsScrollSync || this._playing || this._pinch) return;
      if (this._syncedLeft !== null && Math.abs(el.scrollLeft - this._syncedLeft) < 1) return;
      this._syncedLeft = null;
      this._userMoved = true;
      this._setT(pxToMs(el.scrollLeft, b.start, this._ppm()));
      this._edge.scrolled(el);
      this._armSettle();
    });
  }

  /** The track at rest (no finger, no scroll for a moment): a day change may happen again. */
  _armSettle() {
    clearTimeout(this._settleTimer);
    this._settleTimer = setTimeout(() => {
      if (!this._touching) this._edge.release();
    }, SETTLE_MS);
  }

  _onTouchStart(e) {
    this._onUserTrack();
    this._touching = true;
    clearTimeout(this._settleTimer);
    const el = this._scroller();
    const ts = e.touches;
    if (ts?.length >= 2) {
      const d = Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
      this._pinch = { d0: d || 1, p0: this._ppm() };
      this._edge.touchEnd();
    } else if (ts?.length === 1 && el) {
      this._edge.touchStart(ts[0].clientX, el);
    }
  }

  _onTouchMove(e) {
    const ts = e.touches;
    if (this._pinch && ts?.length >= 2) {
      if (e.cancelable) e.preventDefault(); // the fingers zoom; the track doesn't pan
      const d = Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
      this._zoomTo((this._pinch.p0 * d) / this._pinch.d0, { commit: false });
      return;
    }
    const el = this._scroller();
    if (!this._pinch && ts?.length === 1 && el) this._edge.touchMove(ts[0].clientX, el);
  }

  _onTouchEnd(e) {
    const left = e.touches?.length ?? 0;
    if (this._pinch && left < 2) {
      this._pinch = null;
      this._zoomTo(this._ppmV);
    }
    if (!left) {
      this._touching = false;
      this._edge.touchEnd();
      this._armSettle();
    }
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
    if (!el) return;
    if (e.ctrlKey) {
      // A trackpad pinch (or Ctrl + wheel) zooms.
      e.preventDefault();
      this._zoomTo(this._ppm() * Math.exp(-e.deltaY * 0.01));
      return;
    }
    const vertical = Math.abs(e.deltaY) > Math.abs(e.deltaX);
    this._edge.wheel(vertical ? e.deltaY : e.deltaX, el);
    this._armSettle();
    if (!vertical) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }

  /** The track at the zoom in the scroller's CSS variables (--tl-ppm px a minute, --tl-half px before the day),
   * so zooming moves it without rendering it again; only the labels change with the zoom (markStepMin). */
  _renderTrack(b, ppm) {
    const min = (ms) => ((ms - b.start) / 60_000).toFixed(4);
    const x = (ms, dx = 0) =>
      `calc((var(--tl-half) + ${min(ms)} * var(--tl-ppm)) * 1px${dx ? ` - ${-dx}px` : ""})`;
    const marks = hourMarks(b.start, b.end, ppm).filter((m) => m.ms <= b.last);
    const locale = this._hass?.locale;
    const laneStep = "calc(var(--tl-lane-h) + 2px)";
    const lanes = this._tracks.map((items) =>
      itemsBetween(items, b.start, b.end).filter((it) => MARK_KINDS.has(it.kind))
    );
    return html`
      <div
        class="tl-track"
        style="width:calc((${min(
          b.last
        )} * var(--tl-ppm) + 2 * var(--tl-half)) * 1px);--tl-lanes:${lanes.length}"
      >
        ${marks.map(
          (m) =>
            html`<div class="tl-hour ${m.major ? "major" : ""}" style="left:${x(m.ms)}">
              <span>${formatTimeFromMs(m.ms, locale)}</span>
            </div>`
        )}
        ${b.last < b.end - 1000
          ? html`<div class="tl-now-edge" style="left:${x(b.last)}" title="Now"></div>`
          : ""}
        ${lanes.map((items, ci) => {
          // One path per kind of event, in minutes of the day stretched by the zoom (owner 11-13: an element per
          // mark, ~1,500 a day, made every day change ~0.2 s slower).
          const paths = new Map();
          for (const it of items) paths.set(it.kind, (paths.get(it.kind) ?? "") + `M${min(it.ms)} 0.21V0.79`);
          return html`<svg
            class="tl-lane"
            style="top:calc(30px + ${ci} * ${laneStep})"
            viewBox="0 0 1440 1"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            ${[...paths].map(([kind, d]) => svg`<path class="tl-mark k-${kind}" d=${d}></path>`)}
          </svg>`;
        })}
      </div>
    `;
  }

  // ── preloading ───────────────────────────────────────────────────────

  _preloadOn() {
    return !!this.config?.preload && !!sidecarFolder(this.config?.thumbnail_folder);
  }

  _schedulePreload(force) {
    if (!this._preloadOn()) return;
    const key = `${this._day}|${this._rev}|${this._dir}`;
    const moved = this._planT === null || Math.abs((this._t ?? 0) - this._planT) > REPLAN_MS;
    if (!force && key === this._planKey && !moved) return;
    if (force) {
      clearTimeout(this._planTimer);
      this._planTimer = 0;
    }
    // A plan already coming reads the latest moment: a drag re-plans as it goes, not only once it stops.
    if (this._planTimer) return;
    this._planTimer = setTimeout(() => this._planPreload(), !this._planKey ? 900 : force ? 100 : 300);
  }

  /** The days next to the shown one, from where a day change lands: the day before from its end (the previous-day
   * arrow and a drag past the track's start land there), the day after from its start (a drag past the end) and its
   * end (the next-day arrow). */
  _preloadNeighbours() {
    const out = [];
    const offset = (side) => (side === this._dir ? 1 : 4) * LANDING_OFFSET_MS;
    const day = (d) => {
      const b = d ? dayBounds(d) : null;
      return b ? { b, dayItems: this._tracks.map((items) => itemsBetween(items, b.start, b.end)) } : null;
    };
    const prev = day(this._neighbourDay(-1));
    if (prev) {
      out.push({ dayItems: prev.dayItems, landing: prev.b.end - 1000, inward: -1, spanMs: NEIGHBOUR_SPAN_MS, offsetMs: offset(-1) });
    }
    const next = day(this._neighbourDay(1));
    if (next) {
      out.push({ dayItems: next.dayItems, landing: next.b.start + EDGE_LAND_MS, inward: 1, spanMs: NEIGHBOUR_SPAN_MS, offsetMs: offset(1) });
      out.push({ dayItems: next.dayItems, landing: next.b.end - 1000, inward: -1, spanMs: 3600_000, offsetMs: offset(1) });
    }
    return out;
  }

  _planPreload() {
    this._planTimer = 0;
    const b = this._bounds();
    if (!b || !this.isConnected || this._t === null) return;
    this._planKey = `${this._day}|${this._rev}|${this._dir}`;
    this._planT = this._t;
    const dayItems = this._tracks.map((items) => itemsBetween(items, b.start, b.end));
    const entries = [];
    for (const it of preloadPlanOrder(dayItems, this._t, this._dir, this._preloadNeighbours())) {
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

  _onTileLoad(ci, url) {
    if (url) this._seen.add(url);
    if (!url || this._lastFrame.get(ci) === url) return;
    this._lastFrame.set(ci, url);
    this.requestUpdate();
  }

  /** A tile's picture failed: its preview falls back to the file itself; the file itself is missing. */
  _onTileError(src, url) {
    if (url !== src) {
      this._onPreviewError(src);
      return;
    }
    if (this._broken.has(url)) return;
    this._broken.add(url);
    this.requestUpdate();
  }

  // ── opening a camera ────────────────────────────────────────────────

  /** A tap on a camera: its page, on the frame shown (`cgc_src`, when its gallery has a `url_id`) at the moment on
   * the track (`cgc_time`: where Low / High start and what a swipe carries on). Returns whether it went. */
  _openCamera(cam, item, t) {
    let path = typeof cam?.navigation_path === "string" ? cam.navigation_path.trim() : "";
    if (!path) return false;
    const id = typeof cam.gallery_id === "string" ? cam.gallery_id.trim() : "";
    if (id && item) {
      const q = new URLSearchParams({
        cgc_id: id,
        cgc_view: "gallery",
        cgc_src: item.src,
        cgc_time: String(Math.round(Number.isFinite(t) ? Math.max(t, item.ms) : item.ms)),
      });
      path += (path.includes("?") ? "&" : "?") + q.toString();
    }
    this._navigate(path);
    return true;
  }

  /** As Home Assistant's own navigate: the new entry remembers the page it came `from`, which HA's back arrow
   * needs to go back here (without it, the arrow goes to the dashboard's first view). */
  _navigate(path) {
    if (!path) return;
    window.history.pushState({ from: window.location.pathname }, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  _openCalendar() {
    this._pause();
    this._calMonth = monthOf(this._day);
    this._calOpen = true;
  }

  /** Opens the Reolink app at `ms`: the time of the picture the camera's tile shows (owner 11-08). */
  async _openReolink(cam, ms) {
    this._pause();
    this._appError = "";
    try {
      await openReolinkApp(this._hass, cam.reolink_app_entity, cam.nvr_channel, ms);
    } catch (err) {
      this._appError = err instanceof Error ? err.message : "Could not open Reolink.";
    }
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
          ${this._appError ? html`<div role="alert">${this._appError}</div>` : ""}
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
                ?disabled=${ppm <= this._fit() + 1e-6}
                @click=${() => this._zoomBy(-1)}
                title="Zoom out"
                aria-label="Zoom out"
              >
                <ha-icon icon="mdi:magnify-minus-outline"></ha-icon>
              </button>
              <button
                class="tl-btn icon"
                ?disabled=${ppm >= MAX_PPM - 1e-6}
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
              style="--tl-ppm:${ppm};--tl-half:${half}"
              @scroll=${() => this._onScroll()}
              @pointerdown=${(e) => this._onPointerDown(e)}
              @pointermove=${(e) => this._onPointerMove(e)}
              @pointerup=${(e) => this._onPointerUp(e)}
              @pointercancel=${(e) => this._onPointerUp(e)}
              @touchstart=${{ handleEvent: (e) => this._onTouchStart(e), passive: true }}
              @touchmove=${{ handleEvent: (e) => this._onTouchMove(e), passive: false }}
              @touchend=${{ handleEvent: (e) => this._onTouchEnd(e), passive: true }}
              @touchcancel=${{ handleEvent: (e) => this._onTouchEnd(e), passive: true }}
              @wheel=${(e) => this._onWheel(e)}
            >
              ${guard([this._day, markStepMin(ppm), this._rev, Math.floor(b.last / 60_000)], () =>
                this._renderTrack(b, ppm)
              )}
            </div>
          </div>
        </div>
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
    // Until its own picture has loaded, a tile shows a spinner, never the previous camera picture (owner 11-13).
    const ready = !!url && this._lastFrame.get(ci) === url;
    // Moving: only a picture already here is shown; the others wait for the moment to rest (see _markMoving).
    const hold =
      !!url && !ready && this._moving && this._preloadOn() && !this._seen.has(url) && !this._preloader?.has(url);
    const locale = this._hass?.locale;
    const icon = KIND_ICON[item.kind];
    return html`<div class="tl-camera"><button
      class="tl-tile ${stale ? "stale" : ""}"
      title=${cam.navigation_path ? `Open ${name}` : name}
      @click=${() => {
        this._pause();
        this._openCamera(cam, item, t);
      }}
    >
      ${url && this._broken.has(url)
        ? html`<div class="tl-empty">Picture missing</div>`
        : hold
          ? html`<div class="tl-spin" role="progressbar" aria-label="Loading the picture"></div>`
          : url
          ? html`<img
                class="tl-img ${ready ? "" : "loading"}"
                src=${url}
                alt=""
                decoding="async"
                fetchpriority="high"
                @load=${(e) => this._onTileLoad(ci, e.target.getAttribute("src"))}
                @error=${() => this._onTileError(item.src, url)}
              />${ready
                ? ""
                : html`<div class="tl-spin" role="progressbar" aria-label="Loading the picture"></div>`}`
          : html`<div class="tl-empty"><ha-icon icon="mdi:filmstrip"></ha-icon></div>`}
      <div class="tl-label top">${name}</div>
      <div class="tl-label bottom">
        <span
          >${formatTimeFromMs(item.ms, locale)} <span class="tl-age">${ageLabel(age)}</span></span
        >
        ${icon ? html`<ha-icon class="tl-kind" icon=${icon}></ha-icon>` : ""}
      </div>
    </button>
    ${canOpenReolinkApp(cam.reolink_app_entity, cam.nvr_channel)
      ? html`<button class="tl-app tl-btn icon" title="Open this picture's time in Reolink"
          aria-label="Open this picture's time in Reolink" @click=${() => this._openReolink(cam, item.ms)}>
          <ha-icon icon="mdi:open-in-app"></ha-icon>
        </button>`
      : ""}
    </div>`;
  }

  updated() {
    this._calOutside.sync(this._calOpen);
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
