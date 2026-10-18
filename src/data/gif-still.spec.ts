import { afterEach, describe, expect, it, vi } from "vitest";

import type { CameraGalleryCardConfig } from "../config/normalize";
import { GIF_STILL_MAX_BYTES, GIF_STILL_PREWARM_WAIT_MS } from "../const";
import { gifFirstFrameEnd } from "../util/gif-frame";
import type { PosterStore } from "../util/poster-store";
import {
  classifyCaptureError,
  PendingPosterCollector,
  PosterCacheClient,
  type BlobUrlFactory,
  type PosterResolverInputs,
  type StillEncoder,
} from "./poster-cache";

// ─── Rigs ─────────────────────────────────────────────────────────────

class FakeStore {
  records = new Map<string, { key: string; blob: Blob; ts: number }>();
  init(): Promise<void> {
    return Promise.resolve();
  }
  isAvailable(): boolean {
    return true;
  }
  readAll(): Promise<{ key: string; blob: Blob; ts: number }[]> {
    return Promise.resolve([...this.records.values()]);
  }
  set(key: string, blob: Blob): Promise<void> {
    this.records.set(key, { key, blob, ts: Date.now() });
    return Promise.resolve();
  }
  touch(): Promise<void> {
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    this.records.delete(key);
    return Promise.resolve();
  }
  evictExcess(): Promise<void> {
    return Promise.resolve();
  }
}

function blobUrls(): BlobUrlFactory {
  let n = 0;
  return { create: (): string => "blob:still#" + ++n, revoke: (): void => {} };
}

function inputs(overrides: Partial<PosterResolverInputs> = {}): PosterResolverInputs {
  const empty: ReadonlyMap<string, string> = new Map();
  return {
    getSensorPairedThumbs: () => empty,
    getMediaPairedThumbs: () => empty,
    getMediaUrlCache: () => empty,
    findMatchingSnapshotMediaId: () => "",
    isResolveFailed: () => false,
    hasFrigate: () => false,
    captureAllowed: () => true,
    framePct: () => 0,
    isRevealed: () => true,
    getAuthToken: () => "tok",
    getOrigin: () => "https://ha.local",
    ...overrides,
  };
}

const cfg = {
  type: "custom:camera-gallery-card",
  source_mode: "sensor",
  entities: [],
} as unknown as CameraGalleryCardConfig;

/** Animated GIF whose first frame carries `payload` bytes of LZW data. */
function animatedGif(payload: number, frames = 3): Uint8Array {
  const out: number[] = [];
  for (const ch of "GIF89a") out.push(ch.charCodeAt(0));
  out.push(0x10, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0, 0, 0, 255, 255, 255);
  for (let f = 0; f < frames; f++) {
    out.push(0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00);
    out.push(0x2c, 0, 0, 0, 0, 0x10, 0x00, 0x10, 0x00, 0x00, 0x02);
    let left = f === 0 ? payload : 300;
    while (left > 0) {
      const n = Math.min(255, left);
      out.push(n);
      for (let i = 0; i < n; i++) out.push(i & 0xff);
      left -= n;
    }
    out.push(0x00);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}

/** Static file server honouring `Range` like aiohttp's FileResponse, with a
 * streamed body (fixed-size chunks) so specs can see how much was read. */
function rangeServer(
  files: Record<string, Uint8Array>,
  opts: { ignoreRange?: boolean; chunk?: number; noStream?: boolean } = {}
) {
  const calls: Array<{ url: string; range: string | undefined; auth: string | undefined }> = [];
  const stats = { pulled: 0, cancelled: 0 };
  const chunk = opts.chunk ?? 4096;
  const body = (bytes: Uint8Array): ReadableStream<Uint8Array> => {
    let off = 0;
    return new ReadableStream<Uint8Array>(
      {
        pull(c): void {
          if (off >= bytes.length) return c.close();
          const part = bytes.slice(off, off + chunk);
          off += part.length;
          stats.pulled += part.length;
          c.enqueue(part);
        },
        cancel(): void {
          stats.cancelled++;
        },
      },
      { highWaterMark: 0 }
    );
  };
  const respond = (status: number, bytes: Uint8Array): Response =>
    ({
      ok: status >= 200 && status < 300,
      status,
      body: opts.noStream ? null : body(bytes),
      arrayBuffer: () => {
        stats.pulled += bytes.length;
        return Promise.resolve(bytes.slice().buffer);
      },
    }) as unknown as Response;
  const fetchFn = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const h = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, range: h["Range"], auth: h["Authorization"] });
    const file = files[new URL(url).pathname];
    if (!file) return Promise.resolve({ ok: false, status: 404 } as Response);
    const m = /bytes=(\d+)-(\d+)/.exec(h["Range"] ?? "");
    if (!m || opts.ignoreRange) return Promise.resolve(respond(200, file));
    const start = Number(m[1]);
    const end = Math.min(Number(m[2]), file.length - 1);
    if (start >= file.length) return Promise.resolve({ ok: false, status: 416 } as Response);
    return Promise.resolve(respond(206, file.slice(start, end + 1)));
  }) as typeof fetch;
  return { fetchFn, calls, stats };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 60; i++) await new Promise((r) => setTimeout(r, 0));
};

