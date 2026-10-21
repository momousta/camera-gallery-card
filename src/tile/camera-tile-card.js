/**
 * camera-tile-card (owner fork, 10-21): one camera's live picture for the Cameras page, in the same design as the
 * gallery and the NVR player: the name at the top left, a chip while something is detected, the floodlight and
 * siren buttons at the bottom left (ui/camera-actions, the very code the gallery uses), full screen at the bottom
 * right. A tap on the picture opens the camera's page (its gallery: snapshots, recordings, swipes).
 *
 * Full screen covers the window over the document's full screen, as the gallery's player does (docfs): turned to
 * landscape on a portrait screen for a landscape camera, controls that hide and come back on a tap, a double tap or
 * a pinch zooms, one finger pans the zoomed picture, and a swipe moves to the page's next / previous tile, full
 * screen too.
 *
 * Config:
 *   type: custom:camera-tile-card
 *   entity: camera.front_right_sub          # the live stream (Home Assistant's own player)
 *   name: Front Right
 *   navigation_path: /main-dashboard/front-right
 *   aspect_ratio: "16:9"                    # the tile's shape, W:H ("9:16" for a camera on its side, "8:3" …)
 *   fit: contain                            # contain (whole picture, default) or cover
 *   live: true                              # false: a still refreshed every 10 s (a battery doorbell)
 *   floodlight_entity: light.front_right_floodlight
 *   siren_entity: siren.front_right_siren
 *   siren_duration: 10
 *   detections:                             # a chip while one is on
 *     - entity: binary_sensor.front_right_person
 *       label: Person
 */

import { LitElement, css, html } from "lit";

import {
  CameraActionController,
  cameraActionStyles,
  renderCameraActions,
} from "../ui/camera-actions";
import { injectLiveFillStyle } from "../ui/live-fill-style";
import { portraitScreen, turnFromMotion, unturn } from "../util/landscape";

const TAG = "camera-tile-card";
const STILL_REFRESH_MS = 10_000;
const UI_HIDE_MS = 1800;
const TAP_MS = 300;
const MAX_ZOOM = 6;
const TAP_ZOOM = 2.5;
const SWIPE_MIN_PX = 50;

/** The page's tiles, in page order (full screen swipes from one to the next). */
const tiles = new Set();
/** Full screen handed from tile to tile on a swipe: the document's full screen stays on. */
const fs = { owner: null };

function docFsEl() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

async function enterDocFs() {
  const el = document.documentElement;
  if (docFsEl() === el) return true;
  if (docFsEl()) return false;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!request) return false;
  try {
    await request.call(el, { navigationUI: "hide" });
    return true;
  } catch {
    return false; // refused or not supported (an iPhone): the tile still covers the window
  }
}

function exitDocFs() {
  if (docFsEl() !== document.documentElement) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  try {
    Promise.resolve(exit?.call(document)).catch(() => {});
  } catch {
    /* already left */
  }
}

/** "16:9" → "16/9" (CSS aspect-ratio); anything else → "16/9". */
export function tileAspect(raw) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/.exec(String(raw ?? ""));
  return m && +m[1] > 0 && +m[2] > 0 ? `${m[1]}/${m[2]}` : "16/9";
}

function aspectValue(raw) {
  const [w, h] = tileAspect(raw).split("/").map(Number);
  return w / h;
}

export class CameraTileCard extends LitElement {
  static get properties() {
    return {
      _fs: { state: true },
      _ui: { state: true },
      _rot: { state: true },
      _zoom: { state: true },
      _still: { state: true },
    };
  }

  static get styles() {
    return [cameraActionStyles, tileStyles];
  }

  constructor() {
    super();
    this.config = null;
    this._hass = null;
    this._acts = new CameraActionController(this, (t) => this._toastSet(t));
    this._fs = false;
    this._docFsOn = false;
    this._ui = true;
    this._rot = 90;
    this._zoom = { s: 1, x: 0, y: 0 };
    this._still = "";
    this._player = null;
    this._ptrs = new Map();
    this._gest = null;
    this._lastTap = null;
    this._tapTimer = 0;
    this._hideTimer = 0;
    this._stillTimer = 0;
    this._toast = "";
    this._onFsChange = () => this._docFsChanged();
    this._onMotion = (e) => {
      const next = turnFromMotion(e?.accelerationIncludingGravity?.x, this._rot);
      if (next !== this._rot) this._rot = next;
    };
  }

