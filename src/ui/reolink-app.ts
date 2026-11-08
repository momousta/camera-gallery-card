import type { HomeAssistant } from "../types/hass";
import { sha256Base64 } from "../util/sha256";

interface DeviceEntry {
  id: string;
  via_device_id?: string | null;
  serial_number?: string | null;
  identifiers: [string, string][];
}

/** The parts of `hass` used here. The HA frontend keeps the entity and device registries in memory. */
export interface ReolinkHass extends Pick<HomeAssistant, "callWS"> {
  entities?: Record<string, { device_id?: string | null } | undefined>;
  devices?: Record<string, DeviceEntry | undefined>;
}

const UID_RE = /^[a-z0-9]+$/i;

export function canOpenReolinkApp(entity: unknown, channel: unknown): boolean {
  return (
    /Android/i.test(globalThis.navigator?.userAgent ?? "") &&
    typeof entity === "string" &&
    entity.startsWith("camera.") &&
    typeof channel === "number" &&
    Number.isInteger(channel) &&
    channel >= 0 &&
    channel <= 63
  );
}

/** The Reolink app's own alarm link, as the camera alerts send it (blueprint reolink_rich_notifications,
 * HEALTH_AUDIT D38; read in app 4.63): https://reolink.com/ulink/alarm with uid = Base64(SHA-256(NVR UID)),
 * channel = the 0-based NVR channel and timestamp = epoch ms. Within 2 minutes of the tap the app opens that camera
 * live, otherwise its recording at that moment. Sent as an intent for the Reolink package, so it never opens a
 * browser. (Push-style `reolink://scan` / WelcomeActivity extras open only the app's camera list or live view.) */
export function reolinkPlaybackIntent(uid: string, channel: number, timeMs: number): string {
  if (
    !UID_RE.test(uid) ||
    !Number.isInteger(channel) ||
    channel < 0 ||
    channel > 63 ||
    !Number.isFinite(timeMs) ||
    timeMs <= 0
  ) {
    throw new Error("The Reolink camera or recording time is invalid.");
  }
  const query = `uid=${encodeURIComponent(sha256Base64(uid))}&channel=${channel}&timestamp=${Math.floor(timeMs)}`;
  return `intent://reolink.com/ulink/alarm?${query}#Intent;scheme=https;package=com.mcu.reolink;end`;
}

/** The NVR's UID: HA stores it as the device's serial number (and, normally, as its Reolink identifier). */
function uidOf(nvr: DeviceEntry | undefined): string | undefined {
  const serial = nvr?.serial_number;
  if (serial && UID_RE.test(serial)) return serial;
  return nvr?.identifiers?.find(([domain]) => domain === "reolink")?.[1];
}

function nvrUid(
  camera: DeviceEntry | undefined,
  device: (id: string) => DeviceEntry | undefined
): string | undefined {
  return uidOf(camera?.via_device_id ? device(camera.via_device_id) : camera);
}

/** The camera's NVR UID from the registries the frontend already holds: no request, so a tap launches at once. */
export function reolinkUid(
  hass: ReolinkHass | null | undefined,
  entity: string
): string | undefined {
  const devices = hass?.devices;
  const deviceId = hass?.entities?.[entity]?.device_id;
  if (!devices || !deviceId) return undefined;
  return nvrUid(devices[deviceId], (id) => devices[id]);
}

/** Older frontends without `hass.devices`: ask the registries. */
async function fetchReolinkUid(hass: ReolinkHass, entity: string): Promise<string | undefined> {
  const entry = await hass.callWS<{ device_id?: string | null }>({
    type: "config/entity_registry/get",
    entity_id: entity,
  });
  const devices = await hass.callWS<DeviceEntry[]>({ type: "config/device_registry/list" });
  return nvrUid(
    devices.find((device) => device.id === entry.device_id),
    (id) => devices.find((device) => device.id === id)
  );
}

/** Opens the Reolink app on the camera's NVR channel at `timeMs`. With the registries in memory this navigates
 * synchronously, inside the tap. */
export async function openReolinkApp(
  hass: ReolinkHass,
  entity: string,
  channel: number,
  timeMs: number
): Promise<void> {
  if (!canOpenReolinkApp(entity, channel))
    throw new Error("Exact Reolink app links are only supported on Android.");
  const uid = reolinkUid(hass, entity) ?? (await fetchReolinkUid(hass, entity));
  if (!uid) throw new Error("Could not find the Reolink NVR for this camera.");
  window.location.assign(reolinkPlaybackIntent(uid, channel, timeMs));
}
