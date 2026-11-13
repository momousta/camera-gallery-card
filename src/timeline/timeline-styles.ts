import { css } from "lit";

export const timelineStyles = css`
  :host {
    display: block;
    position: relative;
    --tl-gap: 8px;
    --tl-lane-h: 7px;
    /* Event colours of the track's marks. */
    --tl-k-person: #ff9800;
    --tl-k-car: #42a5f5;
    --tl-k-dog: #66bb6a;
    --tl-k-visitor: #ab47bc;
    --tl-k-motion: #9e9e9e;
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
  .tl-camera {
    position: relative;
    min-width: 0;
  }
  .tl-app {
    position: absolute;
    right: 6px;
    top: 6px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    z-index: 2;
    touch-action: manipulation;
    &.icon {
      width: 40px;
      height: 40px;
      min-width: 40px;
    }
    /* A finger-sized target (48 px) around the visible circle. */
    &::before {
      content: "";
      position: absolute;
      inset: -4px;
    }
  }
  @media (min-width: 900px) {
    .tl-grid {
      grid-template-columns: repeat(var(--tl-cols-wide, 4), minmax(0, 1fr));
    }
  }

  .tl-tile {
    display: block;
    position: relative;
    width: 100%;
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
  /* A picture still loading: hidden after a quarter second (a cached one shows at once), with a spinner. */
  .tl-tile .tl-img.loading {
    opacity: 0;
    transition: opacity 0s 0.25s;
  }
  .tl-spin {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 28px;
    height: 28px;
    margin: -17px 0 0 -17px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    opacity: 0;
    pointer-events: none;
    animation:
      tl-spin 0.9s linear infinite,
      tl-spin-in 0.2s ease 0.25s forwards;
  }
  @keyframes tl-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes tl-spin-in {
    to {
      opacity: 1;
    }
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
    background: var(--tl-k-motion);
    opacity: 0.8;

    &.k-person {
      background: var(--tl-k-person);
      opacity: 1;
    }
    &.k-car {
      background: var(--tl-k-car);
      opacity: 1;
    }
    &.k-dog {
      background: var(--tl-k-dog);
      opacity: 1;
    }
    &.k-visitor {
      background: var(--tl-k-visitor);
      opacity: 1;
    }
  }
`;
