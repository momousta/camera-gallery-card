/**
 * Preview preloading (BL-006).
 *
 * When a camera opens, its day's previews load in the background, the ones nearest the selection first. Then the
 * days around it load: older day 1, newer day 1, older day 2, and so on. Scrolling and scrubbing then paint from
 * the browser cache. HA serves `/local/` with a month-long `Cache-Control`, so the next visit costs nothing either.
 *
 * `planPreload` is pure. `ThumbPreloader` runs a plan with a few parallel low-priority image loads. It stops
 * starting new loads while the page is hidden, and remembers what it already loaded or failed.
 */

export interface PreloadPlanInput {
  /** Days that have items, newest first. */
  days: readonly string[];
  activeDay: string | null;
  /** Index of the selected item in the active day's strip. */
  selectedIndex: number;
  /** How many days to preload on each side of the active day. */
  neighbourDays: number;
  /** The strip of a day, in strip order (already filtered and capped like the card shows it). */
  itemsForDay: (day: string) => readonly string[];
}

/** The order to preload in: the active day outward from the selection, then the neighbour days. */
export function planPreload(input: PreloadPlanInput): string[] {
  const { days, selectedIndex, itemsForDay } = input;
  const activeDay = input.activeDay ?? days[0] ?? null;
  if (!activeDay) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (src: string | undefined) => {
    if (src && !seen.has(src)) {
      seen.add(src);
      out.push(src);
    }
  };

  const active = itemsForDay(activeDay);
  const sel = Math.min(Math.max(0, Math.trunc(selectedIndex) || 0), Math.max(0, active.length - 1));
  push(active[sel]);
  for (let d = 1; d < active.length; d++) {
    push(active[sel + d]);
    push(active[sel - d]);
  }

  const at = days.indexOf(activeDay);
  const n = Math.max(0, Math.trunc(input.neighbourDays) || 0);
  if (at >= 0) {
    for (let k = 1; k <= n; k++) {
      const older = days[at + k];
      const newer = at - k >= 0 ? days[at - k] : undefined;
      if (older) for (const src of itemsForDay(older)) push(src);
      if (newer) for (const src of itemsForDay(newer)) push(src);
    }
  }
  return out;
}

export interface PreloadEntry {
  src: string;
  url: string;
}

export interface ThumbPreloaderOptions {
  /** Loads one URL; resolves true when it loaded. Default: a low-priority `Image`. */
  load?: (url: string) => Promise<boolean>;
  concurrency?: number;
  /** True while the page is hidden: no new loads start. Default: `document.hidden`. */
  isHidden?: () => boolean;
  /** Called once per URL with its result. */
  onResult?: (entry: PreloadEntry, ok: boolean) => void;
}

export function loadImageLowPriority(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    try {
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "low";
    } catch {
      // older engines: plain priority
    }
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export class ThumbPreloader {
  private readonly _load: (url: string) => Promise<boolean>;
  private readonly _concurrency: number;
  private readonly _isHidden: () => boolean;
  private readonly _onResult: ((entry: PreloadEntry, ok: boolean) => void) | undefined;
  private _queue: PreloadEntry[] = [];
  private readonly _inFlight = new Set<string>();
  private readonly _done = new Set<string>();
  private readonly _failed = new Set<string>();
  private _disposed = false;

  constructor(opts: ThumbPreloaderOptions = {}) {
    this._load = opts.load ?? loadImageLowPriority;
    this._concurrency = Math.max(1, Math.trunc(opts.concurrency ?? 3));
    this._isHidden =
      opts.isHidden ??
      (() => typeof document !== "undefined" && document.visibilityState === "hidden");
    this._onResult = opts.onResult;
  }

  /** Replace what is still waiting (loads in flight finish). Loaded or failed URLs are skipped. */
  setQueue(entries: readonly PreloadEntry[]): void {
    if (this._disposed) return;
    const seen = new Set<string>();
    this._queue = entries.filter((e) => {
      if (!e?.url || seen.has(e.url)) return false;
      seen.add(e.url);
      return !this._done.has(e.url) && !this._failed.has(e.url) && !this._inFlight.has(e.url);
    });
    this.pump();
  }

  /** Mark URLs as already loaded (e.g. by a visible tile) so they aren't fetched again. */
  markLoaded(url: string): void {
    if (url) this._done.add(url);
  }

  /** Start loads up to the concurrency limit. Call again when the page becomes visible. */
  pump(): void {
    if (this._disposed || this._isHidden()) return;
    while (this._inFlight.size < this._concurrency && this._queue.length) {
      const entry = this._queue.shift() as PreloadEntry;
      if (this._done.has(entry.url) || this._failed.has(entry.url)) continue;
      this._inFlight.add(entry.url);
      void this._load(entry.url)
        .catch(() => false)
        .then((ok) => {
          this._inFlight.delete(entry.url);
          if (this._disposed) return;
          (ok ? this._done : this._failed).add(entry.url);
          this._onResult?.(entry, ok);
          this.pump();
        });
    }
  }

  dispose(): void {
    this._disposed = true;
    this._queue = [];
  }

  get stats(): { done: number; failed: number; pending: number; inFlight: number } {
    return {
      done: this._done.size,
      failed: this._failed.size,
      pending: this._queue.length,
      inFlight: this._inFlight.size,
    };
  }
}
