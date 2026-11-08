/**
 * SHA-256, synchronous. The Reolink app's alarm link carries Base64(SHA-256(NVR UID)), and a tap must open the app
 * at once, inside the touch: `crypto.subtle.digest` is asynchronous and missing on plain-HTTP pages (the HA app on
 * the LAN address), so the card hashes by itself.
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const ror = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

export function sha256(data: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const size = Math.ceil((data.length + 9) / 64) * 64;
  const msg = new Uint8Array(size);
  msg.set(data);
  msg[data.length] = 0x80;
  const view = new DataView(msg.buffer);
  // The message length in bits, big-endian, in the block's last 8 bytes.
  view.setUint32(size - 8, Math.floor(data.length / 0x20000000));
  view.setUint32(size - 4, (data.length * 8) >>> 0);
  const w = new Uint32Array(64);
  const v = new Uint32Array(8);
  for (let off = 0; off < size; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]!;
      const y = w[i - 2]!;
      const s0 = ror(x, 7) ^ ror(x, 18) ^ (x >>> 3);
      const s1 = ror(y, 17) ^ ror(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    v.set(h);
    for (let i = 0; i < 64; i++) {
      const [a, b, c, d, e, f, g, hh] = v as unknown as number[];
      const t1 =
        (hh! +
          (ror(e!, 6) ^ ror(e!, 11) ^ ror(e!, 25)) +
          ((e! & f!) ^ (~e! & g!)) +
          K[i]! +
          w[i]!) >>>
        0;
      const t2 =
        ((ror(a!, 2) ^ ror(a!, 13) ^ ror(a!, 22)) + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>> 0;
      v.set([(t1 + t2) >>> 0, a!, b!, c!, (d! + t1) >>> 0, e!, f!, g!]);
    }
    for (let i = 0; i < 8; i++) h[i] = (h[i]! + v[i]!) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]!);
  return out;
}

/** Base64 of the SHA-256 of `text`'s UTF-8 bytes. */
export function sha256Base64(text: string): string {
  return btoa(String.fromCharCode(...sha256(new TextEncoder().encode(text))));
}
