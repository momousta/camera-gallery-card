import { describe, expect, it } from "vitest";
import { firstFrameGif, gifFirstFrameEnd, isGifPath, isGifSignature } from "./gif-frame";

/** Builds a small, structurally valid animated GIF. Returns the bytes and the
 * offset just past the first frame's data terminator. */
function buildGif(opts: { gct?: boolean; lct?: boolean; frames?: number; header?: string } = {}): {
  bytes: Uint8Array;
  firstEnd: number;
} {
  const { gct = true, lct = false, frames = 3, header = "GIF89a" } = opts;
  const out: number[] = [];
  const push = (...b: number[]): void => {
    out.push(...b);
  };
  for (const ch of header) push(ch.charCodeAt(0));
  push(0x02, 0x00, 0x02, 0x00, gct ? 0x80 : 0x00, 0x00, 0x00);
  if (gct) push(0, 0, 0, 255, 255, 255);
  // NETSCAPE2.0 looping extension
  push(
    0x21,
    0xff,
    0x0b,
    ..."NETSCAPE2.0".split("").map((c) => c.charCodeAt(0)),
    0x03,
    0x01,
    0x00,
    0x00,
    0x00
  );
  let firstEnd = -1;
  for (let f = 0; f < frames; f++) {
    push(0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00); // graphic control extension
    push(0x2c, 0, 0, 0, 0, 0x02, 0x00, 0x02, 0x00, lct ? 0x80 : 0x00);
    if (lct) push(10, 20, 30, 40, 50, 60);
    push(0x02); // LZW min code size
    push(0x02, 0x44, 0x01); // one data sub-block
    push(0x03, 0x01, 0x02, 0x03); // a second sub-block
    push(0x00); // terminator
    if (f === 0) firstEnd = out.length;
  }
  push(0x3b);
  return { bytes: Uint8Array.from(out), firstEnd };
}

describe("isGifSignature", () => {
  it("accepts GIF87a and GIF89a", () => {
    expect(isGifSignature(buildGif({ header: "GIF87a" }).bytes)).toBe(true);
    expect(isGifSignature(buildGif().bytes)).toBe(true);
  });
  it("rejects other data", () => {
    expect(isGifSignature(new TextEncoder().encode("\x89PNG\r\n"))).toBe(false);
    expect(isGifSignature(new Uint8Array([0x47, 0x49]))).toBe(false);
  });
});

describe("gifFirstFrameEnd", () => {
  it("finds the end of the first frame with a global color table", () => {
    const { bytes, firstEnd } = buildGif();
    expect(gifFirstFrameEnd(bytes)).toBe(firstEnd);
  });

  it("skips a local color table", () => {
    const { bytes, firstEnd } = buildGif({ gct: false, lct: true });
    expect(gifFirstFrameEnd(bytes)).toBe(firstEnd);
  });

  it("works on a single-frame GIF", () => {
    const { bytes, firstEnd } = buildGif({ frames: 1 });
    expect(gifFirstFrameEnd(bytes)).toBe(firstEnd);
  });

  it("returns null when the head ends inside the first frame (needs more bytes)", () => {
    const { bytes, firstEnd } = buildGif();
    for (const cut of [5, 13, 20, firstEnd - 1]) {
      expect(gifFirstFrameEnd(bytes.subarray(0, cut))).toBeNull();
    }
    expect(gifFirstFrameEnd(bytes.subarray(0, firstEnd))).toBe(firstEnd);
  });

  it("returns null for a GIF without any image", () => {
    const bytes = Uint8Array.from(
      [..."GIF89a"].map((c) => c.charCodeAt(0)).concat([1, 0, 1, 0, 0, 0, 0, 0x3b])
    );
    expect(gifFirstFrameEnd(bytes)).toBeNull();
  });

  it("returns null for corrupt block types", () => {
    const { bytes } = buildGif();
    const bad = bytes.slice();
    bad[13 + 6] = 0x99; // first block after the color table
    expect(gifFirstFrameEnd(bad)).toBeNull();
  });
});

describe("firstFrameGif", () => {
  it("returns the first frame followed by the trailer", () => {
    const { bytes, firstEnd } = buildGif({ frames: 4 });
    const one = firstFrameGif(bytes);
    expect(one).not.toBeNull();
    expect(one!.length).toBe(firstEnd + 1);
    expect(one![one!.length - 1]).toBe(0x3b);
    expect(Array.from(one!.subarray(0, firstEnd))).toEqual(Array.from(bytes.subarray(0, firstEnd)));
    // The carved file is itself a GIF whose first frame ends where it did.
    expect(gifFirstFrameEnd(one!)).toBe(firstEnd);
  });

  it("returns null for incomplete input", () => {
    const { bytes, firstEnd } = buildGif();
    expect(firstFrameGif(bytes.subarray(0, firstEnd - 2))).toBeNull();
  });
});

describe("isGifPath", () => {
  it("matches .gif with query and hash", () => {
    expect(isGifPath("/local/snapshots/cam/motion_20261018_070829.gif")).toBe(true);
    expect(isGifPath("/local/a.GIF?v=2#x")).toBe(true);
  });
  it("rejects other types", () => {
    expect(isGifPath("/local/a.jpg")).toBe(false);
    expect(isGifPath("/local/a.gif.tmp")).toBe(false);
    expect(isGifPath("")).toBe(false);
    expect(isGifPath(null)).toBe(false);
  });
});
