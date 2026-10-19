import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));
const isDev = process.env.ROLLUP_WATCH === "true" || process.env.NODE_ENV === "development";
// Side-by-side test build (owner fork): CGC_ELEMENT_SUFFIX=-fork registers
// <camera-gallery-card-fork> (+ its editor) so it can load next to the
// installed card without a customElements name clash.
const suffix = process.env.CGC_ELEMENT_SUFFIX || "";
if (suffix && !/^-[a-z0-9-]+$/.test(suffix))
  throw new Error("CGC_ELEMENT_SUFFIX must look like -fork");

export default {
  input: "src/index.js",
  output: {
    file: `dist/camera-gallery-card${suffix}.js`,
    format: "iife",
    name: "CameraGalleryCardBundle",
    sourcemap: isDev,
    banner: `/*! camera-gallery-card v${pkg.version}${suffix ? ` (element camera-gallery-card${suffix})` : ""} | ${pkg.license} */`,
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: {
        __VERSION__: JSON.stringify(pkg.version),
      },
    }),
    suffix &&
      replace({
        preventAssignment: false,
        delimiters: ["", ""],
        include: ["src/index.js"],
        values: {
          '"camera-gallery-card-editor"': `"camera-gallery-card${suffix}-editor"`,
          'customElements.define("camera-gallery-card",': `customElements.define("camera-gallery-card${suffix}",`,
          'type: "camera-gallery-card",': `type: "camera-gallery-card${suffix}",`,
          'name: "Camera Gallery Card",': `name: "Camera Gallery Card (${suffix.slice(1)} test)",`,
        },
      }),
    suffix &&
      replace({
        preventAssignment: false,
        delimiters: ["", ""],
        include: ["src/timeline/timeline-card.js"],
        values: {
          'const TAG = "camera-timeline-card";': `const TAG = "camera-timeline-card${suffix}";`,
        },
      }),
    nodeResolve({ browser: true, extensions: [".js", ".ts", ".mjs"] }),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      noEmitOnError: !isDev,
      // Plugin requires emit-capable config; tsconfig keeps noEmit:true for `tsc --noEmit`.
      compilerOptions: {
        noEmit: false,
        declaration: false,
        sourceMap: isDev,
        outDir: ".",
      },
      outputToFilesystem: false,
    }),
    !isDev &&
      terser({
        format: { comments: /^!/ },
      }),
  ].filter(Boolean),
};
