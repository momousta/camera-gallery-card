import { css } from "lit";

/** Styles of `renderCalendarPicker`: an overlay centred in the host, which must be `position: relative`. */
export const calendarPickerStyles = css`
  .cal-backdrop {
    position: absolute;
    inset: 0;
    z-index: 23;
    background: rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  .cal-picker {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 24;
    width: min(92%, 360px);
    max-height: min(92%, 460px);
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    border-radius: 18px;
    background: var(--card-background-color, rgba(24, 24, 28, 0.96));
    border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
    color: var(--primary-text-color);
  }

  .cal-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
  }

  .cal-title {
    flex: 1 1 auto;
    min-width: 0;
    text-align: center;
    font-size: 15px;
    font-weight: 900;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cal-nav,
  .cal-close {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: 0;
    padding: 0;
    display: grid;
    place-items: center;
    background: var(--secondary-background-color, rgba(127, 127, 127, 0.16));
    color: var(--primary-text-color);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    & ha-icon {
      --mdc-icon-size: 20px;
    }
    &:disabled {
      opacity: 0.3;
      cursor: default;
    }
  }

  .cal-grid {
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
    padding: 8px 12px 14px;
  }

  .cal-wd {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    opacity: 0.5;
    padding: 2px 0 4px;
  }

  .cal-day,
  .cal-blank {
    min-height: 34px;
  }

  .cal-day {
    aspect-ratio: 1;
    border: 0;
    border-radius: 999px;
    padding: 0;
    display: grid;
    place-items: center;
    background: transparent;
    color: var(--primary-text-color);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &:disabled {
      opacity: 0.28;
      font-weight: 400;
      cursor: default;
    }
    &.has {
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.16));
    }
    &.has:hover {
      background: rgba(var(--rgb-primary-color, 33, 150, 243), 0.22);
    }
    &.today {
      box-shadow: inset 0 0 0 1.5px var(--primary-color, #2196f3);
    }
    &.on {
      background: var(--primary-color, #2196f3);
      color: var(--text-primary-color, #fff);
    }
  }
`;
