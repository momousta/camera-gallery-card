// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canOpenReolinkApp,
  openReolinkApp,
  reolinkPlaybackIntent,
  reolinkUid,
} from "./reolink-app";

afterEach(() => vi.unstubAllGlobals());

/** The registries as the HA frontend holds them: `hass.entities` (display entries) and `hass.devices`. */
const registryHass = (nvr: Record<string, unknown> = {}) => ({
  callWS: vi.fn(),
  entities: { "camera.front_main": { device_id: "camera-device" } },
  devices: {
    "camera-device": {
      id: "camera-device",
      via_device_id: "nvr",
      serial_number: "CAMUID999",
      identifiers: [["reolink", "TESTNVR123_ch7"]] as [string, string][],
    },
    nvr: {
      id: "nvr",
      serial_number: "TESTNVR123",
      identifiers: [["reolink", "TESTNVR123"]] as [string, string][],
      ...nvr,
    },
  },
});

describe("Reolink Android playback intents", () => {
  it("is the camera alerts' alarm link: hashed NVR UID, 0-based channel, epoch milliseconds", () => {
    const url = reolinkPlaybackIntent("TESTNVR123", 7, 1794160000123);
    // The blueprint's derivation, from Node's crypto: encodeURIComponent(Base64(SHA-256("TESTNVR123"))).
    const uid = "e%2B8C5dzmc7Qq1%2Fq8daJ%2BlI2lWiQv9fZuj%2FmqMX10wtA%3D";
    expect(url).toBe(
      `intent://reolink.com/ulink/alarm?uid=${uid}&channel=7&timestamp=1794160000123` +
        "#Intent;scheme=https;package=com.mcu.reolink;end"
    );
    expect(uid).toMatch(/%2B|%2F|%3D/); // +, / and = are escaped, as the blueprint's
    // The push-style links only open the app's camera list or live view.
    for (const old of ["scheme=reolink", "WelcomeActivity", "S.UID", "ALMCHN", "channelid"]) {
      expect(url).not.toContain(old);
    }
    expect(reolinkPlaybackIntent("TESTNVR123", 0, 1794160000123)).toContain("&channel=0&");
    expect(reolinkPlaybackIntent("TESTNVR123", 63, 1794160000999.9)).toContain(
      "&channel=63&timestamp=1794160000999#"
    );
  });

  it("rejects invalid IDs, channels and moments rather than opening the wrong recording", () => {
    for (const channel of [-1, 64, 0.5, NaN]) {
      expect(() => reolinkPlaybackIntent("TESTNVR123", channel, 1794160000000)).toThrow();
    }
    for (const ms of [NaN, Infinity, 0, -1]) {
      expect(() => reolinkPlaybackIntent("TESTNVR123", 0, ms)).toThrow();
    }
    expect(() => reolinkPlaybackIntent("bad;S.UID=other", 0, 1794160000000)).toThrow();
  });

  it("does not offer unsupported iOS exact-playback links", () => {
    vi.stubGlobal("navigator", { userAgent: "iPhone" });
    expect(canOpenReolinkApp("camera.front_main", 7)).toBe(false);
    vi.stubGlobal("navigator", { userAgent: "Android" });
    expect(canOpenReolinkApp("camera.front_main", 7)).toBe(true);
    expect(canOpenReolinkApp("", 7)).toBe(false);
    expect(canOpenReolinkApp("camera.front_main", undefined)).toBe(false);
  });

  it("finds the parent NVR's UID in the frontend's registries, preferring its serial number", () => {
    expect(reolinkUid(registryHass(), "camera.front_main")).toBe("TESTNVR123");
    expect(reolinkUid(registryHass({ serial_number: null }), "camera.front_main")).toBe(
      "TESTNVR123"
    );
    expect(reolinkUid(registryHass({ serial_number: "bad;S.X=1" }), "camera.front_main")).toBe(
      "TESTNVR123"
    );
    expect(reolinkUid(registryHass(), "camera.unknown")).toBeUndefined();
    expect(reolinkUid({ callWS: vi.fn() }, "camera.front_main")).toBeUndefined();
  });

  it("launches within the tap: no registry request and no wait before the navigation", () => {
    vi.stubGlobal("navigator", { userAgent: "Android" });
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    const hass = registryHass();
    void openReolinkApp(hass, "camera.front_main", 7, 1794160000123);
    // Synchronous: a tap that first downloaded the whole device registry looked like it did nothing.
    expect(assign).toHaveBeenCalledWith(reolinkPlaybackIntent("TESTNVR123", 7, 1794160000123));
    expect(hass.callWS).not.toHaveBeenCalled();
  });

  it("falls back to the registry API when the frontend has no device registry", async () => {
    vi.stubGlobal("navigator", { userAgent: "Android" });
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    const hass = {
      callWS: vi
        .fn()
        .mockResolvedValueOnce({ device_id: "camera-device" })
        .mockResolvedValueOnce([
          {
            id: "camera-device",
            via_device_id: "nvr",
            identifiers: [["reolink", "TESTNVR123_ch7"]],
          },
          { id: "nvr", identifiers: [["reolink", "TESTNVR123"]] },
        ]),
    };
    await openReolinkApp(hass, "camera.front_main", 7, 1794160000123);
    expect(hass.callWS).toHaveBeenCalledWith({
      type: "config/entity_registry/get",
      entity_id: "camera.front_main",
    });
    expect(assign).toHaveBeenCalledWith(reolinkPlaybackIntent("TESTNVR123", 7, 1794160000123));
  });

  it("reports missing device metadata instead of silently opening the app home page", async () => {
    vi.stubGlobal("navigator", { userAgent: "Android" });
    const hass = {
      callWS: vi.fn().mockResolvedValueOnce({ device_id: "missing" }).mockResolvedValueOnce([]),
    };
    await expect(openReolinkApp(hass, "camera.front_main", 7, 1794160000123)).rejects.toThrow(
      "Could not find the Reolink NVR"
    );
  });
});
