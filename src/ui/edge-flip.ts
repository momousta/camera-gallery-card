/**
 * Owner fork (10-23): reaching either end of a time strip moves to the neighbouring day. Used by the Timeline's
 * time track and the camera page's thumbnail strip, so both behave the same.
 *
 * The strip scrolls along x. Its start (scroll 0) is -1, its end (scrolled to the right) is +1; each user decides
 * what a side means (the Timeline: earlier / later; the gallery's strip, newest on the left: newer / older).
 *
 * An end is reached by:
 * - a scroll the user made, arriving at it while moving toward it;
 * - a finger pulling on past it (the browser doesn't scroll any more there, so no scroll events come);
 * - the wheel pushing on past it.
 * After a move the strip is held until the user's gesture ends (`release()`, or a new touch) and `holdMs` has passed,
 * so the new day's strip (scrolled by the card) can't send it straight back.
 */

export type EdgeSide = -1 | 1;

export interface EdgeFlipOptions {
  /** The user reached `side`: move to that day. Return false when there is none (nothing is held then). */
  onEdge: (side: EdgeSide) => boolean;
  /** Within this of an end counts as at it (px). */
  slackPx?: number;
  /** A finger pulled this far on past an end (px). */
  pullPx?: number;
  /** Wheel deltas past an end adding up to this (px). */
  wheelPx?: number;
  /** Held at least this long after a move (ms). */
  holdMs?: number;
  now?: () => number;
}

export const EDGE_SLACK_PX = 1;
export const EDGE_PULL_PX = 56;
export const EDGE_WHEEL_PX = 160;
export const EDGE_HOLD_MS = 700;

export interface ScrollBox {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export class EdgeFlip {
  private readonly _onEdge: (side: EdgeSide) => boolean;
  private readonly _slack: number;
  private readonly _pull: number;
  private readonly _wheelPx: number;
  private readonly _holdMs: number;
  private readonly _now: () => number;
  private _last: number | null = null;
  private _heldUntil = 0;
  private _gestureHeld = false;
  private _touchX: number | null = null;
  private _touchSide: EdgeSide | 0 = 0;
  private _wheel = 0;

  constructor(opts: EdgeFlipOptions) {
    this._onEdge = opts.onEdge;
    this._slack = opts.slackPx ?? EDGE_SLACK_PX;
    this._pull = opts.pullPx ?? EDGE_PULL_PX;
    this._wheelPx = opts.wheelPx ?? EDGE_WHEEL_PX;
    this._holdMs = opts.holdMs ?? EDGE_HOLD_MS;
    this._now = opts.now ?? (() => performance.now());
  }

  /** The end the strip is at: -1 (start), 1 (end), 0 (neither, or nothing to scroll). */
  sideOf(box: ScrollBox): EdgeSide | 0 {
    const max = box.scrollWidth - box.clientWidth;
    if (!(max > this._slack)) return 0;
    if (box.scrollLeft <= this._slack) return -1;
    if (box.scrollLeft >= max - this._slack) return 1;
    return 0;
  }

  get held(): boolean {
    return this._gestureHeld || this._now() < this._heldUntil;
  }

  /** A scroll the user made (not one the card made). */
  scrolled(box: ScrollBox): void {
    const pos = box.scrollLeft;
    const last = this._last;
    this._last = pos;
    if (last === null || this.held) return;
    const side = this.sideOf(box);
    if ((side === -1 && pos < last) || (side === 1 && pos > last)) this._fire(side);
  }

  /** A finger went down on the strip: a new gesture (the one that moved the day is over, even if its momentum
   * still scrolls the strip). */
  touchStart(x: number, box: ScrollBox): void {
    this._gestureHeld = false;
    this._touchX = x;
    this._touchSide = this.sideOf(box);
  }

  /** The finger moved: pulling on past the end it started at (or reached) moves the day. */
  touchMove(x: number, box: ScrollBox): void {
    if (this._touchX === null) return;
    const side = this.sideOf(box);
    if (side !== this._touchSide) {
      // Reached an end during this touch: measure the pull from here.
      this._touchSide = side;
      this._touchX = x;
      return;
    }
    if (!side || this.held) return;
    // Past the start the finger moves right (dx > 0); past the end, left.
    const pulled = side === -1 ? x - this._touchX : this._touchX - x;
    if (pulled >= this._pull) {
      this._touchX = null;
      this._fire(side);
    }
  }

  /** Every finger left the strip: the gesture is over. */
  touchEnd(): void {
    this._touchX = null;
    this._touchSide = 0;
  }

  /** A wheel step of `delta` px along the strip (positive: toward the end). */
  wheel(delta: number, box: ScrollBox): void {
    const side = this.sideOf(box);
    const past = (side === -1 && delta < 0) || (side === 1 && delta > 0);
    if (!past || this.held) {
      this._wheel = 0;
      return;
    }
    this._wheel += Math.abs(delta);
    if (this._wheel >= this._wheelPx) this._fire(side as EdgeSide);
  }

  /** The user's gesture ended (the strip settled): a held strip is free again once `holdMs` has passed. */
  release(): void {
    this._gestureHeld = false;
  }

  /** Hold the strip (the card scrolls it itself, e.g. to a new day). */
  hold(untilGestureEnds = true): void {
    this._heldUntil = this._now() + this._holdMs;
    if (untilGestureEnds) this._gestureHeld = true;
    this._last = null;
    this._wheel = 0;
  }

  private _fire(side: EdgeSide): void {
    this._wheel = 0;
    if (this._onEdge(side)) this.hold();
  }
}
