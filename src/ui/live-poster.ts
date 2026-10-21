/**
 * Owner fork (10-21): a picture at once while a live stream connects.
 *
 * Home Assistant's player stays black until the stream's first keyframe (1–2 s with the stream preloaded,
 * 5–8 s for a turned, re-encoded one). The poster shows the last frame this phone saw of the camera (kept from
 * the playing video every 30 s and when the view closes) at once, without asking the NVR, which answers
 * snapshots one at a time (7 at once: the last after ~9 s). Only when no frame from the last 10 minutes is kept
 * does a sized NVR snapshot load; snapshots come back unturned, so the poster applies the camera's orientation
 * setting the way go2rtc turns the stream. The poster fades the moment the player shows a frame. Used by the
 * Cameras page's tiles and the gallery's live view.
 */

type Hass = {
  states?: Record<string, { attributes?: Record<string, unknown> } | undefined>;
  callWS?: (msg: Record<string, unknown>) => Promise<unknown>;
};

export type PosterFit = "contain" | "cover";

const orientations = new Map<string, Promise<number>>();

const FADE_MS = 300;
const FAST_POLL_MS = 150;
const SLOW_POLL_MS = 1_000;
const FAST_FOR_MS = 10_000;
const KEEP_PREFIX = "cgc-live-frame:";
const KEEP_EVERY_MS = 30_000;
const KEEP_MAX_SIDE = 960;
/** A kept frame is shown up to this old… */
const KEPT_USABLE_MS = 6 * 3_600_000;
/** …and a fresh snapshot is fetched as well when it is older than this. */
const KEPT_FRESH_MS = 10 * 60_000;

export const POSTER_CLASS = "cgc-live-poster";

/** The camera's orientation setting (Home Assistant's `camera/get_prefs`, open to every user); 1 when unknown. */
export function orientationOf(hass: Hass, entity: string): Promise<number> {
  let p = orientations.get(entity);
  if (!p) {
    p = Promise.resolve()
      .then(() => hass.callWS?.({ type: "camera/get_prefs", entity_id: entity }))
      .then((r) => Number((r as { orientation?: unknown } | undefined)?.orientation) || 1)
      .catch(() => 1);
    orientations.set(entity, p);
  }
  return p;
}

/** CSS for Home Assistant's orientation values (stream `Orientation`), matching go2rtc's filters. */
export function orientationTransform(o: number): { turn: boolean; css: string } {
  switch (o) {
    case 2:
      return { turn: false, css: "scaleX(-1)" };
    case 3:
      return { turn: false, css: "rotate(180deg)" };
    case 4:
      return { turn: false, css: "scaleY(-1)" };
    case 5:
      return { turn: true, css: "scaleY(-1) rotate(-90deg)" };
    case 6:
      return { turn: true, css: "rotate(-90deg)" };
    case 7:
      return { turn: true, css: "scaleY(-1) rotate(90deg)" };
    case 8:
      return { turn: true, css: "rotate(90deg)" };
    default:
      return { turn: false, css: "" };
  }
}

/**
 * The snapshot sized for `host`. Home Assistant scales a camera's JPEG (by 1/2, 1/4 or 1/8, at least the asked
 * size) only when both `width` and `height` are given: a Reolink frame drops from 1–2 MB to ~90 KB for a phone tile.
 */
export function snapshotUrl(
  pic: string,
  host: { clientWidth: number; clientHeight: number } | null
): string {
  const dpr = Math.min(Math.max(globalThis.devicePixelRatio || 1, 1), 3);
  const side = Math.max(host?.clientWidth || 0, host?.clientHeight || 0);
  const w = Math.round(Math.min(Math.max(side ? side * dpr : 640, 320), 1920));
  const h = Math.round((w * 9) / 16);
  return `${pic}${pic.includes("?") ? "&" : "?"}width=${w}&height=${h}&_t=${Date.now()}`;
}

/** Whether the player (searched through its shadow roots) is showing a picture: a video with a frame, or a loaded image. */
export function hasPicture(root: Element | ShadowRoot | null | undefined): boolean {
  if (!root) return false;
  const scopes: (Element | ShadowRoot)[] = [root];
  if (root instanceof Element && root.shadowRoot) scopes.push(root.shadowRoot);
  for (const scope of scopes) {
    for (const el of Array.from(scope.querySelectorAll("*"))) {
      if (el.closest?.(`.${POSTER_CLASS}`)) continue;
      if (el instanceof HTMLVideoElement && el.readyState >= 2 && el.videoWidth > 0) return true;
      if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) return true;
      if (el.shadowRoot && hasPicture(el.shadowRoot)) return true;
    }
  }
  return false;
}

type KeptFrame = { t: number; data: string };

/** The last frame this browser kept of the camera (already turned like the stream), if recent enough. */
export function keptFrame(entity: string, now = Date.now()): KeptFrame | null {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEEP_PREFIX + entity) || "null");
    if (v && typeof v.data === "string" && typeof v.t === "number" && now - v.t < KEPT_USABLE_MS)
      return v;
  } catch {
    /* unreadable: none */
  }
  return null;
}

function deepVideo(root: Element | ShadowRoot | null | undefined): HTMLVideoElement | null {
  if (!root) return null;
  const scopes: (Element | ShadowRoot)[] = [root];
  if (root instanceof Element && root.shadowRoot) scopes.push(root.shadowRoot);
  for (const scope of scopes) {
    for (const el of Array.from(scope.querySelectorAll("*"))) {
      if (el instanceof HTMLVideoElement) return el;
      const inner = el.shadowRoot ? deepVideo(el.shadowRoot) : null;
      if (inner) return inner;
    }
  }
  return null;
}