  setConfig(config) {
    if (!config?.entity || typeof config.entity !== "string")
      throw new Error("camera-tile-card: set `entity` (a camera)");
    this.config = { fit: "contain", live: true, ...config };
    this._player = null;
  }

  getCardSize() {
    return 4;
  }

  set hass(hass) {
    const old = this._hass;
    this._hass = hass;
    if (this._player) this._player.hass = hass;
    const c = this.config;
    if (!c) return;
    const ids = [
      c.entity,
      c.floodlight_entity,
      c.siren_entity,
      ...(c.detections || []).map((d) => d?.entity),
    ];
    if (!old || ids.some((id) => id && old.states?.[id] !== hass.states?.[id])) {
      if (this._player && hass.states?.[c.entity] !== old?.states?.[c.entity])
        this._player.stateObj = hass.states?.[c.entity];
      this.requestUpdate();
    }
    if (!old && this.hasUpdated) this._mount();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    super.connectedCallback();
    tiles.add(this);
    document.addEventListener("fullscreenchange", this._onFsChange);
    document.addEventListener("webkitfullscreenchange", this._onFsChange);
    if (this.hasUpdated) this._mount();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    tiles.delete(this);
    document.removeEventListener("fullscreenchange", this._onFsChange);
    document.removeEventListener("webkitfullscreenchange", this._onFsChange);
    this._acts.stop();
    clearTimeout(this._hideTimer);
    clearTimeout(this._tapTimer);
    clearInterval(this._stillTimer);
    this._stillTimer = 0;
    if (this._fs) {
      if (fs.owner === this) {
        fs.owner = null;
        if (this._docFsOn) exitDocFs();
      }
      this._leave();
    }
    // The stream stops with the page (HA's player releases it when removed).
    this._player?.remove();
    this._player = null;
  }

  firstUpdated() {
    this._mount();
  }

  // ── the picture ─────────────────────────────────────────────────────

  async _mount() {
    if (!this.config || !this._hass) return;
    if (this.config.live === false) {
      this._refreshStill();
      clearInterval(this._stillTimer);
      this._stillTimer = setInterval(() => this._refreshStill(), STILL_REFRESH_MS);
      return;
    }
    if (this._player?.isConnected || this._mounting) return;
    this._mounting = true;
    try {
      await this._ensurePlayerDefined();
      const host = this.renderRoot?.querySelector(".stream");
      if (!host || !this.isConnected || this._player?.isConnected) return;
      const p = document.createElement("ha-camera-stream");
      p.hass = this._hass;
      p.stateObj = this._hass.states?.[this.config.entity];
      p.muted = true;
      p.controls = false;
      p.style.cssText = "display:block;width:100%;height:100%;margin:0;";
      host.replaceChildren(p);
      injectLiveFillStyle(p, this.config.fit === "cover" ? "cover" : "contain");
      this._player = p;
    } finally {
      this._mounting = false;
    }
  }

  /** Home Assistant loads its camera player with its picture cards; this page may have none, so make one load it. */
  async _ensurePlayerDefined() {
    if (customElements.get("ha-camera-stream")) return;
    try {
      const helpers = await window.loadCardHelpers?.();
      const card = await helpers?.createCardElement?.({
        type: "picture-entity",
        entity: this.config.entity,
        camera_view: "live",
      });
      if (card) {
        card.hass = this._hass;
        card.style.cssText =
          "position:fixed;left:-9999px;top:0;width:10px;height:10px;opacity:0;pointer-events:none;";
        document.body.appendChild(card);
        await Promise.race([
          customElements.whenDefined("ha-camera-stream"),
          new Promise((r) => setTimeout(r, 8000)),
        ]);
        card.remove();
      }
    } catch {
      /* the whenDefined below still waits */
    }
    await customElements.whenDefined("ha-camera-stream");
  }

