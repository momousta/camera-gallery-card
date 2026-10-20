/**
 * Landscape full screen on a phone held sideways (BL-008 follow-up).
 *
 * A page can't turn the screen in the Home Assistant app's Android WebView (`screen.orientation.lock` isn't
 * supported there), so a landscape picture shown full screen on a portrait screen is turned 90° by CSS instead.
 * The way it is turned follows the phone where the browser reports motion (https); otherwise the usual
 * landscape: the phone's top to the left.
 */

/** Whether the screen is portrait: a landscape picture shown full screen is then turned. */
export function portraitScreen(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(orientation: portrait)")?.matches;
}

/**
 * The turn (90 or -90 degrees) from the phone's gravity along its x axis (`accelerationIncludingGravity.x`):
 * its top to the left (x > 0) → 90; to the right (x < 0) → -90; in between keeps the current one.
 */
export function turnFromMotion(x: number | null | undefined, current: number): number {
  if (typeof x !== "number" || !Number.isFinite(x)) return current;
  if (x > 6) return 90;
  if (x < -6) return -90;
  return current;
}

/**
 * A screen-space vector in the frame of a picture turned by `turn` degrees (CSS rotate, clockwise): what moves
 * the picture's own x / y by that much on screen.
 */
export function unturn(dx: number, dy: number, turn: number): [number, number] {
  const z = (v: number): number => (v === 0 ? 0 : v); // no -0
  if (turn === 90) return [z(dy), z(-dx)];
  if (turn === -90) return [z(-dy), z(dx)];
  return [dx, dy];
}

/** Follows the phone's turn while full screen (devicemotion), calling back when it changes. */
export class TurnWatcher {
  turn = 90;
  private _on = false;
  private readonly _onMotion: (e: DeviceMotionEvent) => void;

  constructor(private readonly _changed: () => void) {
    this._onMotion = (e: DeviceMotionEvent) => {
      const next = turnFromMotion(e?.accelerationIncludingGravity?.x, this.turn);
      if (next !== this.turn) {
        this.turn = next;
        this._changed();
      }
    };
  }

  start(): void {
    if (
      this._on ||
      typeof window === "undefined" ||
      typeof window.DeviceMotionEvent === "undefined"
    )
      return;
    this._on = true;
    window.addEventListener("devicemotion", this._onMotion);
  }

  stop(): void {
    if (!this._on) return;
    this._on = false;
    window.removeEventListener("devicemotion", this._onMotion);
  }
}
