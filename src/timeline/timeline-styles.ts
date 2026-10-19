import { css } from "lit";

export const timelineStyles = css`
  :host {
    display: block;
    position: relative;
    --tl-gap: 8px;
    --tl-lane-h: 7px;
    color: var(--primary-text-color);
  }

  .tl-root {
    display: flex;
    flex-direction: column;
    gap: var(--tl-gap);
    padding: 8px;
    box-sizing: border-box;
  }

  .tl-empty-all {
    padding: 24px;
    text-align: center;
    opacity: 0.7;
  }

  /* ── header ──────────────────────────────────────────────── */
  .tl-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .tl-date,
  .tl-ctrls {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tl-time {
    font-size: 22px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }
  .tl-btn {
    height: 36px;
    min-width: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: var(--secondary-background-color, rgba(127, 127, 127, 0.16));
    color: var(--primary-text-color);
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    white-space: nowrap;

    &.icon {
      padding: 0;
      width: 36px;
    }
    &:disabled {
      opacity: 0.35;
      cursor: default;
    }
    &.on {
      background: var(--primary-color, #2196f3);
      color: var(--text-primary-color, #fff);
    }
    & ha-icon {
      --mdc-icon-size: 20px;
    }
  }

  /* ── camera grid ─────────────────────────────────────────── */
  .tl-grid {
    display: grid;
    grid-template-columns: repeat(var(--tl-cols, 2), minmax(0, 1fr));
    gap: var(--tl-gap);
  }
  @media (min-width: 900px) {
    .tl-grid {
      grid-template-columns: repeat(var(--tl-cols-wide, 4), minmax(0, 1fr));
    }
  }

  .tl-tile {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    overflow: hidden;
    border: 0;
    padding: 0;
    margin: 0;
    background: #000;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    color: #fff;
    font: inherit;
    text-align: left;
  }
  .tl-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    transition: opacity 0.2s;
  }
  .tl-tile.stale .tl-img {
    opacity: 0.45;
  }
  .tl-empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 12px;
    opacity: 0.6;
  }
  .tl-label {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    pointer-events: none;
  }
  .tl-label.top {
    top: 0;
    background: linear-gradient(rgba(0, 0, 0, 0.55), transparent);
  }
  .tl-label.bottom {
    bottom: 0;
    justify-content: space-between;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
    font-variant-numeric: tabular-nums;
  }
  .tl-age {
    opacity: 0.8;
    font-weight: 600;
  }
  .tl-kind {
    --mdc-icon-size: 16px;
  }

  /* ── time track ──────────────────────────────────────────── */
  .tl-track-wrap {
    position: sticky;
    bottom: 0;
    z-index: 5;
    border-radius: 12px;
    background: var(--card-background-color, rgba(24, 24, 28, 0.96));
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }
  .tl-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    margin-left: -1px;
    background: var(--primary-color, #2196f3);
    z-index: 2;
    pointer-events: none;
  }
  .tl-scroll {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x;
    cursor: grab;

    &::-webkit-scrollbar {
      display: none;
    }
    &.dragging {
      cursor: grabbing;
    }
  }
  .tl-track {
    position: relative;
    height: calc(30px + var(--tl-lanes, 8) * (var(--tl-lane-h) + 2px) + 8px);
  }
  .tl-hour {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--divider-color, rgba(255, 255, 255, 0.12));

    & span {
      position: absolute;
      top: 6px;
      left: 4px;
      font-size: 11px;
      font-weight: 700;
      opacity: 0.55;
      white-space: nowrap;
    }
    &.major {
      background: var(--secondary-text-color, rgba(255, 255, 255, 0.3));
    }
    &.major span {
      opacity: 0.85;
    }
  }
  .tl-now-edge {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: rgba(244, 67, 54, 0.7);
  }
  .tl-lane {
    position: absolute;
    left: 0;
    right: 0;
    height: var(--tl-lane-h);
  }
  .tl-mark {
    position: absolute;
    top: 0;
    width: 3px;
    height: 100%;
    border-radius: 2px;
    background: #9e9e9e;
    opacity: 0.8;

    &.k-person {
      background: #ff9800;
      opacity: 1;
    }
    &.k-car {
      background: #42a5f5;
      opacity: 1;
    }
    &.k-dog {
      background: #66bb6a;
      opacity: 1;
    }
    &.k-visitor {
      background: #ab47bc;
      opacity: 1;
    }
  }

  /* ── full-size view of one camera ─────────────────────────── */
  .tl-overlay-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(0, 0, 0, 0.8);
  }
  .tl-overlay {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 31;
    width: min(96vw, 1100px);
    display: grid;
    gap: 8px;
    color: #fff;
  }
  .tl-overlay-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-weight: 800;
  }
  .tl-overlay-actions {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }
  /* BL-008: the NVR player fills this box. */
  .tl-overlay-nvr {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 75vh;
    overflow: hidden;
    border-radius: 12px;
    background: #000;
  }
  .tl-overlay-media {
    width: 100%;
    max-height: 75vh;
    aspect-ratio: 16 / 9;
    object-fit: contain;
    background: #000 center / contain no-repeat;
    border-radius: 12px;
  }
`;