  /** The camera's current still; the next one is loaded before it replaces the shown one (no blank flash). */
  _refreshStill() {
    const pic = this._hass?.states?.[this.config.entity]?.attributes?.entity_picture;
    if (!pic) return;
    const url = `${pic}${pic.includes("?") ? "&" : "?"}_t=${Date.now()}`;
    if (!this._still || typeof Image === "undefined") {
      this._still = url;
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (this.isConnected) this._still = url;
    };
    img.src = url;
  }

  // ── actions ─────────────────────────────────────────────────────────

  _toastSet(text) {
    this._toast = text;
    this.requestUpdate();
    setTimeout(() => {
      this._toast = "";
      this.requestUpdate();
    }, 4000);
  }

  /** The camera's page, as Home Assistant's own navigate (the entry knows where it came from: Back returns). */
  _open() {
    const path = this.config?.navigation_path;
    if (!path) return;
    window.history.pushState({ from: window.location.pathname }, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  // ── full screen ─────────────────────────────────────────────────────

  async _toggleFs() {
    if (this._fs) {
      if (fs.owner === this) fs.owner = null;
      if (this._docFsOn) exitDocFs();
      this._leave();
      return;
    }
    await this._enter();
  }

  /** Cover the window at once, then the document's full screen (kept when a swipe hands it to another tile). */
  async _enter({ handed = false } = {}) {
    for (const t of tiles) if (t !== this && t._fs) t._leave();
    fs.owner = this;
    this._fs = true;
    this._resetZoom();
    this._showUi();
    if (typeof window.DeviceMotionEvent !== "undefined")
      window.addEventListener("devicemotion", this._onMotion);
    this._docFsOn = handed ? !!docFsEl() : await enterDocFs();
    if (this._fs && this._docFsOn)
      screen.orientation?.lock?.(this._portrait() ? "portrait" : "landscape").catch(() => {});
  }

  _leave() {
    this._fs = false;
    this._docFsOn = false;
    this._resetZoom();
    window.removeEventListener("devicemotion", this._onMotion);
    try {
      screen.orientation?.unlock?.();
    } catch {
      /* nothing locked */
    }
  }

  _docFsChanged() {
    // The document left full screen (Back, Esc): so does the tile.
    if (this._fs && this._docFsOn && !docFsEl()) {
      if (fs.owner === this) fs.owner = null;
      this._leave();
    }
  }

  /** A camera taller than wide (its tile's shape). */
  _portrait() {
    return aspectValue(this.config?.aspect_ratio) < 1;
  }

  /** How far the picture is turned: full screen, a landscape camera on a portrait screen. */
  _turn() {
    return this._fs && portraitScreen() && !this._portrait() ? this._rot : 0;
  }

  /** A swipe in full screen: the page's next (1) / previous (-1) tile, full screen. */
  _swipe(dir) {
    const list = [...tiles]
      .filter((t) => t.isConnected)
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (list.length < 2) return;
    const i = list.indexOf(this);
    const next = list[(i + dir + list.length) % list.length];
    const docOn = this._docFsOn;
    fs.owner = null;
    this._leave();
    next._enter({ handed: docOn });
  }

  // ── gestures ────────────────────────────────────────────────────────

  _frame() {
    const stage = this.renderRoot?.querySelector(".stage");
    const r = stage?.getBoundingClientRect();
    if (!r) return null;
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      w: stage.offsetWidth || r.width,
      h: stage.offsetHeight || r.height,
    };
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

  _showUi() {
    this._ui = true;
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => {
      if (this._fs) this._ui = false;
    }, UI_HIDE_MS);
  }

  _down(e) {
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
    } else if (this._ptrs.size === 2 && this._fs) {
      const [a, b] = [...this._ptrs.values()];
      this._gest = {
        kind: "pinch",
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        z0: { ...this._zoom },
        m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      clearTimeout(this._tapTimer);
      this._lastTap = null;
    }
  }

  _move(e) {
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
      const s = Math.min(MAX_ZOOM, Math.max(1, g.z0.s * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0)));
      const [ux, uy] = unturn(g.m0.x - f.cx, g.m0.y - f.cy, turn);
      const lx = (ux - g.z0.x) / g.z0.s;
      const ly = (uy - g.z0.y) / g.z0.s;
      const [vx, vy] = unturn((a.x + b.x) / 2 - f.cx, (a.y + b.y) / 2 - f.cy, turn);
      this._setZoom(s, vx - s * lx, vy - s * ly);
    } else if (g.kind === "tap") {
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.moved && Math.hypot(dx, dy) > 10) g.moved = true;
      if (g.moved && this._fs && this._zoom.s > 1) {
        const [lx, ly] = unturn(dx, dy, this._turn());
        this._setZoom(this._zoom.s, g.pan.x + lx, g.pan.y + ly);
      }
    }
  }

  _up(e) {
    const g = this._gest;
    if (!this._ptrs.delete(e.pointerId) || !g) return;
    if (g.kind === "pinch") {
      if (!this._ptrs.size) this._gest = null;
      return;
    }
    if (!this._ptrs.size) this._gest = null;
    if (e.type === "pointercancel") return;
    if (g.moved) {
      // Full screen, not zoomed: a swipe along the picture goes to the next tile.
      if (!this._fs || this._zoom.s > 1) return;
      const f = this._frame();
      const [fx, fy] = unturn(e.clientX - g.x0, e.clientY - g.y0, this._turn());
      if (Math.abs(fx) >= Math.max(SWIPE_MIN_PX, (f?.w || 0) * 0.12) && Math.abs(fx) > Math.abs(fy))
        this._swipe(fx < 0 ? 1 : -1);
      return;
    }
    if (performance.now() - g.t0 > 500) return;
    if (!this._fs) {
      this._open(); // inline: the picture opens the camera's page
      return;
    }
    const now = performance.now();
    const last = this._lastTap;
    if (last && now - last.t < TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 80) {
      clearTimeout(this._tapTimer);
      this._lastTap = null;
      if (this._zoom.s > 1) this._resetZoom();
      else {
        const f = this._frame();
        if (f) {
          const [ux, uy] = unturn(e.clientX - f.cx, e.clientY - f.cy, this._turn());
          this._setZoom(TAP_ZOOM, ux - TAP_ZOOM * ux, uy - TAP_ZOOM * uy);
        }
      }
      return;
    }
    this._lastTap = { t: now, x: e.clientX, y: e.clientY };
    clearTimeout(this._tapTimer);
    this._tapTimer = setTimeout(() => {
      this._lastTap = null;
      if (this._ui) {
        clearTimeout(this._hideTimer);
        this._ui = false;
      } else this._showUi();
    }, TAP_MS);
  }

  // ── render ──────────────────────────────────────────────────────────

  render() {
    const c = this.config;
    if (!c) return html``;
    const states = this._hass?.states || {};
    const cam = states[c.entity];
    const name = c.name || cam?.attributes?.friendly_name || c.entity;
    const detected = (c.detections || []).filter(
      (d) => d?.entity && states[d.entity]?.state === "on"
    );
    const shown = !this._fs || this._ui;
    const turn = this._turn();
    const z = this._zoom;
    const zoomed = z.s > 1;
    const unavailable = !!this._hass && (!cam || cam.state === "unavailable");
    return html`
      <ha-card class=${this._fs ? "fs" : ""}>
        <div
          class="tile ${this._fs ? "fs" : ""} ${turn ? "turned" : ""} ${zoomed ? "zoomed" : ""}"
          style="aspect-ratio:${tileAspect(c.aspect_ratio)};${turn ? `--tile-rot:${turn}deg;` : ""}"
        >
          <div class="stage">
            <div
              class="pic"
              style=${zoomed ? `transform:translate(${z.x}px,${z.y}px) scale(${z.s})` : ""}
            >
              ${c.live === false
                ? this._still
                  ? html`<img class="still" src=${this._still} alt="" draggable="false" />`
                  : ""
                : html`<div class="stream"></div>`}
            </div>
            <div
              class="tap"
              @pointerdown=${(e) => this._down(e)}
              @pointermove=${(e) => this._move(e)}
              @pointerup=${(e) => this._up(e)}
              @pointercancel=${(e) => this._up(e)}
            ></div>
            ${unavailable ? html`<div class="off">Camera unavailable</div>` : ""}
            <div class="name ${shown ? "" : "hidden"}">${name}</div>
            ${detected.length
              ? html`<div class="dets">
                  ${detected.map(
                    (d) =>
                      html`<span class="det"
                        ><ha-icon icon=${d.icon || "mdi:motion-sensor"}></ha-icon>${d.label ||
                        ""}</span
                      >`
                  )}
                </div>`
              : ""}
            ${renderCameraActions(
              this._acts.list(this._hass, c),
              (id) => {
                this._acts.press(id, this._hass, c);
                if (this._fs) this._showUi();
              },
              { visible: shown }
            )}
            <button
              class="fsbtn ${shown ? "visible" : ""}"
              title=${this._fs ? "Exit full screen" : "Full screen"}
              aria-label=${this._fs ? "Exit full screen" : "Full screen"}
              @pointerdown=${(e) => e.stopPropagation()}
              @pointerup=${(e) => e.stopPropagation()}
              @click=${(e) => {
                e.stopPropagation();
                this._toggleFs();
              }}
            >
              <ha-icon icon=${this._fs ? "mdi:fullscreen-exit" : "mdi:fullscreen"}></ha-icon>
            </button>
            ${this._toast ? html`<div class="toast" role="status">${this._toast}</div>` : ""}
          </div>
        </div>
      </ha-card>
    `;
  }
}