function client(
  fetchFn: typeof fetch,
  encodeStill: StillEncoder,
  extra: Partial<PosterResolverInputs> = {}
) {
  const store = new FakeStore();
  const c = new PosterCacheClient({
    inputs: inputs(extra),
    store: store as unknown as PosterStore,
    blobUrls: blobUrls(),
    fetchFn,
    encodeStill,
  });
  c.load(cfg);
  return { c, store };
}

const SRC = "/local/snapshots/front_right/motion_20261018_070829.gif";

// ─── Specs ────────────────────────────────────────────────────────────

describe("GIF stills: resolveGifPoster", () => {
  it("collects a still job for a revealed GIF and returns the skeleton", () => {
    const { c } = client(rangeServer({}).fetchFn, async () => null);
    const pending = new PendingPosterCollector();
    expect(c.resolveGifPoster({ src: SRC }, pending)).toBe("");
    expect(pending.gifStills).toEqual([SRC]);
  });

  it("does nothing for a GIF that isn't revealed yet", () => {
    const { c } = client(rangeServer({}).fetchFn, async () => null, { isRevealed: () => false });
    const pending = new PendingPosterCollector();
    expect(c.resolveGifPoster({ src: SRC }, pending)).toBe("");
    expect(pending.size).toBe(0);
  });
});

