import { describe, expect, it } from "vitest";

import { sidecarFolder, sidecarUrl } from "./sidecar";

describe("sidecarFolder", () => {
  it("accepts simple and nested relative folders", () => {
    expect(sidecarFolder("thumbs")).toBe("thumbs");
    expect(sidecarFolder(" /thumbs/ ")).toBe("thumbs");
    expect(sidecarFolder("previews/small")).toBe("previews/small");
  });

  it("turns the feature off for empty or unsafe values", () => {
    for (const v of [
      "",
      "  ",
      "/",
      "..",
      "../x",
      "a/../b",
      "a//b",
      "./thumbs",
      "a\\b",
      "t?x",
      "t#x",
      3,
      null,
    ]) {
      expect(sidecarFolder(v), String(v)).toBe("");
    }
  });
});

describe("sidecarUrl", () => {
  it("puts the preview of a gallery file in the folder next to it, keeping the full name", () => {
    expect(sidecarUrl("/local/snapshots/front_right/motion_20261018_124056.gif", "thumbs")).toBe(
      "/local/snapshots/front_right/thumbs/motion_20261018_124056.gif.jpg"
    );
    expect(sidecarUrl("/local/snapshots/camera1/car_20261017_213503_snapshot.jpg", "thumbs")).toBe(
      "/local/snapshots/camera1/thumbs/car_20261017_213503_snapshot.jpg.jpg"
    );
    expect(sidecarUrl("/local/a/b/c.mp4", "previews/small")).toBe(
      "/local/a/b/previews/small/c.mp4.jpg"
    );
  });

  it("drops a query or fragment", () => {
    expect(sidecarUrl("/local/cam/a.gif?v=2#t", "thumbs")).toBe("/local/cam/thumbs/a.gif.jpg");
  });

  it("gives nothing when off, outside /local/, for temporary files or bad input", () => {
    expect(sidecarUrl("/local/cam/a.gif", "")).toBe("");
    expect(sidecarUrl("media-source://media_source/local/a.gif", "thumbs")).toBe("");
    expect(sidecarUrl("https://nas.local/local/a.gif", "thumbs")).toBe("");
    expect(sidecarUrl("/api/camera_proxy/camera.x", "thumbs")).toBe("");
    expect(sidecarUrl("/local/cam/_tmp_motion_1.mp4.tmp", "thumbs")).toBe("");
    expect(sidecarUrl("/local/cam/", "thumbs")).toBe("");
    expect(sidecarUrl(null, "thumbs")).toBe("");
    expect(sidecarUrl(42, "thumbs")).toBe("");
  });
});