const tileStyles = css`
  :host {
    display: block;
  }
  ha-card {
    overflow: hidden;
    background: #000;
  }
  ha-card.fs {
    overflow: visible;
  }
  .tile {
    position: relative;
    width: 100%;
    background: #000;
    border-radius: var(--ha-card-border-radius, 12px);
    overflow: hidden;
  }
  /* Full screen: the tile covers the window (over the document's full screen); a landscape camera on a portrait
     screen is turned, as in the gallery's player. */
  .tile.fs {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    aspect-ratio: auto !important;
    border-radius: 0;
  }
  .stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .tile.turned .stage {
    inset: auto;
    top: 50%;
    left: 50%;
    width: 100vh;
    height: 100vw;
    transform: translate(-50%, -50%) rotate(var(--tile-rot, 90deg));
  }
  .pic {
    position: absolute;
    inset: 0;
    transform-origin: center center;
  }
  .stream,
  .still {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .still {
    object-fit: contain;
  }
  .tap {
    position: absolute;
    inset: 0;
    touch-action: pan-y;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  .tile.fs .tap,
  .tile.zoomed .tap {
    touch-action: none;
    cursor: default;
  }
  .name {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 11;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }
  .name.hidden {
    opacity: 0;
  }
  .dets {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 11;
    display: flex;
    gap: 6px;
    pointer-events: none;
  }
  .det {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 8px 3px 6px;
    border-radius: 999px;
    background: #e53935;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    --mdc-icon-size: 16px;
  }
  .off {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    pointer-events: none;
  }
  .fsbtn {
    position: absolute;
    right: 8px;
    bottom: 6px;
    z-index: 12;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
    --mdc-icon-size: 18px;
  }
  .fsbtn.visible {
    opacity: 1;
    pointer-events: auto;
  }
  .toast {
    position: absolute;
    left: 50%;
    bottom: 44px;
    z-index: 13;
    transform: translateX(-50%);
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(229, 57, 53, 0.9);
    color: #fff;
    font-size: 12px;
    white-space: nowrap;
  }
`;

if (!customElements.get(TAG)) customElements.define(TAG, CameraTileCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TAG)) {
  window.customCards.push({
    type: TAG,
    name: "Camera Tile Card",
    description:
      "One camera's live picture with floodlight / siren buttons and full screen, in the gallery's design (owner fork).",
  });
}
