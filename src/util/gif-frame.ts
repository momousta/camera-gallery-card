/**
 * First-frame extraction for animated GIFs, used to give sensor-mode GIF
 * thumbnails a cheap still poster.
 *
 * Why: camera GIF clips are large (hundreds of KB to several MB) and the
 * thumbnail strip used to load every visible clip in full just to paint a
 * 140 px tile that then animates forever. The first frame is typically
 * 5–20 % of the file, so a `Range` request for the head of the file plus a
 * block walk is enough to build a valid single-frame GIF.
 *
 * Pure byte functions here; the fetch/decode strategy lives in
 * `poster-cache.ts` (`fetchGifFirstFrame`).
 */

const TRAILER = 0x3b;
const EXTENSION = 0x21;
const IMAGE = 0x2c;

/** `true` iff `bytes` starts with a GIF87a/GIF89a signature. */
export function isGifSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && // G
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x38 && // 8
    (bytes[4] === 0x37 || bytes[4] === 0x39) && // 7 | 9
    bytes[5] === 0x61 // a
  );
}

/**
 * Byte offset just past the first image block (descriptor, optional local
 * color table, LZW data sub-blocks and their 0 terminator).
 *
 * Returns `null` when the buffer isn't a GIF, holds no image, or ends
 * before the first frame is complete (the caller then fetches more bytes).
 */
export function gifFirstFrameEnd(bytes: Uint8Array): number | null {
  const n = bytes.length;
  if (!isGifSignature(bytes) || n < 13) return null;
  const screenFlags = bytes[10] ?? 0;
  let p = 13;
  if (screenFlags & 0x80) p += 3 * (1 << ((screenFlags & 0x07) + 1));
  const skipSubBlocks = (from: number): number | null => {
    let q = from;
    for (;;) {
      if (q >= n) return null;
      const size = bytes[q] ?? 0;
      q += 1;
      if (size === 0) return q;
      q += size;
    }
  };
  while (p < n) {
    const b = bytes[p];
    if (b === EXTENSION) {
      if (p + 2 > n) return null;
      const end = skipSubBlocks(p + 2);
      if (end === null) return null;
      p = end;
    } else if (b === IMAGE) {
      if (p + 10 > n) return null;
      const imgFlags = bytes[p + 9] ?? 0;
      p += 10;
      if (imgFlags & 0x80) p += 3 * (1 << ((imgFlags & 0x07) + 1));
      p += 1; // LZW minimum code size
      if (p > n) return null;
      return skipSubBlocks(p);
    } else {
      // Trailer before any image, or a corrupt block.
      return null;
    }
  }
  return null;
}

/**
 * A complete single-frame GIF (first frame + trailer) carved out of the head
 * of an animated GIF, or `null` if `bytes` doesn't contain the whole first
 * frame yet.
 */
export function firstFrameGif(bytes: Uint8Array): Uint8Array | null {
  const end = gifFirstFrameEnd(bytes);
  if (end === null) return null;
  const out = new Uint8Array(end + 1);
  out.set(bytes.subarray(0, end), 0);
  out[end] = TRAILER;
  return out;
}

/** `true` for `.gif` paths (query/hash ignored). */
export function isGifPath(src: string | null | undefined): boolean {
  if (!src) return false;
  const clean = (String(src).split("?")[0] ?? "").split("#")[0] ?? "";
  return /\.gif$/i.test(clean);
}
