/**
 * Data for the multi-camera timeline (BL-007): one shared moment, every camera's frame at or just before it.
 *
 * Each camera is a FileTrack-style sensor whose `fileList` holds the gallery files. Times come from the file names
 * (`path_datetime_format`, e.g. `motion_20261019_120000.gif`). Everything here is pure and works in local time,
 * like the rest of the card.
 */

import { dtMsFromSrc } from "../data/datetime-parsing";
import { isTemporaryFilePath, toWebPath } from "../data/sensor-source";

export type EventKind =
  | "person"
  | "car"
  | "dog"
  | "visitor"
  | "motion"
  | "hourly"
  | "still"
  | "other";

export interface TimelineItem {
  src: string;
  ms: number;
  kind: EventKind;
}

const KIND_PREFIXES: readonly (readonly [EventKind, readonly string[]])[] = [
  ["person", ["person", "people", "human"]],
  ["car", ["car", "vehicle"]],
  ["dog", ["dog", "pet", "animal", "cat"]],
  ["visitor", ["visitor", "ding", "ring"]],
  ["motion", ["motion"]],
  ["hourly", ["hourly"]],
  ["still", ["snapshot", "still", "interval"]],
];

/** The kind of event a gallery file shows, from its name's first word (`person_…`, `car_…`, `hourly_…`). */
export function eventKind(src: string): EventKind {
  const name = (src.split("/").pop() ?? "").toLowerCase();
  const word = name.split(/[_\-.\d]/, 1)[0] ?? "";
  for (const [kind, prefixes] of KIND_PREFIXES) if (prefixes.includes(word)) return kind;
  return "other";
}

/** Parse a sensor `fileList` (array, or a JSON string of one) into items sorted by time, oldest first. */
export function buildTrack(fileList: unknown, pathFormat: string): TimelineItem[] {
  let list: unknown = fileList;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [list];
    }
  }
  if (!Array.isArray(list) || !pathFormat) return [];
  const seen = new Set<string>();
  const out: TimelineItem[] = [];
  for (const raw of list) {
    const src = toWebPath(raw);
    if (!src || seen.has(src) || isTemporaryFilePath(src)) continue;
    const ms = dtMsFromSrc(src, { pathFormat });
    if (ms === null || !Number.isFinite(ms)) continue;
    seen.add(src);
    out.push({ src, ms, kind: eventKind(src) });
  }
  out.sort((a, b) => a.ms - b.ms || (a.src < b.src ? -1 : 1));
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight to the next local midnight (23 or 25 hours on daylight-saving days). */
export function dayBounds(dayKey: string): { start: number; end: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const start = new Date(y, mo - 1, d).getTime();
  const end = new Date(y, mo - 1, d + 1).getTime();
  return Number.isFinite(start) && end > start ? { start, end } : null;
}

/** Index of the last item at or before `t` (items sorted by time), or -1. */
export function itemAtOrBefore(items: readonly TimelineItem[], t: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((items[mid] as TimelineItem).ms <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** The items in [start, end). */
export function itemsBetween(
  items: readonly TimelineItem[],
  start: number,
  end: number
): TimelineItem[] {
  const from = itemAtOrBefore(items, start - 1) + 1;
  const to = itemAtOrBefore(items, end - 1) + 1;
  return items.slice(from, to);
}

/** Days that have at least one item on any camera, newest first. */
export function daysWithItems(tracks: readonly (readonly TimelineItem[])[]): string[] {
  const days = new Set<string>();
  for (const items of tracks) for (const it of items) days.add(dayKeyOf(it.ms));
  return [...days].sort().reverse();
}

/** Preload order for a day: every camera's items sorted by distance from `t`, nearest first. */
export function preloadOrder(
  dayItems: readonly (readonly TimelineItem[])[],
  t: number
): TimelineItem[] {
  const all: TimelineItem[] = [];
  for (const items of dayItems) all.push(...items);
  return all.sort((a, b) => Math.abs(a.ms - t) - Math.abs(b.ms - t) || a.ms - b.ms);
}

/** Zoom of the timeline track, in pixels per minute (a day is 1440 minutes): from the whole day fitting the track
 * (`fitPpm`) up to MAX_PPM (a pixel a second: scrubbing slowly). Pinch, Ctrl + wheel and the buttons change it. */
export const MAX_PPM = 60;
export const DEFAULT_PPM = 4;
/** The buttons zoom by this factor. */
export const ZOOM_STEP = 2;

/** Pixels per minute that fit the whole day into `widthPx`. */
export function fitPpm(widthPx: number, dayMs: number = 86_400_000): number {
  if (!(widthPx > 0) || !(dayMs > 0)) return 0.1;
  return widthPx / (dayMs / 60_000);
}

/** `ppm` within [fit, MAX_PPM] (a non-number: the default). */
export function clampPpm(ppm: number, fit: number): number {
  const lo = Math.min(Math.max(fit, 0.05), MAX_PPM);
  const v = Number.isFinite(ppm) && ppm > 0 ? ppm : DEFAULT_PPM;
  return Math.min(MAX_PPM, Math.max(lo, v));
}

export const msToPx = (ms: number, dayStart: number, ppm: number): number =>
  ((ms - dayStart) / 60_000) * ppm;
export const pxToMs = (px: number, dayStart: number, ppm: number): number =>
  dayStart + (px / ppm) * 60_000;

/** Minutes between the track's labels at `ppm`, so they stay about 100-200 px apart. */
export function markStepMin(ppm: number): number {
  if (ppm < 0.6) return 360;
  if (ppm < 2) return 180;
  if (ppm < 12) return 60;
  if (ppm < 30) return 15;
  return 5;
}

/** Label marks for the track: every 6 h zoomed right out, every 3 h, every hour, every 15 or 5 minutes zoomed in.
 * Major: every 6 hours (hours steps), every hour (minute steps). */
export function hourMarks(
  start: number,
  end: number,
  ppm: number
): { ms: number; major: boolean }[] {
  const step = markStepMin(ppm);
  const out: { ms: number; major: boolean }[] = [];
  const d = new Date(start);
  for (let m = 0; ; m += step) {
    const ms = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m).getTime();
    if (ms >= end) break;
    if (ms < start) continue;
    const at = new Date(ms);
    const major = step >= 60 ? at.getHours() % 6 === 0 : at.getMinutes() === 0;
    out.push({ ms, major });
  }
  return out;
}

/** "−12 min", "−1 h 05", or "" when the frame is from the same minute. */
export function ageLabel(ageMs: number): string {
  if (!(ageMs >= 60_000)) return "";
  const min = Math.floor(ageMs / 60_000);
  if (min < 60) return `−${min} min`;
  return `−${Math.floor(min / 60)} h ${pad(min % 60)}`;
}
