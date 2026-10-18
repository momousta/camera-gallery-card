#!/usr/bin/env node
// Owner-fork deployment helper (BL-002). Runs in the HA "Advanced SSH & Web
// Terminal" add-on; talks to HA through the Supervisor websocket proxy with
// the add-on's own $SUPERVISOR_TOKEN (never printed).
//
//   node deploy/ha-deploy.mjs status
//   node deploy/ha-deploy.mjs test-install     # side-by-side: hidden admin-only dashboard /cgc-fork-test
//   node deploy/ha-deploy.mjs test-remove
//   node deploy/ha-deploy.mjs switch           # ONE STEP: real dashboards use the fork build
//   node deploy/ha-deploy.mjs rollback         # ONE STEP: back to the HACS-installed upstream card
//
// switch/rollback only rewrite the URL of the existing camera-gallery-card
// Lovelace resource (same element name, no dashboard YAML changes). Open
// clients pick it up on their next full reload (app restart / pull-to-refresh).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const WWW = "/config/www";
const TEST_DIR = `${WWW}/dev`;
const FORK_DIR = `${WWW}/cgc-fork`;
const BACKUP_DIR = "/share/backups/bl002";
const HACS_URL_PREFIX = "/hacsfiles/camera-gallery-card/camera-gallery-card.js";
const FORK_URL_PREFIX = "/local/cgc-fork/camera-gallery-card.js";
const LOADER_URL_PREFIX = "/local/dev/cgc-fork-loader.js";
const TEST_DASH = "cgc-fork-test";

async function ws(cmds) {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) throw new Error("SUPERVISOR_TOKEN not set (run inside the SSH add-on)");
  return new Promise((resolve, reject) => {
    const sock = new WebSocket("ws://supervisor/core/websocket");
    let id = 0;
    const out = [];
    sock.onerror = (e) => reject(new Error("websocket error " + (e?.message || "")));
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "auth_required")
        sock.send(JSON.stringify({ type: "auth", access_token: token }));
      else if (m.type === "auth_invalid") reject(new Error("auth invalid"));
      else if (m.type === "auth_ok")
        cmds.forEach((c) => sock.send(JSON.stringify({ id: ++id, ...c })));
      else if (m.type === "result") {
        out[m.id - 1] = m.success ? m.result : { __error: m.error };
        if (out.filter((x) => x !== undefined).length === cmds.length) {
          sock.close();
          resolve(out);
        }
      }
    };
  });
}
const one = async (cmd) => {
  const [r] = await ws([cmd]);
  if (r && r.__error) throw new Error(`${cmd.type}: ${JSON.stringify(r.__error)}`);
  return r;
};

const sha = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 12);
function publish(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  fs.writeFileSync(dest + ".gz", zlib.gzipSync(fs.readFileSync(src), { level: 9 }));
}
const findCardResource = (resources) =>
  resources.find((r) => r.url.startsWith(HACS_URL_PREFIX) || r.url.startsWith(FORK_URL_PREFIX));

async function status() {
  const [resources, dashboards] = await ws([
    { type: "lovelace/resources" },
    { type: "lovelace/dashboards/list" },
  ]);
  const card = findCardResource(resources);
  const loader = resources.find((r) => r.url.startsWith(LOADER_URL_PREFIX));
  const dash = dashboards.find((d) => d.url_path === TEST_DASH);
  console.log("camera-gallery-card resource:", card ? `${card.id} ${card.url}` : "MISSING");
  console.log(
    "  ->",
    !card ? "?" : card.url.startsWith(FORK_URL_PREFIX) ? "OWNER FORK" : "upstream (HACS)"
  );
  console.log("test loader resource:", loader ? `${loader.id} ${loader.url}` : "none");
  console.log(
    "test dashboard:",
    dash ? `/${dash.url_path} admin=${dash.require_admin} sidebar=${dash.show_in_sidebar}` : "none"
  );
  return { resources, dashboards, card, loader, dash };
}

