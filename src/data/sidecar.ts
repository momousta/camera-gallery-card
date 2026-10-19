/**
 * Preview ("sidecar") URLs for sensor-mode items (BL-006).
 *
 * With `thumbnail_folder: thumbs`, the preview of `/local/snapshots/cam/motion_1.gif` is
 * `/local/snapshots/cam/thumbs/motion_1.gif.jpg`: a small JPEG kept next to the file by a thumbnailer (the
 * owner's Gallery Thumbnails add-on). The full file name is kept, so `x.gif` and `x.jpg` never share a preview.
 *
 * Only `/local/` paths get one: that is where FileTrack-style sensors point, and HA serves the folder as static
 * files. Media-source items have their own thumbnails.
 */

import { isTemporaryFilePath } from "./sensor-source";

/** A safe relative folder name: no empty, `.` or `..` segments, no backslash, query or fragment. "" = off. */
export function sidecarFolder(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed || /[\\?#]/.test(trimmed)) return "";
  const parts = trimmed.split("/");
  if (parts.some((p) => !p || p === "." || p === "..")) return "";
  return parts.join("/");
}

/** The preview URL of `src` in `folder` (already sanitized), or "" when the item can't have one. */
export function sidecarUrl(src: unknown, folder: string): string {
  if (!folder || typeof src !== "string" || !src.startsWith("/local/")) return "";
  const clean = (src.split("#")[0] ?? "").split("?")[0] ?? "";
  const slash = clean.lastIndexOf("/");
  const name = clean.slice(slash + 1);
  if (!name || isTemporaryFilePath(clean)) return "";
  return `${clean.slice(0, slash)}/${folder}/${name}.jpg`;
}
