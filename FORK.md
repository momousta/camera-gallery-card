# Owner fork of camera-gallery-card (BL-002)

Local fork of [TheScubaDiver/camera-gallery-card](https://github.com/TheScubaDiver/camera-gallery-card)
for this Home Assistant install. Branch `owner-fork`, based on the installed tag `v3.1.0`.
It lives in `/share/dev/camera-gallery-card` until the owner pushes it to his GitHub account.

**Live since 2026-10-18 13:04** (owner's go-ahead: "implement everything but don't push").

- **Now:** build `3.1.0-owner.5` since 2026-10-19 14:20 (BACKLOG BL-007: the timeline card). Check the resource
  with `node deploy/ha-deploy.mjs status`.
- **Before:** `3.1.0-owner.4` (`?v=514a65062fdf`, BL-006), saved in `/share/backups/bl002/owner.4-514a65062fdf/`.
- **Earlier still:** `3.1.0-owner.3` (`?v=68f5d4fa0b24`), saved in `/share/backups/bl002/owner.3-68f5d4fa0b24/`. To go
  back to it, copy both files into `dist/` and run `switch`.
- **Earlier:** `3.1.0-owner.2` (`?v=9b81a5001b09`), saved in `/share/backups/bl002/owner.2-9b81a5001b09/`. To go
  back to it, copy both files into `dist/` and run `switch`.
- **Dashboards:** `dashboards/main.yaml` sets these on all 10 cards:
  - `scrub_on_drag: true`;
  - `thumbnail_folder: thumbs`, the previews kept by the **Gallery Thumbnails** add-on (`/addons/gallery_thumbs`);
  - `preload_thumbnails: true` with `preload_days: 2`;
  - `show_favorite: false`.
- **Caps:** `max_media: 200` on the 8 cameras with more than 50 clips a day (busiest day 192), and `max_media: 400`
  on the doorbell, which saves a Ring still every 5 minutes since 2026-10-18 (288 a day plus events).

Checked against the live frontend (headless Chromium, Pixel 6 viewport, real touch input):

- **Speed** at 15 Mbps Wi-Fi, all visible thumbnails loaded (upstream → fork):
  - Front Right: 1.8 s → 0.68 s, 2.1 MB → 0.2 MB;
  - Left Front: 4.8 s → 0.79 s, 8.0 MB → 0.63 MB;
  - repeat visits: no requests for stills (IndexedDB).
- **Scrub:**
  - Touch drag and flick select the thumb under the centre line, with stills only and no clip loads mid-drag.
  - One clip loads on release. Tap still selects. A vertical swipe doesn't scrub.
  - With `scrub_on_drag` off, behaviour is identical to upstream.
- **owner.3 (windowed strip + inline star)** on the doorbell with a full day of 5-minute stills (288 items, the real
  48 h file list, cpu 1). Median of 2, owner.2 → owner.3:
  - all visible thumbnails loaded: 0.84 s → 0.44 s;
  - longest main-thread task while loading: 0.54 s → 0.17 s;
  - flicking through the strip: 5–6 long tasks (0.31–0.36 s in total) → 1 (0.06 s).
  - Trade-off: a sustained 10 000 px/s scroll to the end of the day builds tiles on the way. That gives 4–7 long
    tasks (max 0.12 s) instead of 1–4, with less card CPU (0.25–0.30 s vs 0.40–0.46 s) and as many or more
    frames drawn.
  - Front Right (≤ 200 a day), median of 3: 0.58 s → 0.56 s.
  - Live after the switch: doorbell 47/47 items today (0.51 s), and a full day of 288 (0.44 s). In a fast scroll,
    3 long tasks (max 61 ms) and no placeholder box on screen. 0 errors.
- **owner.4 (BL-006: previews, low-res scrubbing, preloading, calendar)**, on the live dashboards:
  - Front (camera1), scrolling through today's whole strip: 35.3 MB → 5.3 MB.
    - Before: 6 car snapshots loaded in full, 33.4 MB.
    - After: 0 full snapshots; 4.9 MB of previews covering today and the 2 preloaded days.
  - All visible tiles loaded, 15 Mbps: Front 730 → 428 ms, Front Right 780 → 406 ms.
  - Preload: Front Right 260 previews in day order (52 today, 92 yesterday, 116 the day before), 3.1 MB in 6.7 s;
    doorbell 330 (7 MB) in 9.9 s, live video unaffected.
  - Touch scrub: frames are previews (`….gif.jpg`, `….jpg.jpg`); one full load on release; tap and vertical swipe
    unchanged.
  - Calendar: October 2026, days with clips pickable, picking a day selects it. No star.
- **owner.5 (BL-007, `camera-timeline-card`)**, on the live page `/main-dashboard/timeline` (8 cameras):
  - Opens on today at now, all previews.
  - Touch drag from 14:20 back to 11:54, every camera following, 0 full-size downloads.
  - Play 2 s = +2 min; pause holds.
  - Calendar to the 11th, which opens on its last moment.
  - Tapping a camera loads that one full file.
  - 826 previews (11.9 MB) preloaded for today and the picked day.
  - 0 page errors.
- **Not checked:** real phones, iOS Safari, live WebRTC and talkback (WebRTC doesn't run in headless Chromium).

Harness and results: `/share/dev/bl002-work`.

- Scripts: `harness/measure_golive.mjs --script touch3|fast|staricon|count|preload|browsefull|cal|tl` (`tl` with
  `--tag camera-timeline-card --view timeline [--shot file.png]`).
- Results: `results/golive-*.jsonl`, `results/star-*.jsonl` and `results/live.jsonl`.

## What the fork adds on top of v3.1.0

| Commit                                                         | What                                                                                                                                                                                                                       | Why                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `build: fork version 3.1.0-owner.1; CGC_ELEMENT_SUFFIX…`       | `CGC_ELEMENT_SUFFIX=-fork npm run build` → `dist/camera-gallery-card-fork.js` defining `<camera-gallery-card-fork>`                                                                                                        | Test the fork next to the installed card                                                                          |
| `perf(thumbs): still first-frame thumbnails…`                  | Sensor GIF tiles stream the GIF head (`Range`), stop at the end of the first frame, show it, keep a JPEG copy in IndexedDB. `gif_thumbnails: still` (default) / `animated` (v3.1.0 tiles)                                  | Speed: the strip loaded every visible GIF in full                                                                 |
| `feat(thumbs): drag the thumbnail strip to scrub…`             | `scrub_on_drag: true` (default false), upstream issue #152                                                                                                                                                                 | Owner's feature request                                                                                           |
| `feat(viewer): pinch-to-zoom… fullscreen image viewer`         | Cherry-pick of upstream PR #253                                                                                                                                                                                            | Fixes upstream #245                                                                                               |
| `fix(fullscreen): use full video height…`                      | Cherry-pick of upstream PR #246                                                                                                                                                                                            | Part of upstream #155                                                                                             |
| `test(viewer): regression spec for #245…`                      | jsdom spec for the #253 fix                                                                                                                                                                                                | Triage: a test per fix                                                                                            |
| `perf(render): build Intl date/time formatters once…`          | Cache `Intl.DateTimeFormat` and the 12/24-hour probe                                                                                                                                                                       | Speed: two formatter builds per thumbnail per render were the card's top CPU cost                                 |
| `perf(render): coalesce poster-driven re-renders…`             | One card render per frame while thumbnails arrive                                                                                                                                                                          | Speed: N posters used to cost N full renders                                                                      |
| `perf(thumbs): start GIF stills on reveal…`                    | Queue a tile's still when it scrolls into view; first visits don't wait for an empty IndexedDB                                                                                                                             | Speed: first thumbnails sooner (finished from eng-gallery's WIP `ea9415d`)                                        |
| `fix(sensor): don't show temporary files…`                     | Sensor fileLists skip `.tmp`/`.part`/`.crdownload`/… and dotfiles                                                                                                                                                          | Cancelled recordings left `_tmp_*.mp4.tmp` (1–4 MB) as broken tiles that still downloaded                         |
| `build: fork version 3.1.0-owner.2`                            | Version shown in the bundle banner                                                                                                                                                                                         | Live 2026-10-18 13:04–16:39                                                                                       |
| `perf(thumbs): window the thumbnail strip…`                    | Only the tiles around the visible strip are real (blocks of 24, two strip-lengths each side, at most 72); every other item is an empty box of the same size. Also re-arms the reveal observer when HA re-attaches the card | Speed: a doorbell still every 5 min means ~300 tiles a day. Also fixes blank thumbnails after returning to a view |
| `perf(thumbs): draw the favourite star as inline SVG…`         | An `<svg>` with HA's own mdi paths instead of a per-tile `<ha-icon>`                                                                                                                                                       | Speed: card-mod re-reads computed styles on every `ha-icon`, after each update and 5 more times over 1.25 s       |
| `build: fork version 3.1.0-owner.3`                            | Version shown in the bundle banner                                                                                                                                                                                         | The live build                                                                                                    |
| `feat(thumbs): previews next to the files (thumbnail_folder)…` | Server previews (`<dir>/thumbs/<file>.jpg`) for tiles, scrub frames (always), the placeholder under the full file and video posters; `preload_thumbnails`/`preload_days` load the day's previews, then the neighbour days' | BL-006: photos were tiles and scrub frames in full (1–6 MB)                                                       |
| `feat(date): pick the day from a month calendar`               | Tap the date: month grid, days with media pickable, HA first weekday                                                                                                                                                       | BL-006: owner asked for a calendar                                                                                |
| `build: fork version 3.1.0-owner.4`                            | Version shown in the bundle banner                                                                                                                                                                                         | The live build                                                                                                    |
| `refactor(date): one month calendar for both cards`            | The calendar is `src/ui/calendar-picker.js` + its styles                                                                                                                                                                   | Shared with the timeline card                                                                                     |
| `feat(timeline): camera-timeline-card…`                        | A second element: every camera on one time track (shared moment, previews, play, calendar, full view, preloading)                                                                                                          | BL-007: owner asked for one timeline for all cameras                                                              |
| `style(timeline): taller activity lanes`                       | 7 px lanes                                                                                                                                                                                                                 | An easier thumb target                                                                                            |
| `build: fork version 3.1.0-owner.5`                            | Version shown in the bundle banner                                                                                                                                                                                         | The live build                                                                                                    |

## Build and test

```sh
cd /share/dev/camera-gallery-card
uptime                                   # heavy work only when the 1-min load < 3
nice -n 19 npm ci
nice -n 19 npm test                      # vitest
nice -n 19 npm run typecheck
nice -n 19 npm run build                 # dist/camera-gallery-card.js  (real element name)
CGC_ELEMENT_SUFFIX=-fork nice -n 19 npm run build   # dist/camera-gallery-card-fork.js (test element)
```

## Deploy (run in the HA SSH add-on; uses the add-on's `$SUPERVISOR_TOKEN`)

```sh
node deploy/ha-deploy.mjs status         # which build the dashboards use
node deploy/ha-deploy.mjs test-install   # side-by-side test: hidden, admin-only dashboard /cgc-fork-test
node deploy/ha-deploy.mjs test-remove    # remove the test dashboard, loader resource and files
node deploy/ha-deploy.mjs switch         # ONE STEP: the real dashboards use the fork build
node deploy/ha-deploy.mjs rollback       # ONE STEP: back to the HACS-installed upstream card
```

- **Test install** copies the `-fork` build and a 1 KB loader to `/config/www/dev/`, adds the Lovelace resource
  `/local/dev/cgc-fork-loader.js?v=<sha>` and creates dashboard `/cgc-fork-test` (`require_admin: true`,
  not in the sidebar). The loader imports the fork bundle only on `/cgc-fork-test`, so other dashboards and other
  users only pay for the 1 KB loader. Family dashboards are not touched.
- **Switch** copies `dist/camera-gallery-card.js` (+ `.gz`) to `/config/www/cgc-fork/` and rewrites the URL of the
  existing `camera-gallery-card` Lovelace resource to `/local/cgc-fork/camera-gallery-card.js?v=<sha>`. Same element
  name, so `dashboards/*.yaml` don't change. The original resource is saved in
  `/share/backups/bl002/upstream-resource.json`.
- **Rollback** puts the saved HACS URL back (`/hacsfiles/camera-gallery-card/camera-gallery-card.js?hacstag=…`).
- Both take effect on each client's next full reload (close and reopen the app, or pull to refresh): an element that
  is already defined in an open page can't be replaced.
- **While switched, don't update camera-gallery-card in HACS.** HACS looks for its own resource URL; not finding it,
  it would add a second resource and both builds would try to define `camera-gallery-card`. To take an upstream
  release: roll back, update in HACS, rebase the fork (below), switch again.

### Later: HACS custom repository (after the owner pushes the fork to GitHub)

1. Push `owner-fork` to the owner's GitHub fork (his account; not possible from this host).
2. Tag a release there (e.g. `v3.1.0-owner.1`) with `dist/camera-gallery-card.js` attached, or commit `dist/`.
3. HACS: remove the upstream `camera-gallery-card`, add the fork as a custom repository (type Dashboard), download.
   HACS uses the repository name as the folder, so the two can't be installed at the same time.
4. Rollback: remove the custom repository, re-download upstream from HACS.

## Update the fork from upstream

```sh
cd /share/dev/camera-gallery-card
git fetch upstream --tags
git switch owner-fork
git rebase --onto vX.Y.Z v3.1.0 owner-fork   # vX.Y.Z = the new upstream release tag
# Drop fork commits that upstream has now merged (PR #253, #246, #152 if they land):
#   git rebase -i vX.Y.Z   -> delete those lines
nice -n 19 npm ci && nice -n 19 npm test && nice -n 19 npm run build
node deploy/ha-deploy.mjs test-install        # check on the phone first, then: switch
```

Cherry-picked PR commits keep their upstream authors; fork commits use
`274322693+momousta@users.noreply.github.com`.

## Upstream triage (2026-10-18)

House context: sensor mode only (FileTrack GIF/JPG/MP4), one live camera per card (7 Reolink, Ring doorbell with
go2rtc talkback, MIPC, Ring stick-up), Pixel 6 + iPhone companion apps, desktop. No Frigate, no media-source mode,
no PTZ, no popup cards, YAML-managed card configs.

| Item                | What                                                                 | Verdict                                                                                                                                                     | Action in the fork                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| #152                | Drag strip to scrub viewer (owner's request)                         | relevant; not implemented anywhere upstream                                                                                                                 | implemented, `scrub_on_drag` (commit `feat(thumbs): drag…`)                                                                                        |
| #245                | Pinch/ctrl-wheel in fullscreen image viewer zooms the hidden preview | relevant (images are the gallery here)                                                                                                                      | cherry-picked PR #253 + jsdom regression spec                                                                                                      |
| #155                | Fullscreen on Android/macOS (crop, wasted space)                     | relevant (Pixel app)                                                                                                                                        | cherry-picked PR #246 (full video height, CSS + spec); #239 vs #247/#248 are competing, unreviewed designs that need on-device testing → not taken |
| #229                | Live WebRTC falls back to a still in the Android app                 | relevant (Pixel app); no root cause or fix upstream; WebRTC doesn't run in this headless Chromium                                                           | not fixed; needs an on-device repro with `debug_enabled`                                                                                           |
| PR #249             | Talkback: restore receiver (listening) audio                         | maybe (doorbell uses talkback); stacked on #247, relies on HA private player fields                                                                         | not taken; owner to test on the phone first                                                                                                        |
| #210                | Reolink live audio laggy                                             | not relevant (Reolink cards use `live_auto_muted: true`)                                                                                                    | —                                                                                                                                                  |
| #237 / PR #238      | Unavailable cameras hidden in the editor picker                      | not relevant (configs are YAML)                                                                                                                             | — (PR #238 is clean if wanted later)                                                                                                               |
| #222                | Reolink + other media sources in one card                            | not relevant (sensor mode)                                                                                                                                  | —                                                                                                                                                  |
| #204                | Download sends m3u8                                                  | not relevant (sensor files download directly)                                                                                                               | —                                                                                                                                                  |
| #197                | Broken thumbnail (Frigate preview)                                   | not relevant (no Frigate)                                                                                                                                   | —                                                                                                                                                  |
| house: `.tmp` tiles | FileTrack lists `*.mp4.tmp` leftovers of cancelled recordings        | relevant (5 files, 1–4 MB each, on 4 cameras)                                                                                                               | fixed: `fix(sensor): don't show temporary files…`                                                                                                  |
| house: blank thumbs | Tiles not yet loaded stay blank after leaving a view and coming back | relevant; upstream v3.1.0 too: `disconnectedCallback` drops the reveal observer but keeps its set of observed tiles, so the new observer never watches them | fixed in `perf(thumbs): window the thumbnail strip…` (candidate for an upstream PR)                                                                |
| #184                | Skeleton loading                                                     | partly exists in v3.1.0 (thumb skeleton/spinner, preview skeleton); the fork's GIF stills shorten it                                                        | —                                                                                                                                                  |
| #187                | Paired .jpg as preview poster                                        | not applicable as-is: house pairs are `person_X.mp4` + `person_X_snapshot.jpg` (different stems), v3.1.0 pairs same stem only                               | — (see note)                                                                                                                                       |
| PR #252             | Pair snapshot/clip by timestamp proximity                            | not relevant: needs same-shape names, house uses a `_snapshot` suffix                                                                                       | —                                                                                                                                                  |
| #234                | Snapshot/preview view instead of live                                | not relevant (one live card per view)                                                                                                                       | —                                                                                                                                                  |
| #243                | Custom action per gallery item                                       | not relevant                                                                                                                                                | —                                                                                                                                                  |
| #218 / PR #236      | URL deep links (view/camera)                                         | maybe later (notification → gallery)                                                                                                                        | —                                                                                                                                                  |
| PR #244             | tap_action on live preview                                           | not requested                                                                                                                                               | —                                                                                                                                                  |
| PR #235             | Grid shape                                                           | not relevant (single layout)                                                                                                                                | —                                                                                                                                                  |
| PR #232             | Custom PTZ                                                           | not relevant (no PTZ cameras)                                                                                                                               | —                                                                                                                                                  |
| PR #253             | Fullscreen image zoom/pan                                            | relevant                                                                                                                                                    | taken (see #245)                                                                                                                                   |
| PR #246             | Fullscreen video height                                              | relevant                                                                                                                                                    | taken (see #155)                                                                                                                                   |

Already fixed upstream: none of the listed issues is fixed on upstream main (19 commits after v3.1.0, unreleased);
release PR #180 (3.2.0) is open.
Note (#187 / doorbell): pairing `<stem>.mp4` with `<stem>_snapshot.jpg` would merge 22 doorbell + 17 bedroom
duplicate tiles and avoid in-browser frame capture of the mp4s; it changes what is shown (one tile per event), so it
is a proposal, not done.
