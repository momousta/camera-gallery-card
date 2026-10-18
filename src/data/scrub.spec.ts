import { describe, expect, it } from "vitest";
import { pickCenterIndex, ScrubGesture, SCRUB_SETTLE_MS } from "./scrub";

/** Manual timer queue so settle timing is deterministic. */
function clock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    schedule: {
      setTimeout: (fn: () => void, ms: number): unknown => {
        const id = ++seq;
        timers.set(id, { at: now + ms, fn });
        return id;
      },
      clearTimeout: (h: unknown): void => {
        timers.delete(h as number);
      },
    },
    advance(ms: number): void {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
      }
    },
    pending: (): number => timers.size,
  };
}

function rig() {
  const c = clock();
  let settles = 0;
  const g = new ScrubGesture({ onSettle: () => settles++, schedule: c.schedule });
  return { g, c, settles: () => settles };
}

describe("pickCenterIndex", () => {
  const spans = [
    { index: 0, start: 0, end: 100 },
    { index: 1, start: 110, end: 210 },
    { index: 2, start: 220, end: 320 },
  ];
  it("returns the thumb whose middle is closest to the playhead", () => {
    expect(pickCenterIndex(spans, 160)).toBe(1);
    expect(pickCenterIndex(spans, 10)).toBe(0);
    expect(pickCenterIndex(spans, 999)).toBe(2);
  });
  it("is null for an empty strip", () => {
    expect(pickCenterIndex([], 50)).toBeNull();
  });
});

describe("ScrubGesture — taps keep the normal select path", () => {
  it("mouse tap: not a drag, strip is no longer user-driven", () => {
    const { g, settles } = rig();
    g.pointerDown("mouse", 100, 0);
    expect(g.pointerMove(103)).toBeNull(); // under the threshold
    expect(g.pointerUp()).toEqual({ tap: true, suppressClick: false });
    expect(g.active).toBe(false);
    // The smooth re-centre after the click must not move the selection.
    expect(g.scrolled()).toBe(false);
    expect(settles()).toBe(0);
  });

  it("touch tap with a little jitter is still a tap (browser didn't pan)", () => {
    const { g } = rig();
    g.pointerDown("touch", 100, 0);
    g.pointerMove(109);
    expect(g.pointerUp().tap).toBe(true);
    g.touchEnd();
    expect(g.active).toBe(false);
  });
});

describe("ScrubGesture — mouse drag scrolls the strip and follows", () => {
  it("returns drag-to-scroll positions and swallows the release click", () => {
    const { g, c, settles } = rig();
    g.pointerDown("mouse", 300, 500);
    expect(g.pointerMove(304)).toBeNull();
    expect(g.pointerMove(260)).toBe(540); // dragged left 40 px → scroll right 40 px
    expect(g.dragging).toBe(true);
    expect(g.scrolled()).toBe(true);
    expect(g.pointerMove(200)).toBe(600);
    expect(g.pointerUp()).toEqual({ tap: false, suppressClick: true });
    expect(g.dragging).toBe(false);
    // Snap-back scrolling after release still follows until idle.
    expect(g.scrolled()).toBe(true);
    c.advance(SCRUB_SETTLE_MS - 1);
    expect(settles()).toBe(0);
    c.advance(1);
    expect(settles()).toBe(1);
    expect(g.active).toBe(false);
  });
});

describe("ScrubGesture — touch pan + momentum", () => {
  it("doesn't settle while the finger is down, settles after lift + idle", () => {
    const { g, c, settles } = rig();
    g.pointerDown("touch", 200, 0);
    expect(g.pointerMove(150)).toBeNull(); // native panning, no JS scroll
    g.pointerCancel(); // browser took over
    expect(g.scrolled()).toBe(true);
    c.advance(1000); // finger resting on the strip: still scrubbing
    expect(settles()).toBe(0);
    expect(g.active).toBe(true);
    g.touchEnd();
    // Momentum keeps scrolling: each scroll re-arms the settle timer.
    c.advance(100);
    expect(g.scrolled()).toBe(true);
    c.advance(100);
    expect(settles()).toBe(0);
    c.advance(SCRUB_SETTLE_MS);
    expect(settles()).toBe(1);
    expect(g.scrolled()).toBe(false);
  });
});

describe("ScrubGesture — wheel and programmatic scrolls", () => {
  it("wheel makes scrolls user-driven until idle", () => {
    const { g, c, settles } = rig();
    expect(g.scrolled()).toBe(false); // programmatic (e.g. day change) → ignored
    g.wheel();
    expect(g.scrolled()).toBe(true);
    c.advance(SCRUB_SETTLE_MS);
    expect(settles()).toBe(1);
    expect(g.scrolled()).toBe(false);
  });

  it("reset clears any pending settle", () => {
    const { g, c, settles } = rig();
    g.wheel();
    g.reset();
    c.advance(1000);
    expect(settles()).toBe(0);
    expect(c.pending()).toBe(0);
    expect(g.active).toBe(false);
  });
});