describe("GIF stills: fetch + carve + cache", () => {
  it("streams the head with Range, stops after the first frame, caches a still", async () => {
    const gif = animatedGif(2000, 200);
    const srv = rangeServer({ [SRC]: gif });
    let encoded: Uint8Array | null = null;
    const { c, store } = client(srv.fetchFn, async (b) => {
      encoded = new Uint8Array(await b.arrayBuffer());
      return new Blob(["jpeg"], { type: "image/jpeg" });
    });
    c.enqueueGifStill(SRC);
    await flush();
    expect(srv.calls).toHaveLength(1);
    expect(srv.calls[0]!.url).toBe("https://ha.local" + SRC);
    expect(srv.calls[0]!.range).toBe(`bytes=0-${GIF_STILL_MAX_BYTES - 1}`);
    expect(srv.calls[0]!.auth).toBeUndefined(); // /local is public; no token sent
    const end = gifFirstFrameEnd(gif)!;
    expect(encoded).not.toBeNull();
    expect(encoded!.length).toBe(end + 1);
    expect(encoded![end]).toBe(0x3b);
    const still = c.getPosterUrl(SRC);
    expect(still).toMatch(/^blob:still#/);
    expect(c.resolveGifPoster({ src: SRC }, new PendingPosterCollector())).toBe(still);
    expect(store.records.size).toBe(1);
    // The tile showed the GIF frame at once; the IDB copy became the JPEG.
    expect([...store.records.values()][0]!.blob.type).toBe("image/jpeg");
    // ~66 KB file, first frame ends at ~2 KB: only a chunk or two was read.
    expect(gif.length).toBeGreaterThan(60_000);
    expect(srv.stats.pulled).toBeLessThanOrEqual(8192);
    expect(srv.stats.cancelled).toBe(1);
  });

  it("keeps reading across chunks until a big first frame is complete", async () => {
    const gif = animatedGif(200_000, 200); // ~200 KB first frame + ~66 KB of later frames
    const srv = rangeServer({ [SRC]: gif }, { chunk: 16384 });
    const { c } = client(srv.fetchFn, async () => new Blob(["j"]));
    c.enqueueGifStill(SRC);
    await flush();
    expect(srv.calls).toHaveLength(1);
    expect(c.getPosterUrl(SRC)).toBeTruthy();
    expect(srv.stats.pulled).toBeGreaterThanOrEqual(gifFirstFrameEnd(gif)!);
    expect(srv.stats.pulled).toBeLessThan(gif.length);
  });

  it("works without a streamed body (arrayBuffer fallback)", async () => {
    const gif = animatedGif(700, 5);
    const srv = rangeServer({ [SRC]: gif }, { noStream: true });
    const { c } = client(srv.fetchFn, async () => new Blob(["j"]));
    c.enqueueGifStill(SRC);
    await flush();
    expect(c.getPosterUrl(SRC)).toBeTruthy();
  });

  it("works when the server ignores Range (200 + whole file)", async () => {
    const gif = animatedGif(500, 4);
    const srv = rangeServer({ [SRC]: gif }, { ignoreRange: true });
    const { c } = client(srv.fetchFn, async () => new Blob(["j"]));
    c.enqueueGifStill(SRC);
    await flush();
    expect(srv.calls).toHaveLength(1);
    expect(c.getPosterUrl(SRC)).toBeTruthy();
  });

  it("keeps the single-frame GIF when the encoder can't run", async () => {
    const gif = animatedGif(800, 2);
    const srv = rangeServer({ [SRC]: gif });
    const { c, store } = client(srv.fetchFn, async () => null);
    c.enqueueGifStill(SRC);
    await flush();
    const rec = [...store.records.values()][0]!;
    expect(rec.blob.type).toBe("image/gif");
    expect(rec.blob.size).toBe(gifFirstFrameEnd(gif)! + 1);
  });

  it("serves a still from the IDB mirror without any network", async () => {
    const gif = animatedGif(600, 2);
    const srv = rangeServer({ [SRC]: gif });
    const first = client(srv.fetchFn, async () => new Blob(["j"]));
    first.c.enqueueGifStill(SRC);
    await flush();
    const calls = srv.calls.length;
    // Fresh card instance (page reload) over the same store.
    const c2 = new PosterCacheClient({
      inputs: inputs(),
      store: first.store as unknown as PosterStore,
      blobUrls: blobUrls(),
      fetchFn: srv.fetchFn,
      encodeStill: async () => new Blob(["j"]),
    });
    c2.load(cfg);
    await c2.prewarm();
    expect(c2.resolveGifPoster({ src: SRC }, new PendingPosterCollector())).toMatch(/^blob:/);
    expect(srv.calls.length).toBe(calls);
  });
});

describe("GIF stills: first visit isn't held up by IndexedDB", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("doesn't wait for the prewarm before this browser has cached a still", async () => {
    const gif = animatedGif(400, 3);
    const srv = rangeServer({ [SRC]: gif });
    const sets: Array<[string, string]> = [];
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: (k: string, v: string) => sets.push([k, v]),
    });
    const slowStore = new FakeStore();
    slowStore.readAll = (): Promise<{ key: string; blob: Blob; ts: number }[]> =>
      new Promise((r) => setTimeout(() => r([]), 5000));
    const c = new PosterCacheClient({
      inputs: inputs(),
      store: slowStore as unknown as PosterStore,
      blobUrls: blobUrls(),
      fetchFn: srv.fetchFn,
      encodeStill: async () => null,
    });
    c.load(cfg);
    void c.prewarm();
    c.enqueueGifStill(SRC);
    await flush();
    expect(srv.calls).toHaveLength(1); // no 150 ms wait
    expect(c.getPosterUrl(SRC)).toBeTruthy();
    expect(sets).toEqual([["cgc_gif_stills_cached", "1"]]);
  });

  it("waits briefly for the prewarm once stills are cached (repeat visit)", async () => {
    const gif = animatedGif(400, 3);
    const srv = rangeServer({ [SRC]: gif });
    vi.stubGlobal("localStorage", { getItem: () => "1", setItem: () => {} });
    const slowStore = new FakeStore();
    slowStore.readAll = (): Promise<{ key: string; blob: Blob; ts: number }[]> =>
      new Promise((r) => setTimeout(() => r([]), 5000));
    const c = new PosterCacheClient({
      inputs: inputs(),
      store: slowStore as unknown as PosterStore,
      blobUrls: blobUrls(),
      fetchFn: srv.fetchFn,
      encodeStill: async () => null,
    });
    c.load(cfg);
    void c.prewarm();
    c.enqueueGifStill(SRC);
    await flush();
    expect(srv.calls).toHaveLength(0); // still waiting (≤ GIF_STILL_PREWARM_WAIT_MS)
    await new Promise((r) => setTimeout(r, GIF_STILL_PREWARM_WAIT_MS + 50));
    await flush();
    expect(srv.calls).toHaveLength(1);
  });
});

