/**
 * Fork addition to the `url_id` deep links (upstream PR #236, BL-008): open the gallery on one file or moment.
 *
 *   ?cgc_id=<url_id>&cgc_view=gallery&cgc_src=/local/cam/motion_20261019_120000.gif&cgc_time=1792436400000
 *
 * - `cgc_src` must be one of the card's own items (the card looks it up), so a crafted link can't load anything new.
 * - `cgc_time` (epoch milliseconds or seconds, or ISO 8601) is the fallback: the item at or just before that moment
 *   (or the first one after it), e.g. when the file has since been deleted.
 * Swiping to the next camera (owner 10-20) adds:
 * - `cgc_near=1`: the item closest to the moment, before or after it;
 * - `cgc_nvr=sub|main`: the viewer was streaming: play the NVR's recording from the moment in that quality (on a
 *   camera without an NVR channel, the closest snapshot);
 * - `cgc_fs=1`: it was full screen.
 * The parameters apply once: the card removes them from the address after using them.
 */

export interface UrlTarget {
  src: string | null;
  time: number | null;
  /** The item closest to `time` (else at or before it). */
  near?: boolean;
  /** Stream from `time` in this quality ("sub" / "main"). */
  nvr?: string | null;
  /** Full screen. */
  fs?: boolean;
  /** Day switches already made while resolving (internal). */
  hops?: number;
}

export interface TargetEntry {
  src: string;
  dtMs?: number | null;
  dayKey?: string | null;
}

/** Every parameter of the deep links, PR #236's and the fork's. */
export const DEEP_LINK_PARAMS = [
  "cgc_id",
  "cgc_view",
  "cgc_camera",
  "cgc_src",
  "cgc_time",
  "cgc_near",
  "cgc_nvr",
  "cgc_fs",
  "cgc_live",
] as const;

const MIN_MS = Date.UTC(2000, 0, 1);
const MAX_MS = Date.UTC(2100, 0, 1);

/** Epoch ms (13 digits), epoch seconds (10 digits) or an ISO 8601 date; null when it isn't a plausible moment. */
export function parseUrlTime(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  let ms: number;
  if (/^\d{12,13}$/.test(v)) ms = Number(v);
  else if (/^\d{9,10}$/.test(v)) ms = Number(v) * 1000;
  else if (/^\d{4}-\d{2}-\d{2}T/.test(v)) ms = Date.parse(v);
  else return null;
  return Number.isFinite(ms) && ms >= MIN_MS && ms < MAX_MS ? ms : null;
}

export function parseUrlTarget(opts: {
  search: string | null | undefined;
  urlId: string | null | undefined;
}): UrlTarget | null {
  const urlId = (opts.urlId ?? "").trim();
  if (!urlId) return null;
  const params = new URLSearchParams(opts.search ?? "");
  if ((params.get("cgc_id") ?? "").trim() !== urlId) return null;
  const rawSrc = (params.get("cgc_src") ?? "").trim();
  const src =
    rawSrc &&
    rawSrc.length <= 2048 &&
    (rawSrc.startsWith("/") || rawSrc.startsWith("media-source://"))
      ? rawSrc
      : null;
  const time = parseUrlTime(params.get("cgc_time"));
  if (!src && time === null) return null;
  const target: UrlTarget = { src, time };
  if (params.get("cgc_near") === "1") target.near = true;
  const nvr = params.get("cgc_nvr");
  if (time !== null && (nvr === "sub" || nvr === "main")) target.nvr = nvr;
  if (params.get("cgc_fs") === "1") target.fs = true;
  return target;
}

/** The entry a target names: the exact file, else the latest one at or before the moment, else the first after. */
export function pickTargetEntry<T extends TargetEntry>(
  entries: readonly T[],
  target: UrlTarget | null
): T | null {
  if (!target) return null;
  if (target.src) {
    const exact = entries.find((e) => e.src === target.src);
    if (exact) return exact;
  }
  const t = target.time;
  if (t === null || !Number.isFinite(t)) return null;
  if (target.near) return closestEntry(entries, t);
  let before: T | null = null;
  let after: T | null = null;
  for (const e of entries) {
    const ms = e.dtMs;
    if (typeof ms !== "number" || !Number.isFinite(ms)) continue;
    if (ms <= t) {
      if (!before || ms > (before.dtMs as number)) before = e;
    } else if (!after || ms < (after.dtMs as number)) {
      after = e;
    }
  }
  return before ?? after;
}

/** The item closest in time to `t` (the earlier of two equally close), or null. */
export function closestEntry<T extends TargetEntry>(entries: readonly T[], t: number): T | null {
  let best: T | null = null;
  let gap = Infinity;
  for (const e of entries) {
    const ms = e.dtMs;
    if (typeof ms !== "number" || !Number.isFinite(ms)) continue;
    const g = Math.abs(ms - t);
    if (g < gap || (g === gap && best && ms < (best.dtMs as number))) {
      gap = g;
      best = e;
    }
  }
  return best;
}

/** The index in `list` of `entry`, else of the item closest in time to it; -1 when the list is empty. */
export function indexOfTarget(list: readonly TargetEntry[], entry: TargetEntry): number {
  const i = list.findIndex((x) => x.src === entry.src);
  if (i >= 0 || typeof entry.dtMs !== "number" || !Number.isFinite(entry.dtMs)) return i;
  let best = -1;
  let bestGap = Infinity;
  list.forEach((x, k) => {
    if (typeof x.dtMs !== "number" || !Number.isFinite(x.dtMs)) return;
    const gap = Math.abs(x.dtMs - (entry.dtMs as number));
    if (gap < bestGap) {
      bestGap = gap;
      best = k;
    }
  });
  return best;
}

/** `href` without the deep-link parameters (other parameters and the fragment stay). */
export function withoutDeepLinkParams(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  for (const p of DEEP_LINK_PARAMS) url.searchParams.delete(p);
  return url.toString();
}
