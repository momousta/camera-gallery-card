/**
 * Drag-to-scrub for the thumbnail strip (issue #152, opt-in `scrub_on_drag`).
 *
 * Ring / iOS-Photos model: the strip moves under a fixed centre playhead and
 * the thumb under the playhead becomes the selected item while the user
 * drags (touch: native panning + momentum; mouse: drag-to-scroll; wheel).
 * The main viewer shows the cheap thumbnail while scrubbing and loads the
 * full clip only once the gesture settles (finger/button up and no scroll
 * for `settleMs`), so a fast drag doesn't start dozens of downloads.
 *
 * This module is DOM-free: the card feeds it pointer/touch/wheel/scroll
 * events and applies the returned scroll positions. A tap (press + release
 * without moving) is reported as such so the card's normal tap-to-select
 * path runs unchanged.
 */

export interface ScrubThumbSpan {
  index: number;
  /** Leading edge along the scroll axis (px, viewport coordinates). */
  start: number;
  /** Trailing edge along the scroll axis. */
  end: number;
}

/** Index of the thumb whose centre is nearest to `center`, or `null`. */
export function pickCenterIndex(spans: readonly ScrubThumbSpan[], center: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const s of spans) {
    const mid = (s.start + s.end) / 2;
    const d = Math.abs(mid - center);
    if (d < bestDist) {
      bestDist = d;
      best = s.index;
    }
  }
  return best;
}

export interface ScrubGestureOptions {
  /** Called once the gesture settles (load the full clip now). */
  onSettle: () => void;
  /** Idle time after the last scroll before settling. */
  settleMs?: number;
  /** Mouse movement before a press turns into a drag. */
  dragThresholdPx?: number;
  schedule?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (h: unknown) => void;
  };
}

export const SCRUB_SETTLE_MS = 160;
export const SCRUB_DRAG_THRESHOLD_PX = 6;

export class ScrubGesture {
  private readonly _onSettle: () => void;
  private readonly _settleMs: number;
  private readonly _threshold: number;
  private readonly _setTimeout: (fn: () => void, ms: number) => unknown;
  private readonly _clearTimeout: (h: unknown) => void;

  /** A user gesture owns the strip: scrolls now drive the selection. */
  private _active = false;
  /** Finger or button currently down on the strip. */
  private _down = false;
  private _pointerType = "";
  private _startPos = 0;
  private _startScroll = 0;
  private _dragging = false;
  private _moved = false;
  /** The browser took the touch over for native panning (pointercancel). */
  private _panned = false;
  private _settleTimer: unknown = null;

  constructor(opts: ScrubGestureOptions) {
    this._onSettle = opts.onSettle;
    this._settleMs = opts.settleMs ?? SCRUB_SETTLE_MS;
    this._threshold = opts.dragThresholdPx ?? SCRUB_DRAG_THRESHOLD_PX;
    this._setTimeout = opts.schedule?.setTimeout ?? ((fn, ms): unknown => setTimeout(fn, ms));
    this._clearTimeout =
      opts.schedule?.clearTimeout ??
      ((h): void => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** `true` while scrolls should move the selection. */
  get active(): boolean {
    return this._active;
  }

  /** `true` while a mouse drag is scrolling the strip (snap off, grabbing). */
  get dragging(): boolean {
    return this._dragging;
  }

  /** Press on the strip (any pointer type). */
  pointerDown(pointerType: string, pos: number, scrollPos: number): void {
    this._cancelSettle();
    this._active = true;
    this._down = true;
    this._pointerType = pointerType || "mouse";
    this._startPos = pos;
    this._startScroll = scrollPos;
    this._dragging = false;
    this._moved = false;
    this._panned = false;
  }

  /**
   * Pointer moved while pressed. For mouse/pen returns the scroll position
   * the strip should take (drag-to-scroll); touch scrolls natively, so it
   * returns `null`.
   */
  pointerMove(pos: number): number | null {
    if (!this._down) return null;
    const delta = pos - this._startPos;
    if (Math.abs(delta) > this._threshold) this._moved = true;
    if (this._pointerType !== "mouse") return null; // touch/pen pan natively
    if (!this._dragging && !this._moved) return null;
    this._dragging = true;
    return this._startScroll - delta;
  }

  /**
   * Release. `tap` = no movement: the card's click handler selects the
   * thumb as usual and the strip is no longer user-driven (so the smooth
   * re-centre that follows doesn't drag the selection along).
   * `suppressClick` = a mouse drag ended; swallow the click it would cause.
   */
  pointerUp(): { tap: boolean; suppressClick: boolean } {
    const wasDragging = this._dragging;
    // Touch/pen: getting a pointerup at all means the browser didn't pan.
    const tap =
      this._down &&
      !wasDragging &&
      !this._panned &&
      (this._pointerType !== "mouse" || !this._moved);
    this._down = false;
    this._dragging = false;
    if (tap) {
      this._active = false;
      this._cancelSettle();
      return { tap: true, suppressClick: false };
    }
    this._armSettle();
    return { tap: false, suppressClick: wasDragging };
  }

  /** The browser took over (touch panning started). The finger is still
   * down; `touchEnd()` reports the lift. */
  pointerCancel(): void {
    this._dragging = false;
    this._moved = true;
    this._panned = true;
  }

  /** Finger lifted after a native pan (touchend/touchcancel). */
  touchEnd(): void {
    if (!this._active) return;
    this._down = false;
    this._armSettle();
  }

  /** Wheel / trackpad scroll over the strip. */
  wheel(): void {
    this._active = true;
    this._armSettle();
  }

  /**
   * A scroll event happened. Returns `true` when it is user-driven and the
   * selection should follow. Programmatic scrolls (re-centring after a tap,
   * day change) return `false`.
   */
  scrolled(): boolean {
    if (!this._active) return false;
    this._armSettle();
    return true;
  }

  /** Abort everything (card disconnected, config change). */
  reset(): void {
    this._cancelSettle();
    this._active = false;
    this._down = false;
    this._dragging = false;
    this._moved = false;
    this._panned = false;
  }

  private _armSettle(): void {
    this._cancelSettle();
    if (this._down) return;
    this._settleTimer = this._setTimeout(() => {
      this._settleTimer = null;
      if (this._down) return;
      this._active = false;
      this._onSettle();
    }, this._settleMs);
  }

  private _cancelSettle(): void {
    if (this._settleTimer !== null) {
      this._clearTimeout(this._settleTimer);
      this._settleTimer = null;
    }
  }
}
