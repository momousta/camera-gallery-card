/**
 * Owner fork: the camera's floodlight and siren buttons, drawn over the picture at its bottom left (the full screen
 * button has the bottom right) by both the gallery (snapshots, GIFs, clips, live) and the NVR player (recordings,
 * and pictures full screen), so they look and behave the same everywhere.
 *
 * An action: { id: "floodlight" | "siren", icon, label, active (on / sounding), armed (the siren's first tap:
 * a second one within SIREN_ARM_MS sounds it), disabled (the entity is unavailable) }.
 */

import { css, html } from "lit";

/** A siren needs a second tap within this long (an accidental tap doesn't wake the street). */
export const SIREN_ARM_MS = 3000;
/** How long a siren sounds unless stopped (the Reolink siren takes a duration). */
export const SIREN_DEFAULT_S = 10;

/** The actions of a camera from its entities' states; `siren` is { until, armedUntil } (epoch ms). */
export function cameraActions(states, { floodlight, siren }, sirenState = {}, now = Date.now()) {
  const out = [];
  const fl = floodlight ? states?.[floodlight] : null;
  if (fl) {
    const on = fl.state === "on";
    out.push({
      id: "floodlight",
      icon: on ? "mdi:flashlight" : "mdi:flashlight-off",
      label: on ? "Turn the floodlight off" : "Turn the floodlight on",
      active: on,
      disabled: fl.state === "unavailable",
    });
  }
  const si = siren ? states?.[siren] : null;
  if (si) {
    const sounding = (sirenState.until || 0) > now || si.state === "on";
    const armed = !sounding && (sirenState.armedUntil || 0) > now;
    out.push({
      id: "siren",
      icon: sounding ? "mdi:alarm-light" : "mdi:alarm-light-outline",
      label: sounding ? "Stop the siren" : armed ? "Tap again to sound the siren" : "Siren",
      active: sounding,
      armed,
      disabled: si.state === "unavailable",
    });
  }
  return out;
}

/** The buttons; `onAction(id)` on a press. Taps never reach the picture under them. */
export function renderCameraActions(actions, onAction, { visible = true, cls = "" } = {}) {
  if (!actions?.length) return "";
  const stop = (e) => e.stopPropagation();
  return html`<div
    class="cam-acts ${visible ? "visible" : ""} ${cls}"
    @pointerdown=${stop}
    @pointerup=${stop}
  >
    ${actions.map(
      (a) =>
        html`<button
          class="cam-act ${a.id} ${a.active ? "on" : ""} ${a.armed ? "armed" : ""}"
          title=${a.label}
          aria-label=${a.label}
          aria-pressed=${a.active ? "true" : "false"}
          ?disabled=${!!a.disabled}
          @pointerdown=${stop}
          @pointerup=${stop}
          @touchstart=${{ handleEvent: stop, passive: true }}
          @touchend=${stop}
          @click=${(e) => {
            e.stopPropagation();
            onAction(a.id);
          }}
        >
          <ha-icon icon=${a.icon}></ha-icon>${a.armed
            ? html`<span class="cam-act-hint">Tap again</span>`
            : ""}
        </button>`
    )}
  </div>`;
}

export const cameraActionStyles = css`
  .cam-acts {
    position: absolute;
    left: 8px;
    bottom: 6px;
    z-index: 12;
    display: flex;
    gap: 8px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }
  .cam-acts.visible {
    opacity: 1;
    pointer-events: auto;
  }
  .cam-act {
    height: 28px;
    min-width: 28px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    --mdc-icon-size: 18px;
    -webkit-tap-highlight-color: transparent;
  }
  .cam-act:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .cam-act.floodlight.on {
    background: #fdd835;
    color: #222;
  }
  .cam-act.siren.armed {
    padding: 0 10px 0 6px;
    background: rgba(229, 57, 53, 0.85);
  }
  .cam-act.siren.on {
    background: #e53935;
    animation: cam-act-pulse 0.8s ease-in-out infinite alternate;
  }
  @keyframes cam-act-pulse {
    from {
      box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.7);
    }
    to {
      box-shadow: 0 0 0 8px rgba(229, 57, 53, 0);
    }
  }
`;
