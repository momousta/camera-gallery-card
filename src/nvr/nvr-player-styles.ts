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
  /* The window-covering full screen (an iPhone): above the page, unclipped. */
  :host([pseudo]) {
    z-index: 2147483000;
    overflow: visible;
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
  .nvr-stage {
    overflow: hidden; /* a zoomed picture stays in its frame */
    container-type: size; /* its width / height for a quarter-turned picture (cqw / cqh) */
  }
  .nvr.fs {
    background: #000;
  }
  /* Full screen where the browser has no element full screen (an iPhone): the player covers the window. */
  .nvr.fs.pseudo {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
  }
  /* Full screen on a portrait screen (an app's WebView can't turn the screen): turn the picture, so it is
     landscape with the phone held sideways. A landscape screen (turned by Chrome, or by the phone) needs nothing. */
  @media (orientation: portrait) {
    .nvr.fs:not(.portrait) .nvr-stage {
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
    transform-origin: center center;
  }
  /* A camera on its side (the add-on's turn for its channel): the video's box is the stage's, swapped, and its
     transform (render) centres and turns it, so it stands upright and fills the stage. */
  .nvr-video[hidden] {
    display: none;
  }
  /* A snapshot or GIF (the gallery's full screen for pictures): drawn like the video; the taps go to .nvr-tap. */
  .nvr-still {
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-user-drag: none;
  }
  .nvr-video.quarter {
    inset: auto;
    left: 50%;
    top: 50%;
    width: 100cqh;
    height: 100cqw;
  }
  /* Taps, double taps (skip), pinch zoom and, zoomed, panning: the page may still scroll vertically over the
     picture, except full screen or zoomed. */
  .nvr-tap {
    position: absolute;
    inset: 0;
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .nvr.fs .nvr-tap,
  .nvr.zoomed .nvr-tap {
    touch-action: none;
  }
  .nvr-skip {
    position: absolute;
    top: 50%;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    font-size: 14px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    transform: translateY(-50%);
    pointer-events: none;
    animation: nvr-skip 0.2s ease-out;
  }
  .nvr-skip.back {
    left: 10%;
  }
  .nvr-skip.fwd {
    right: 10%;
  }
  .nvr-skip ha-icon {
    --mdc-icon-size: 20px;
  }
  @keyframes nvr-skip {
    from {
      opacity: 0;
      transform: translateY(-50%) scale(0.8);
    }
  }
  /* Recording: always on screen (top centre, clear of the zoom chip and Low / High), with the clip's length. */
  .nvr-recchip {
    position: absolute;
    top: 8px;
    left: 50%;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.6);
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
    transform: translateX(-50%);
    pointer-events: none;
  }
  .nvr-recdot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #ef5350;
    animation: nvr-rec 1s ease-in-out infinite alternate;
  }
  @keyframes nvr-rec {
    to {
      opacity: 0.3;
    }
  }
  .nvr-rec.on ha-icon {
    color: #ef5350;
  }
  /* Centred across the whole width (left: 50% would leave it half the width to wrap in). */
  .nvr-toast {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: calc(var(--nvr-bar-h) + 4px); /* just above the seek bar, clear of the play button */
    z-index: 3;
    width: fit-content;
    margin: 0 auto;
    padding: 7px 12px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.72);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    text-align: center;
    overflow-wrap: anywhere;
    pointer-events: none;
  }
  .nvr-toast.err {
    background: rgba(183, 28, 28, 0.88);
  }
  .nvr-flash {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: #fff;
    opacity: 0;
    pointer-events: none;
    animation: nvr-flash 0.35s ease-out;
  }
  @keyframes nvr-flash {
    from {
      opacity: 0.7;
    }
  }
  .nvr-zoom {
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }
  .nvr-zoom ha-icon {
    --mdc-icon-size: 16px;
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
  /* Hidden controls can't be pressed: the tap goes to the picture and shows them. Shown, only the controls
     themselves take taps; the bars' empty parts leave them (and double taps) to the picture. */
  .nvr-ui.shown .nvr-bar > :not(.nvr-gap),
  .nvr-ui.shown .nvr-ctl:not(.nvr-ctl-min),
  .nvr-ui.shown .nvr-ctl-min > *,
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
  .nvr-bar-min {
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
