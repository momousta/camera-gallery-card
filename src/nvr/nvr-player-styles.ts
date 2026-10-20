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
    transition: opacity 0.15s;
  }
  /* A quiet start loads unseen (the host's picture stays visible) until the video plays. */
  :host([quiet]:not([revealed])) {
    opacity: 0;
    pointer-events: none;
  }
  .nvr,
  .nvr-stage {
    position: absolute;
    inset: 0;
  }
  .nvr.fs {
    background: #000;
  }
  /* Full screen on a portrait screen (an app's WebView can't turn the screen): turn the picture, so it is
     landscape with the phone held sideways. A landscape screen (turned by Chrome, or by the phone) needs nothing. */
  @media (orientation: portrait) {
    .nvr.fs .nvr-stage {
      inset: auto;
      top: 50%;
      left: 50%;
      width: 100vh;
      height: 100vw;
      transform: translate(-50%, -50%) rotate(var(--nvr-rot, 90deg));
      touch-action: none;
    }
  }
  /* The video fills the player; the controls lie over it and hide while it plays (a tap brings them back). */
  .nvr-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }
  .nvr-tap {
    position: absolute;
    inset: 0;
    -webkit-tap-highlight-color: transparent;
  }
  .nvr-wait {
    position: absolute;
    inset: 0;
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
  .nvr-ui {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .nvr-ui.shown {
    opacity: 1;
  }
  /* Hidden controls can't be pressed: the tap goes to the picture and shows them. */
  .nvr-ui.shown .nvr-bar,
  .nvr-ui.shown .nvr-ctl,
  .nvr-ui.shown .nvr-big {
    pointer-events: auto;
  }
  .nvr-bar,
  .nvr-ctl {
    position: absolute;
    left: 0;
    right: 0;
    height: var(--nvr-bar-h);
    padding: 0 8px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .nvr-bar {
    top: 0;
    background: linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0));
  }
  .nvr-ctl {
    bottom: 0;
    background: linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.6));
  }
  .nvr-ctl-min {
    justify-content: flex-end;
    background: none;
  }
  .nvr-big {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 56px;
    height: 56px;
    transform: translate(-50%, -50%);
    border: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    cursor: pointer;
  }
  .nvr-big ha-icon {
    --mdc-icon-size: 34px;
  }
  .nvr-time {
    flex: none;
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
  }
  /* The seek bar handles its own drag (along its axis, also when the picture is turned): no browser panning. */
  .nvr-seek {
    position: relative;
    flex: 1;
    align-self: stretch;
    min-width: 40px;
    display: flex;
    align-items: center;
    touch-action: none;
    cursor: pointer;
    outline: none;
  }
  .nvr-seek-track {
    position: relative;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.3);
  }
  .nvr-seek.drag .nvr-seek-track {
    height: 6px;
  }
  .nvr-seek-buf,
  .nvr-seek-fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
  }
  .nvr-seek-buf {
    background: rgba(255, 255, 255, 0.45);
  }
  .nvr-seek-fill {
    background: var(--primary-color, #03a9f4);
  }
  .nvr-seek-thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .nvr-seek:focus-visible .nvr-seek-thumb {
    box-shadow: 0 0 0 3px var(--primary-color, #03a9f4);
  }
  .nvr-seek-tip {
    position: absolute;
    bottom: calc(100% - 4px);
    transform: translateX(-50%);
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.75);
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
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
  .nvr-gap {
    margin-left: auto;
  }
  .nvr-icon {
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
  .nvr-icon ha-icon {
    --mdc-icon-size: 18px;
  }
`;
