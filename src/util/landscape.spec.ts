// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { portraitScreen, turnFromMotion, unturn } from "./landscape";

describe("landscape", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("turns the way the phone is held, keeping the turn in between", () => {
    expect(turnFromMotion(9.5, -90)).toBe(90); // top to the left
    expect(turnFromMotion(-9.5, 90)).toBe(-90); // top to the right
    expect(turnFromMotion(2, -90)).toBe(-90);
    expect(turnFromMotion(undefined, 90)).toBe(90);
    expect(turnFromMotion(NaN, 90)).toBe(90);
  });

  it("maps a screen move into the turned picture's own frame", () => {
    expect(unturn(10, 0, 0)).toEqual([10, 0]);
    expect(unturn(10, 0, 90)).toEqual([0, -10]); // right on the screen = towards its top
    expect(unturn(0, 10, 90)).toEqual([10, 0]); // down the screen = towards its right
    expect(unturn(10, 0, -90)).toEqual([0, 10]);
    expect(unturn(0, 10, -90)).toEqual([-10, 0]);
  });

  it("knows a portrait screen", () => {
    vi.stubGlobal("matchMedia", (m: string) => ({ matches: m === "(orientation: portrait)" }));
    expect(portraitScreen()).toBe(true);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(portraitScreen()).toBe(false);
  });
});
