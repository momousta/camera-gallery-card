import { html } from "lit";

import {
  firstWeekdayFor,
  monthGrid,
  monthOf,
  monthRange,
  shiftMonth,
  weekdayLabels,
} from "../data/calendar";
import { dayKeyFromMs } from "../data/datetime-parsing";
import { formatDay, formatMonth } from "../util/locale";

/**
 * The month calendar both cards open from their date (BL-006, BL-007). Days in `days` can be picked, the others
 * are greyed out; the arrows move between the months that have days. Style it with `calendarPickerStyles`.
 *
 * @param {object} o
 * @param {readonly string[]} o.days          days with media (`YYYY-MM-DD`), any order
 * @param {string} o.month                   month shown (`YYYY-MM`); "" = the selected day's month
 * @param {string|null} o.selected           the day shown now
 * @param {object|undefined} o.locale        `hass.locale`
 * @param {(month: string) => void} o.onMonth
 * @param {(day: string) => void} o.onPick
 * @param {() => void} o.onClose
 */
export function renderCalendarPicker({ days, month, selected, locale, onMonth, onPick, onClose }) {
  const have = new Set(days);
  const range = monthRange(days);
  const shown = month || monthOf(selected || "") || range?.max || "";
  if (!shown) return html``;
  const lang = locale?.language;
  const firstWeekday = firstWeekdayFor(locale?.first_weekday, lang);
  const today = dayKeyFromMs(Date.now()) || "";
  const weeks = monthGrid(shown, firstWeekday, { hasMedia: (d) => have.has(d), today, selected });
  const canPrev = !!range && shown > range.min;
  const canNext = !!range && shown < range.max;
  const title = formatMonth(shown, locale);

  return html`
    <div class="cal-backdrop" @click=${() => onClose()}></div>
    <div
      class="cal-picker"
      role="dialog"
      aria-label="Pick a date"
      @click=${(e) => e.stopPropagation()}
    >
      <div class="cal-head">
        <button
          class="cal-nav"
          ?disabled=${!canPrev}
          @click=${() => onMonth(shiftMonth(shown, -1))}
          title="Previous month"
          aria-label="Previous month"
        >
          <ha-icon icon="mdi:chevron-left"></ha-icon>
        </button>
        <div class="cal-title">${title}</div>
        <button
          class="cal-nav"
          ?disabled=${!canNext}
          @click=${() => onMonth(shiftMonth(shown, 1))}
          title="Next month"
          aria-label="Next month"
        >
          <ha-icon icon="mdi:chevron-right"></ha-icon>
        </button>
        <button class="cal-close" @click=${() => onClose()} title="Close" aria-label="Close">
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="cal-grid" role="grid" aria-label=${title}>
        ${weekdayLabels(firstWeekday, lang).map(
          (w) => html`<div class="cal-wd" aria-hidden="true">${w}</div>`
        )}
        ${weeks
          .flat()
          .map((c) =>
            c.day
              ? html`<button
                  class="cal-day ${c.hasMedia ? "has" : ""} ${c.isSelected ? "on" : ""} ${c.isToday
                    ? "today"
                    : ""}"
                  ?disabled=${!c.hasMedia}
                  aria-pressed=${c.isSelected ? "true" : "false"}
                  aria-label=${formatDay(c.day, locale)}
                  @click=${() => onPick(c.day)}
                >
                  ${c.date}
                </button>`
              : html`<div class="cal-blank" aria-hidden="true"></div>`
          )}
      </div>
    </div>
  `;
}
