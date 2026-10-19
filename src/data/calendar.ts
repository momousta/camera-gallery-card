/**
 * Month grid for the date picker (BL-006): tap the date and pick a day from a calendar instead of stepping day by
 * day. Day keys are `YYYY-MM-DD` and months `YYYY-MM`. All arithmetic is on calendar numbers, via UTC dates, so
 * time zones and daylight-saving changes can't shift a day.
 */

export interface CalendarCell {
  /** `YYYY-MM-DD`, or null for the blanks before the 1st and after the last day. */
  day: string | null;
  date: number;
  hasMedia: boolean;
  isToday: boolean;
  isSelected: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function monthOf(day: string): string {
  return /^\d{4}-\d{2}/.test(day) ? day.slice(0, 7) : "";
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return month;
  const d = new Date(Date.UTC(y as number, (m as number) - 1 + Math.trunc(delta), 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** The first and last months that have a day in `days` (any order). */
export function monthRange(days: readonly string[]): { min: string; max: string } | null {
  let min = "";
  let max = "";
  for (const day of days) {
    const m = monthOf(day);
    if (!m) continue;
    if (!min || m < min) min = m;
    if (!max || m > max) max = m;
  }
  return min ? { min, max } : null;
}

/**
 * Weeks of 7 cells for `month`, starting on `firstWeekday` (0 = Sunday … 6 = Saturday). Cells outside the month
 * are blanks (`day: null`).
 */
export function monthGrid(
  month: string,
  firstWeekday: number,
  opts: { hasMedia: (day: string) => boolean; today: string; selected: string | null }
): CalendarCell[][] {
  const [y, m] = month.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return [];
  const first = new Date(Date.UTC(y as number, (m as number) - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y as number, m as number, 0)).getUTCDate();
  const lead = (first - (((firstWeekday % 7) + 7) % 7) + 7) % 7;
  const cells: CalendarCell[] = [];
  const blank = (): CalendarCell => ({
    day: null,
    date: 0,
    hasMedia: false,
    isToday: false,
    isSelected: false,
  });
  for (let i = 0; i < lead; i++) cells.push(blank());
  for (let date = 1; date <= daysInMonth; date++) {
    const day = `${month}-${pad(date)}`;
    cells.push({
      day,
      date,
      hasMedia: opts.hasMedia(day),
      isToday: day === opts.today,
      isSelected: day === opts.selected,
    });
  }
  while (cells.length % 7) cells.push(blank());
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * The first day of the week (0 = Sunday) from HA's profile setting (`hass.locale.first_weekday`: a weekday name or
 * "language"), else from the language's week info, else Sunday.
 */
export function firstWeekdayFor(setting: unknown, language: string | undefined): number {
  const named = typeof setting === "string" ? WEEKDAYS.indexOf(setting.toLowerCase()) : -1;
  if (named >= 0) return named;
  try {
    const loc = new Intl.Locale(language || "en-US") as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info && Number.isFinite(info.firstDay)) return info.firstDay % 7;
  } catch {
    // unknown tag or no Intl.Locale: fall through
  }
  return 0;
}

/** Narrow weekday labels in grid order, e.g. S M T W T F S. */
export function weekdayLabels(firstWeekday: number, language: string | undefined): string[] {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat(language || "en-US", { weekday: "narrow", timeZone: "UTC" });
  } catch {
    fmt = new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" });
  }
  // 2024-01-07 was a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(Date.UTC(2024, 0, 7 + ((firstWeekday + i) % 7))))
  );
}
