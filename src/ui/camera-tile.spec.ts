// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Owner 10-21: the Cameras page's live tiles, in the gallery's design.

beforeAll(async () => {
  vi.stubGlobal("__VERSION__", "test-local");
  await import("../tile/camera-tile-card.js");
  // HA's camera player: a stand-in element (the tile only creates and feeds it).
  if (!customElements.get("ha-camera-stream"))
    customElements.define("ha-camera-stream", class extends HTMLElement {});
});

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/main-dashboard/cameras");
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as any).requestFullscreen;
  delete (document as any).fullscreenElement;
  delete (document as any).exitFullscreen;
});

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({
  entity_id,
  state,
  attributes,
});
const STATES = {
  "camera.fr_sub": st("camera.fr_sub", "streaming", { friendly_name: "Front right Fluent" }),
  "camera.door": st("camera.door", "idle", {
    entity_picture: "/api/camera_proxy/camera.door?token=t",
  }),
  "light.fr_flood": st("light.fr_flood", "off"),
  "siren.fr_siren": st("siren.fr_siren", "unknown"),
  "binary_sensor.fr_person": st("binary_sensor.fr_person", "off"),
};
const CFG = {
  type: "custom:camera-tile-card",
  entity: "camera.fr_sub",
  name: "Front Right",
  navigation_path: "/main-dashboard/front-right",
  floodlight_entity: "light.fr_flood",
  siren_entity: "siren.fr_siren",
  detections: [{ entity: "binary_sensor.fr_person", label: "Person", icon: "mdi:walk" }],
};

