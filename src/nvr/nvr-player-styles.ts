import { css } from "lit";

/** BL-008: the NVR player layer (covers its container: the gallery viewer or the timeline's full view). */
export const nvrPlayerStyles = css`
  :host {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: block;
    overflow: hidden;
    border-radius: inherit;
    background: #000;
    color: #fff;
    font-size: 13px;
    --nvr-bar-h: 40px;
  }
  .nvr {
    position: absolute;
    inset: 0;
  }
  /* The bar has its own strip, so it never covers the video's native controls (iOS puts some at the top). */
  .nvr-video {
    position: absolute;
    top: var(--nvr-bar-h);
    left: 0;
    width: 100%;
    height: calc(100% - var(--nvr-bar-h));
    object-fit: contain;
    background: #000;
  }
  .nvr-wait {
    position: absolute;
    top: var(--nvr-bar-h);
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000 center / contain no-repeat;
  }
  .nvr-wait::before {
    content: "";
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
  }
  .nvr-box {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 8px;
    max-width: 86%;
    padding: 12px 16px;
    text-align: center;
    font-weight: 700;
    line-height: 1.35;
  }
  .nvr-box.error ha-icon {
    --mdc-icon-size: 28px;
    color: #ffb74d;
  }
  .nvr-spin {
    width: 26px;
    height: 26px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: nvr-spin 0.9s linear infinite;
  }
  @keyframes nvr-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .nvr-progress {
    width: min(260px, 60vw);
    height: 4px;
    overflow: hidden;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.25);
  }
  .nvr-progress > div {
    height: 100%;
    background: var(--primary-color, #03a9f4);
    transition: width 0.3s;
  }
  .nvr-detail {
    font-size: 12px;
    font-weight: 600;
    opacity: 0.85;
    font-variant-numeric: tabular-nums;
  }
  .nvr-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .nvr-actions button {
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .nvr-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: var(--nvr-bar-h);
    padding: 0 8px;
    box-sizing: border-box;
    background: #000;
    display: flex;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }
  .nvr-bar > * {
    pointer-events: auto;
  }
  .nvr-tag,
  .nvr-clock {
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }
  .nvr-tag ha-icon {
    --mdc-icon-size: 16px;
    color: #ef5350;
  }
  .nvr-clock {
    font-variant-numeric: tabular-nums;
  }
  .nvr-res {
    margin-left: auto;
    display: inline-flex;
    padding: 2px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
  }
  .nvr-res button {
    height: 24px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }
  .nvr-res button.on {
    background: var(--primary-color, #03a9f4);
  }
  .nvr-close {
    width: 28px;
    height: 28px;
    flex: none;
    border: 0;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    cursor: pointer;
  }
  .nvr-close ha-icon {
    --mdc-icon-size: 18px;
  }
`;