async function testInstall() {
  const bundle = path.join(REPO, "dist/camera-gallery-card-fork.js");
  if (!fs.existsSync(bundle))
    throw new Error("build it first: CGC_ELEMENT_SUFFIX=-fork npm run build");
  if (
    !fs.readFileSync(bundle, "utf8").includes('customElements.define("camera-gallery-card-fork",')
  ) {
    throw new Error("dist/camera-gallery-card-fork.js doesn't define <camera-gallery-card-fork>");
  }
  const v = sha(bundle);
  publish(bundle, `${TEST_DIR}/camera-gallery-card-fork.js`);
  publish(path.join(HERE, "cgc-fork-loader.js"), `${TEST_DIR}/cgc-fork-loader.js`);
  const { loader, dash } = await status();
  const url = `${LOADER_URL_PREFIX}?v=${v}`;
  if (loader)
    await one({
      type: "lovelace/resources/update",
      resource_id: loader.id,
      res_type: "module",
      url,
    });
  else await one({ type: "lovelace/resources/create", res_type: "module", url });
  if (!dash) {
    await one({
      type: "lovelace/dashboards/create",
      url_path: TEST_DASH,
      title: "CGC fork test",
      icon: "mdi:test-tube",
      require_admin: true,
      show_in_sidebar: false,
      mode: "storage",
    });
  }
  const cfgFile = path.join(REPO, "deploy/.test-dashboard.json");
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "python3",
    [path.join(HERE, "make-test-dashboard.py"), "/config/dashboards/main.yaml", cfgFile],
    { stdio: "inherit" }
  );
  await one({
    type: "lovelace/config/save",
    url_path: TEST_DASH,
    config: JSON.parse(fs.readFileSync(cfgFile, "utf8")),
  });
  fs.rmSync(cfgFile, { force: true });
  console.log(`test build ${v} installed; open /${TEST_DASH} as an admin`);
  await status();
}

async function testRemove() {
  const { loader, dash } = await status();
  if (loader) await one({ type: "lovelace/resources/delete", resource_id: loader.id });
  if (dash) await one({ type: "lovelace/dashboards/delete", dashboard_id: dash.id });
  for (const f of [
    "camera-gallery-card-fork.js",
    "camera-gallery-card-fork.js.gz",
    "cgc-fork-loader.js",
    "cgc-fork-loader.js.gz",
  ]) {
    fs.rmSync(`${TEST_DIR}/${f}`, { force: true });
  }
  console.log("test resource, dashboard and files removed");
  await status();
}

async function switchToFork() {
  const bundle = path.join(REPO, "dist/camera-gallery-card.js");
  if (!fs.existsSync(bundle)) throw new Error("build it first: npm run build");
  const text = fs.readFileSync(bundle, "utf8");
  if (
    !text.includes('customElements.define("camera-gallery-card",') ||
    text.includes("camera-gallery-card-fork")
  ) {
    throw new Error(
      "dist/camera-gallery-card.js is not the standard-name build; run: npm run build"
    );
  }
  const { card } = await status();
  if (!card) throw new Error("camera-gallery-card resource not found");
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (card.url.startsWith(HACS_URL_PREFIX)) {
    fs.writeFileSync(`${BACKUP_DIR}/upstream-resource.json`, JSON.stringify(card, null, 1));
  }
  const v = sha(bundle);
  publish(bundle, `${FORK_DIR}/camera-gallery-card.js`);
  await one({
    type: "lovelace/resources/update",
    resource_id: card.id,
    res_type: "module",
    url: `${FORK_URL_PREFIX}?v=${v}`,
  });
  console.log(`switched to the owner fork build ${v}; reload the app/browser to pick it up`);
  await status();
}

async function rollback() {
  const { card } = await status();
  if (!card) throw new Error("camera-gallery-card resource not found");
  const saved = `${BACKUP_DIR}/upstream-resource.json`;
  const url = fs.existsSync(saved)
    ? JSON.parse(fs.readFileSync(saved, "utf8")).url
    : HACS_URL_PREFIX;
  await one({ type: "lovelace/resources/update", resource_id: card.id, res_type: "module", url });
  console.log(`rolled back to ${url}; reload the app/browser to pick it up`);
  await status();
}

const cmd = process.argv[2] || "status";
const fn = {
  status,
  "test-install": testInstall,
  "test-remove": testRemove,
  switch: switchToFork,
  rollback,
}[cmd];
if (!fn) {
  console.error("usage: ha-deploy.mjs status|test-install|test-remove|switch|rollback");
  process.exit(2);
}
await fn();