/** Keep the player's current video frame (a small JPEG in localStorage). False when there is no frame. */
export function keepFrame(entity: string, player: Element | null | undefined): boolean {
  const v = deepVideo(player);
  if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return false;
  try {
    const k = Math.min(1, KEEP_MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * k);
    c.height = Math.round(v.videoHeight * k);
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const data = c.toDataURL("image/jpeg", 0.6);
    if (!data.startsWith("data:image/jpeg")) return false;
    globalThis.localStorage?.setItem(KEEP_PREFIX + entity, JSON.stringify({ t: Date.now(), data }));
    return true;
  } catch {
    return false; // storage full or the frame is not readable
  }
}

/**
 * Lay the camera's last picture over `host` until `player` shows a frame, and keep the playing video's frame
 * for the next time. Returns a function to call when the player is torn down (it keeps the last frame and
 * removes the poster). Shows nothing when the player already shows a picture.
 */
export function attachLivePoster(
  host: HTMLElement,
  player: Element,
  hass: Hass,
  entity: string,
  fit: PosterFit = "contain"
): () => void {
  if (!host || !player || !entity) return () => {};
  const pic = hass?.states?.[entity]?.attributes?.["entity_picture"];
  let done = false; // the poster's part (fade or removal) is over
  let ended = false; // torn down
  let timer: ReturnType<typeof setTimeout> | undefined;
  let keepTimer: ReturnType<typeof setInterval> | undefined;
  const started = Date.now();

  const keepLoop = () => {
    keepFrame(entity, player);
    clearInterval(keepTimer);
    keepTimer = setInterval(() => {
      if (!player.isConnected) return;
      keepFrame(entity, player);
    }, KEEP_EVERY_MS);
  };

  if (hasPicture(player)) {
    keepLoop();
    return () => {
      if (ended) return;
      ended = true;
      clearInterval(keepTimer);
      keepFrame(entity, player);
    };
  }

  const kept = keptFrame(entity);
  const snapshot = typeof pic === "string" && pic && (!kept || Date.now() - kept.t > KEPT_FRESH_MS);
  if (!kept && !snapshot) return () => {};

  let loaded = false;
  let oriented = false;
  let turn = { turn: false, css: "" };
  // A kept frame is already turned like the stream; a snapshot needs the camera's orientation.
  let wantTurn = false;
  let orientation = 1;

  const wrap = document.createElement("div");
  wrap.className = POSTER_CLASS;
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.cssText =
    "position:absolute;inset:0;overflow:hidden;pointer-events:none;background:transparent;" +
    `opacity:1;transition:opacity ${FADE_MS}ms ease;`;
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  img.style.cssText =
    "position:absolute;left:50%;top:50%;width:100%;height:100%;max-width:none;max-height:none;" +
    `object-fit:${fit};transform:translate(-50%,-50%);visibility:hidden;`;
  wrap.appendChild(img);
  host.appendChild(wrap);

  const reveal = () => {
    if (loaded && (oriented || !wantTurn) && !done) img.style.visibility = "visible";
  };
  const size = () => {
    if (turn.turn) {
      img.style.width = `${wrap.clientHeight}px`;
      img.style.height = `${wrap.clientWidth}px`;
    } else {
      img.style.width = "100%";
      img.style.height = "100%";
    }
    img.style.transform = `translate(-50%,-50%) ${turn.css}`.trim();
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(size) : null;
  ro?.observe(wrap);
  const show = (src: string, needsTurn: boolean) => {
    wantTurn = needsTurn;
    turn = needsTurn ? orientationTransform(orientation) : { turn: false, css: "" };
    size();
    loaded = false;
    img.style.visibility = "hidden";
    img.src = src;
  };

  img.onload = () => {
    loaded = true;
    reveal();
  };
  img.onerror = () => {
    loaded = false;
    img.style.visibility = "hidden";
  };

  if (kept) show(kept.data, false);
  let pre: HTMLImageElement | null = null;
  if (snapshot) {
    void orientationOf(hass, entity).then((o) => {
      orientation = o;
      oriented = true;
      if (wantTurn) {
        turn = orientationTransform(o);
        size();
      }
      reveal();
    });
    const fresh = snapshotUrl(pic as string, host);
    pre = new Image();
    pre.onload = () => {
      if (!done) show(fresh, true);
    };
    pre.src = fresh;
  }

  const finish = (fade: boolean) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    ro?.disconnect();
    if (pre) pre.onload = null;
    if (!fade) {
      wrap.remove();
      return;
    }
    wrap.style.opacity = "0";
    setTimeout(() => wrap.remove(), FADE_MS + 50);
  };
  const tick = () => {
    if (done) return;
    if (!wrap.isConnected) return finish(false);
    if (hasPicture(player)) {
      finish(true);
      keepLoop();
      return;
    }
    timer = setTimeout(tick, Date.now() - started < FAST_FOR_MS ? FAST_POLL_MS : SLOW_POLL_MS);
  };
  timer = setTimeout(tick, FAST_POLL_MS);
  return () => {
    if (ended) return;
    ended = true;
    clearInterval(keepTimer);
    keepFrame(entity, player);
    finish(false);
  };
}