async function tile(config: Record<string, unknown> = {}, states: Record<string, any> = STATES) {
  const el: any = document.createElement("camera-tile-card");
  el.setConfig({ ...CFG, ...config });
  const calls: any[] = [];
  el.hass = { states, callService: vi.fn(async (...a: any[]) => calls.push(a)) };
  document.body.append(el);
  await el.updateComplete;
  await vi.advanceTimersByTimeAsync(0);
  await el.updateComplete;
  return { el, calls };
}
const $ = (el: any, sel: string) => el.shadowRoot.querySelector(sel);
const ptr = (type: string, id: number, x: number, y: number): any => {
  const e: any = new MouseEvent(type, {
    bubbles: true,
    composed: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(e, "pointerId", { value: id });
  Object.defineProperty(e, "pointerType", { value: "touch" });
  return e;
};
let ids = 1;
const tapAt = (el: any, x: number, y: number) => {
  const id = ids++;
  $(el, ".tap").dispatchEvent(ptr("pointerdown", id, x, y));
  $(el, ".tap").dispatchEvent(ptr("pointerup", id, x, y));
};
const swipe = (el: any, x0: number, x1: number, y = 100) => {
  const id = ids++;
  $(el, ".tap").dispatchEvent(ptr("pointerdown", id, x0, y));
  $(el, ".tap").dispatchEvent(ptr("pointermove", id, (x0 + x1) / 2, y));
  $(el, ".tap").dispatchEvent(ptr("pointerup", id, x1, y));
};

describe("<camera-tile-card>", () => {
  it("shows the live stream (HA's player, whole picture), the name, and its shape", async () => {
    const { el } = await tile({ aspect_ratio: "9:16" });
    const p = $(el, ".stream ha-camera-stream");
    expect(p).not.toBeNull();
    expect(p.stateObj).toBe(STATES["camera.fr_sub"]);
    expect(p.muted).toBe(true);
    expect($(el, ".name").textContent.trim()).toBe("Front Right");
    expect($(el, ".tile").getAttribute("style")).toContain("aspect-ratio:9/16");
  });

  it("the gallery's floodlight and siren buttons, with the same two-tap siren", async () => {
    const { el, calls } = await tile();
    $(el, ".cam-act.floodlight").click();
    expect(calls[0]).toEqual(["light", "turn_on", { entity_id: "light.fr_flood" }]);
    $(el, ".cam-act.siren").click();
    await el.updateComplete;
    expect(calls).toHaveLength(1); // armed
    expect($(el, ".cam-act.siren").textContent).toContain("Tap again");
    $(el, ".cam-act.siren").click();
    expect(calls[1]).toEqual(["siren", "turn_on", { entity_id: "siren.fr_siren", duration: 10 }]);
  });

  it("a detection chip only while it is on", async () => {
    const { el } = await tile();
    expect($(el, ".det")).toBeNull();
    el.hass = {
      ...el.hass,
      states: { ...STATES, "binary_sensor.fr_person": st("binary_sensor.fr_person", "on") },
    };
    await el.updateComplete;
    expect($(el, ".det").textContent.trim()).toBe("Person");
  });

  it("a tap on the picture opens the camera's page (Back returns: the entry knows where it came from)", async () => {
    const { el } = await tile();
    const nav = vi.fn();
    window.addEventListener("location-changed", nav);
    tapAt(el, 100, 100);
    expect(window.location.pathname).toBe("/main-dashboard/front-right");
    expect(window.history.state).toEqual({ from: "/main-dashboard/cameras" });
    expect(nav).toHaveBeenCalledTimes(1);
    window.removeEventListener("location-changed", nav);
  });

  it("a still that refreshes every 10 s for a camera that isn't live (the doorbell)", async () => {
    const { el } = await tile({ entity: "camera.door", live: false });
    expect($(el, "ha-camera-stream")).toBeNull();
    const first = $(el, "img.still").getAttribute("src");
    expect(first).toMatch(/^\/api\/camera_proxy\/camera\.door\?token=t&_t=\d+$/);
    const loads: any[] = [];
    vi.stubGlobal(
      "Image",
      class {
        onload: any = null;
        src = "";
        constructor() {
          loads.push(this);
        }
      }
    );
    await vi.advanceTimersByTimeAsync(10_500);
    await el.updateComplete;
    expect($(el, "img.still").getAttribute("src")).toBe(first); // still the old one while the next loads
    loads[0].onload();
    await el.updateComplete;
    expect($(el, "img.still").getAttribute("src")).not.toBe(first);
  });

  it("full screen: the document's, covered by the tile; controls hide; a swipe hands it to the next tile; exit leaves it", async () => {
    let inner: Element | null = null;
    const enter = (x: Element) => {
      inner = x;
    };
    const request = vi.fn(async function (this: Element) {
      enter(this);
    });
    const exit = vi.fn(async () => {
      inner = null;
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: request,
    });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => inner });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    const { el: a } = await tile();
    const { el: b } = await tile({ name: "Front" });
    $(a, ".fsbtn").click();
    await vi.advanceTimersByTimeAsync(0);
    await a.updateComplete;
    expect(request.mock.contexts[0]).toBe(document.documentElement);
    expect($(a, ".tile").classList.contains("fs")).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    await a.updateComplete;
    expect($(a, ".fsbtn").classList.contains("visible")).toBe(false); // hidden while watching
    // A swipe to the left: the next tile, full screen, without asking again.
    $(a, ".stage").getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 225 }) as DOMRect;
    swipe(a, 300, 100);
    await vi.advanceTimersByTimeAsync(0);
    await a.updateComplete;
    await b.updateComplete;
    expect($(a, ".tile").classList.contains("fs")).toBe(false);
    expect($(b, ".tile").classList.contains("fs")).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    b._showUi();
    await b.updateComplete;
    $(b, ".fsbtn").click();
    await b.updateComplete;
    expect(exit).toHaveBeenCalledTimes(1);
    expect($(b, ".tile").classList.contains("fs")).toBe(false);
  });

  it("full screen: a double tap zooms on the point, again goes back", async () => {
    const { el } = await tile();
    await el._enter();
    await el.updateComplete;
    $(el, ".stage").getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 225 }) as DOMRect;
    tapAt(el, 300, 60);
    await vi.advanceTimersByTimeAsync(100);
    tapAt(el, 300, 60);
    await el.updateComplete;
    expect(el._zoom.s).toBe(2.5);
    await vi.advanceTimersByTimeAsync(400);
    tapAt(el, 300, 60);
    await vi.advanceTimersByTimeAsync(100);
    tapAt(el, 300, 60);
    expect(el._zoom.s).toBe(1);
  });
});
