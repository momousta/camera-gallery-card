/**
 * Locale resolution and locale-aware formatting helpers.
 *
 * Splits cleanly from `data/datetime-parsing`: that module is pure parsing
 * (no `Intl`, no locale dependency); this one owns everything that asks the
 * user's locale to format a result.
 */

import type { FrontendLocaleData, HomeAssistant } from "../types/hass";

// Building an Intl.DateTimeFormat is expensive (tenths of a ms, more on
// phones) and the strip formats one time label per thumbnail on every render,
// so formatters and the 12/24-hour probe are created once per locale/options.
const DTF_CACHE = new Map<string, Intl.DateTimeFormat>();
const DTF_CACHE_MAX = 64;
const AMPM_CACHE = new Map<string, boolean>();

function dateTimeFormat(
  key: string,
  lang: string | undefined,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const k = `${key}|${lang ?? ""}`;
  let f = DTF_CACHE.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(lang, options);
    if (DTF_CACHE.size >= DTF_CACHE_MAX) DTF_CACHE.clear();
    DTF_CACHE.set(k, f);
  }
  return f;
}

/**
 * Resolves the user's preferred language code (BCP 47) for `Intl` APIs and
 * `String.prototype.localeCompare`. Returns `undefined` when nothing useful
 * is configured — callers should treat that as "use the runtime default."
 *
 * Order of preference:
 *  1. `hass.locale` (legacy string form, predates `FrontendLocaleData`)
 *  2. `hass.locale.language`
 *  3. `hass.language` (top-level on older HA builds)
 *  4. `navigator.language`
 */
export function resolveLocale(hass: HomeAssistant | undefined): string | undefined {
  const hassLocale = hass?.locale as FrontendLocaleData | string | undefined;
  if (typeof hassLocale === "string" && hassLocale.trim()) {
    return hassLocale.trim();
  }
  if (
    hassLocale &&
    typeof hassLocale === "object" &&
    typeof hassLocale.language === "string" &&
    hassLocale.language.trim()
  ) {
    return hassLocale.language.trim();
  }
  const hassLanguage = (hass as { language?: unknown } | undefined)?.language;
  if (typeof hassLanguage === "string" && hassLanguage.trim()) {
    return hassLanguage.trim();
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return undefined;
}

/**
 * Mirrors HA frontend's 12/24-hour decision. Reads `time_format`:
 *  - `"24"` → 24-hour
 *  - `"12"` → 12-hour
 *  - `"language"` → probe the language with `toLocaleString` and look for AM/PM
 *  - anything else → probe the runtime default
 */
export function useAmPm(locale: FrontendLocaleData | undefined): boolean {
  const tf = locale?.time_format;
  if (tf === "24") return false;
  if (tf === "12") return true;
  const probe = tf === "language" ? locale?.language : undefined;
  const key = `${tf ?? ""}|${probe ?? ""}`;
  const cached = AMPM_CACHE.get(key);
  if (cached !== undefined) return cached;
  let ampm: boolean;
  try {
    ampm = /AM|PM/i.test(new Date().toLocaleString(probe));
  } catch {
    ampm = false;
  }
  AMPM_CACHE.set(key, ampm);
  return ampm;
}

export function formatDateTime(dtKey: string, locale: FrontendLocaleData | undefined): string {
  if (!dtKey) return "";
  try {
    const d = new Date(dtKey);
    const lang = locale?.language;
    const date = dateTimeFormat("dmy", lang, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
    const hour12 = useAmPm(locale);
    const time = dateTimeFormat(`hm${hour12 ? 12 : 24}`, lang, {
      hour: "2-digit",
      minute: "2-digit",
      hour12,
    }).format(d);
    return `${date} • ${time}`;
  } catch {
    return dtKey;
  }
}

export function formatMonth(monthKey: string, locale: FrontendLocaleData | undefined): string {
  if (!monthKey) return "";
  try {
    return dateTimeFormat("my", locale?.language, {
      month: "long",
      year: "numeric",
    }).format(new Date(`${monthKey}-01T00:00:00`));
  } catch {
    return monthKey;
  }
}

export function formatDay(dayKey: string, locale: FrontendLocaleData | undefined): string {
  if (!dayKey) return "";
  try {
    return dateTimeFormat("dm", locale?.language, {
      day: "numeric",
      month: "long",
    }).format(new Date(`${dayKey}T00:00:00`));
  } catch {
    return dayKey;
  }
}

export function formatTimeFromMs(ms: number, locale: FrontendLocaleData | undefined): string {
  if (!Number.isFinite(ms)) return "";
  try {
    const hour12 = useAmPm(locale);
    return dateTimeFormat(`hm${hour12 ? 12 : 24}`, locale?.language, {
      hour: "2-digit",
      minute: "2-digit",
      hour12,
    }).format(new Date(ms));
  } catch {
    return "";
  }
}
