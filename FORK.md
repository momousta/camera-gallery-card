# Owner fork of camera-gallery-card (BL-002)

Local fork of [TheScubaDiver/camera-gallery-card](https://github.com/TheScubaDiver/camera-gallery-card)
for this Home Assistant install. Branch `owner-fork`, based on the installed tag `v3.1.0`.
It lives in `/share/dev/camera-gallery-card` until the owner pushes it to his GitHub account.

## What the fork adds on top of v3.1.0

| Commit                                                   | What                                                                                                                                                                                      | Why                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `build: fork version 3.1.0-owner.1; CGC_ELEMENT_SUFFIX…` | `CGC_ELEMENT_SUFFIX=-fork npm run build` → `dist/camera-gallery-card-fork.js` defining `<camera-gallery-card-fork>`                                                                       | Test the fork next to the installed card                                          |
| `perf(thumbs): still first-frame thumbnails…`            | Sensor GIF tiles stream the GIF head (`Range`), stop at the end of the first frame, show it, keep a JPEG copy in IndexedDB. `gif_thumbnails: still` (default) / `animated` (v3.1.0 tiles) | Speed: the strip loaded every visible GIF in full                                 |
| `feat(thumbs): drag the thumbnail strip to scrub…`       | `scrub_on_drag: true` (default false), upstream issue #152                                                                                                                                | Owner's feature request                                                           |
| `feat(viewer): pinch-to-zoom… fullscreen image viewer`   | Cherry-pick of upstream PR #253                                                                                                                                                           | Fixes upstream #245                                                               |
| `fix(fullscreen): use full video height…`                | Cherry-pick of upstream PR #246                                                                                                                                                           | Part of upstream #155                                                             |
| `test(viewer): regression spec for #245…`                | jsdom spec for the #253 fix                                                                                                                                                               | Triage: a test per fix                                                            |
| `perf(render): build Intl date/time formatters once…`    | Cache `Intl.DateTimeFormat` and the 12/24-hour probe                                                                                                                                      | Speed: two formatter builds per thumbnail per render were the card's top CPU cost |
| `perf(render): coalesce poster-driven re-renders…`       | One card render per frame while thumbnails arrive                                                                                                                                         | Speed: N posters used to cost N full renders                                      |

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

| Item           | What                                                                 | Verdict                                                                                                                       | Action in the fork                                                                                                                                 |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| #152           | Drag strip to scrub viewer (owner's request)                         | relevant; not implemented anywhere upstream                                                                                   | implemented, `scrub_on_drag` (commit `feat(thumbs): drag…`)                                                                                        |
| #245           | Pinch/ctrl-wheel in fullscreen image viewer zooms the hidden preview | relevant (images are the gallery here)                                                                                        | cherry-picked PR #253 + jsdom regression spec                                                                                                      |
| #155           | Fullscreen on Android/macOS (crop, wasted space)                     | relevant (Pixel app)                                                                                                          | cherry-picked PR #246 (full video height, CSS + spec); #239 vs #247/#248 are competing, unreviewed designs that need on-device testing → not taken |
| #229           | Live WebRTC falls back to a still in the Android app                 | relevant (Pixel app); no root cause or fix upstream; WebRTC doesn't run in this headless Chromium                             | not fixed; needs an on-device repro with `debug_enabled`                                                                                           |
| PR #249        | Talkback: restore receiver (listening) audio                         | maybe (doorbell uses talkback); stacked on #247, relies on HA private player fields                                           | not taken; owner to test on the phone first                                                                                                        |
| #210           | Reolink live audio laggy                                             | not relevant (Reolink cards use `live_auto_muted: true`)                                                                      | —                                                                                                                                                  |
| #237 / PR #238 | Unavailable cameras hidden in the editor picker                      | not relevant (configs are YAML)                                                                                               | — (PR #238 is clean if wanted later)                                                                                                               |
| #222           | Reolink + other media sources in one card                            | not relevant (sensor mode)                                                                                                    | —                                                                                                                                                  |
| #204           | Download sends m3u8                                                  | not relevant (sensor files download directly)                                                                                 | —                                                                                                                                                  |
| #197           | Broken thumbnail (Frigate preview)                                   | not relevant (no Frigate)                                                                                                     | —                                                                                                                                                  |
| #184           | Skeleton loading                                                     | partly exists in v3.1.0 (thumb skeleton/spinner, preview skeleton); the fork's GIF stills shorten it                          | —                                                                                                                                                  |
| #187           | Paired .jpg as preview poster                                        | not applicable as-is: house pairs are `person_X.mp4` + `person_X_snapshot.jpg` (different stems), v3.1.0 pairs same stem only | — (see note)                                                                                                                                       |
| PR #252        | Pair snapshot/clip by timestamp proximity                            | not relevant: needs same-shape names, house uses a `_snapshot` suffix                                                         | —                                                                                                                                                  |
| #234           | Snapshot/preview view instead of live                                | not relevant (one live card per view)                                                                                         | —                                                                                                                                                  |
| #243           | Custom action per gallery item                                       | not relevant                                                                                                                  | —                                                                                                                                                  |
| #218 / PR #236 | URL deep links (view/camera)                                         | maybe later (notification → gallery)                                                                                          | —                                                                                                                                                  |
| PR #244        | tap_action on live preview                                           | not requested                                                                                                                 | —                                                                                                                                                  |
| PR #235        | Grid shape                                                           | not relevant (single layout)                                                                                                  | —                                                                                                                                                  |
| PR #232        | Custom PTZ                                                           | not relevant (no PTZ cameras)                                                                                                 | —                                                                                                                                                  |
| PR #253        | Fullscreen image zoom/pan                                            | relevant                                                                                                                      | taken (see #245)                                                                                                                                   |
| PR #246        | Fullscreen video height                                              | relevant                                                                                                                      | taken (see #155)                                                                                                                                   |

Already fixed upstream: none of the listed issues is fixed on upstream main (19 commits after v3.1.0, unreleased);
release PR #180 (3.2.0) is open.
Note (#187 / doorbell): pairing `<stem>.mp4` with `<stem>_snapshot.jpg` would merge 22 doorbell + 17 bedroom
duplicate tiles and avoid in-browser frame capture of the mp4s; it changes what is shown (one tile per event), so it
is a proposal, not done.
