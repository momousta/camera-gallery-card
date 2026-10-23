import { describe, expect, it } from "vitest";
import { EdgeFlip } from "./edge-flip";

// Owner 10-23: scrolling past either end of a day's strip goes on into the next / previous day.

function setup(found = true) {
  let now = 0;
  const fired: number[] = [];
  const edge = new EdgeFlip({
    onEdge: (side) => {
      fired.push(side);
      return found;
    },
    now: () => now,
  });
  const box = { scrollLeft: 500, scrollWidth: 2000, clientWidth: 400 }; // max 1600
  return { edge, box, fired, tick: (ms: number) => (now += ms) };
}

describe("EdgeFlip", () => {
  it("a user scroll arriving at an end while moving toward it", () => {
    const { edge, box, fired, tick } = setup();
    edge.scrolled(box);
    box.scrollLeft = 0;
    edge.scrolled(box);
    expect(fired).toEqual([-1]);
    // Held: the card's own scroll of the new day doesn't send it back, until the gesture ends and a moment passes.
    box.scrollLeft = 1600;
    edge.scrolled(box);
    box.scrollLeft = 1599;
    edge.scrolled(box);
    box.scrollLeft = 1600;
    edge.scrolled(box);
    expect(fired).toEqual([-1]);
    edge.release();
    tick(800);
    box.scrollLeft = 1500;
    edge.scrolled(box);
    box.scrollLeft = 1600;
    edge.scrolled(box);
    expect(fired).toEqual([-1, 1]);
  });

  it("not when moving away from an end, nor on the first scroll seen, nor when nothing scrolls", () => {
    const { edge, box, fired } = setup();
    box.scrollLeft = 0;
    edge.scrolled(box); // first seen: no direction yet
    box.scrollLeft = 10;
    edge.scrolled(box);
    expect(fired).toEqual([]);
    const short = { scrollLeft: 0, scrollWidth: 400, clientWidth: 400 };
    edge.scrolled(short);
    edge.scrolled(short);
    expect(fired).toEqual([]);
  });

  it("a finger pulling on past an end (no scroll events come there)", () => {
    const { edge, box, fired } = setup();
    box.scrollLeft = 1600;
    edge.touchStart(300, box);
    edge.touchMove(280, box);
    expect(fired).toEqual([]);
    edge.touchMove(240, box); // 60 px on past the end
    expect(fired).toEqual([1]);
  });

  it("a pull measured from where the end was reached in the touch", () => {
    const { edge, box, fired } = setup();
    edge.touchStart(100, box); // mid-strip
    box.scrollLeft = 0;
    edge.touchMove(200, box); // the strip arrived at its start here
    edge.touchMove(230, box);
    expect(fired).toEqual([]);
    edge.touchMove(260, box);
    expect(fired).toEqual([-1]);
  });

  it("a new touch is a new gesture, even while the last one's momentum still scrolls", () => {
    const { edge, box, fired, tick } = setup();
    edge.touchStart(200, box);
    box.scrollLeft = 1600;
    edge.touchMove(150, box);
    edge.touchMove(80, box); // pulled past the end
    expect(fired).toEqual([1]);
    edge.touchEnd();
    box.scrollLeft = 100;
    edge.scrolled(box); // momentum, no release yet
    tick(800);
    edge.touchStart(100, box);
    box.scrollLeft = 0;
    edge.touchMove(200, box);
    edge.touchMove(270, box);
    expect(fired).toEqual([1, -1]);
  });

  it("the wheel pushing on past an end", () => {
    const { edge, box, fired } = setup();
    box.scrollLeft = 0;
    edge.wheel(-100, box);
    edge.wheel(50, box); // the other way: starts over
    edge.wheel(-100, box);
    expect(fired).toEqual([]);
    edge.wheel(-100, box);
    expect(fired).toEqual([-1]);
  });

  it("no day that way: nothing is held", () => {
    const { edge, box, fired } = setup(false);
    edge.scrolled(box);
    box.scrollLeft = 0;
    edge.scrolled(box);
    box.scrollLeft = 5;
    edge.scrolled(box);
    box.scrollLeft = 0;
    edge.scrolled(box);
    expect(fired).toEqual([-1, -1]);
    expect(edge.held).toBe(false);
  });
});