describe("GIF stills: failures fall back to the full GIF (v3.1.0 behaviour)", () => {
  it("404 → hard fail → thumbnail uses the GIF URL itself", async () => {
    const srv = rangeServer({});
    const { c } = client(srv.fetchFn, async () => null);
    c.enqueueGifStill(SRC);
    await flush();
    expect(c.isHardFailed(SRC)).toBe(true);
    expect(c.resolveGifPoster({ src: SRC }, new PendingPosterCollector())).toBe(SRC);
  });

  it("first frame bigger than the budget → hard fail → GIF URL", async () => {
    const huge = animatedGif(GIF_STILL_MAX_BYTES + 50_000, 2);
    const srv = rangeServer({ [SRC]: huge }, { chunk: 65536 });
    const { c } = client(srv.fetchFn, async () => null);
    c.enqueueGifStill(SRC);
    await flush();
    expect(c.isHardFailed(SRC)).toBe(true);
    expect(c.resolveGifPoster({ src: SRC }, new PendingPosterCollector())).toBe(SRC);
    expect(srv.stats.pulled).toBeLessThanOrEqual(GIF_STILL_MAX_BYTES);
  });

  it("not a GIF → hard fail → GIF URL", async () => {
    const notGif = new Uint8Array(2048).fill(7);
    const srv = rangeServer({ [SRC]: notGif });
    const { c } = client(srv.fetchFn, async () => null);
    c.enqueueGifStill(SRC);
    await flush();
    expect(c.isHardFailed(SRC)).toBe(true);
    expect(c.resolveGifPoster({ src: SRC }, new PendingPosterCollector())).toBe(SRC);
  });

  it("a soft network error also falls back to the GIF URL instead of a skeleton", async () => {
    const fetchFn = (() => Promise.reject(new Error("network"))) as typeof fetch;
    const { c } = client(fetchFn, async () => null);
    c.enqueueGifStill(SRC);
    await flush();
    expect(c.isHardFailed(SRC)).toBe(false);
    expect(c.resolveGifPoster({ src: SRC }, new PendingPosterCollector())).toBe(SRC);
  });

  it("classifies 'gif first frame not found' as hard", () => {
    expect(classifyCaptureError(new Error("gif first frame not found"))).toEqual({ hard: true });
  });
});

describe("GIF stills: auth", () => {
  it("sends the token only for /api/ paths without authSig", async () => {
    const api = "/api/media/x.gif";
    const signed = "/api/media/y.gif?authSig=abc";
    const gif = animatedGif(300, 2);
    const srv = rangeServer({ [api]: gif, "/api/media/y.gif": gif });
    const { c } = client(srv.fetchFn, async () => new Blob(["j"]));
    c.enqueueGifStill(api);
    c.enqueueGifStill(signed);
    await flush();
    const byUrl = Object.fromEntries(srv.calls.map((x) => [x.url, x.auth]));
    expect(byUrl["https://ha.local" + api]).toBe("Bearer tok");
    expect(byUrl["https://ha.local" + signed]).toBeUndefined();
  });
});
