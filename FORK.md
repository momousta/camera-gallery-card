# Owner fork of camera-gallery-card (BL-002)

Local fork of [TheScubaDiver/camera-gallery-card](https://github.com/TheScubaDiver/camera-gallery-card)
for this Home Assistant install. Branch `owner-fork`, based on the installed tag `v3.1.0`.
It lives in `/share/dev/camera-gallery-card`, and is pushed to the owner's GitHub fork
[momousta/camera-gallery-card](https://github.com/momousta/camera-gallery-card/tree/owner-fork) (remote `origin`,
over the SSH key `~/.ssh/id_ed25519_momousta`; `upstream` is TheScubaDiver's). First pushed 2026-10-20 at the
owner's "push everything".

**Live since 2026-10-18 13:04** (owner's go-ahead: "implement everything").

- **Now:** build `3.1.0-owner.18` (`?v=736ca029ebe5`) since 2026-10-21 11:37: NVR recordings from an exact moment.
  Needs the **NVR Playback** add-on `/addons/nvr_playback`, 0.2.1+ (0.4.0+ to save snapshots and clips, 0.4.1+ for
  cameras mounted sideways). Check the resource with `node deploy/ha-deploy.mjs status`. BL-008 so far:
  - Low / High; the strip coming to rest plays Low quietly;
  - the player's own controls, which hide while playing;
  - landscape full screen, also for the gallery's images;
  - on the picture: a double tap on a side skips 10 s (more taps, more), pinch zoom and one-finger panning; no
    "NVR" label or clock over it (the camera prints the time);
  - snapshot and record buttons that save to the phone (owner.12);
  - a swipe on the picture opens the next / previous camera at the same moment, streaming on in the same quality,
    or its closest snapshot (`swipe_cameras`; owner.12).
  - owner.13: swipes on snapshots and GIFs also when they start on a chevron, and in the image full screen.
  - owner.14: swipes work every time, also when they start slanted, slowly or on the pill row. The calendar closes
    on a press outside it. Cameras mounted sideways (Left Front, Right Front) show their whole portrait snapshot, and
    stream and save upright (the add-on's `rotate_channels`). New options `gallery_aspect_ratio` and `gallery_fit`;
    `gallery_chevrons_enabled: false` now also hides the image full screen's arrows.
  - owner.15: one viewer. A tap on a timeline camera opens that camera's page (this gallery) on the frame shown, at
    the timeline's moment; the timeline's own full view is gone. Low / High there start from that moment, a swipe
    carries it on, and Back returns to the timeline on the same moment. The cars page's Recording keeps Low / High
    in full screen: a `bare` player shows its own bar there.
  - owner.16: snapshots and GIFs full screen in the same player (its still mode: the same turn, controls, zoom,
    swipes; Low / High there play that moment); the full screen button at the bottom right, as in the player;
    auto-play all is a time-lapse of the day (stills 1 s, GIFs 3 s, clips to their end), so it works on the
    doorbell's snapshots. Front's gallery is 8:3 (its whole wide picture).
  - owner.17: a swipe in full screen stays full screen. The gallery's player makes the whole document full screen
    and covers it (`docfs`), so the next camera's player takes it over without asking again; the old page's card
    no longer exits the document's full screen when it goes.
  - owner.18: floodlight and siren buttons (`floodlight_entity`, `siren_entity`, `siren_duration`) at the picture's
    bottom left, in the gallery and the player alike (`ui/camera-actions.js`).
  - The cars page (the Vehicle Intelligence card's Recording button) creates the same `<cgc-nvr-player>`, so every
    player change reaches it with nothing to change there.
- **Earlier builds**, each saved in `/share/backups/bl002/<build>-<v>/`. To go back to one, copy both files into
  `dist/` and run `switch`.
  - `3.1.0-owner.17` (`?v=f6898cd586e8`, swipes keep full screen): `owner.17-f6898cd586e8/`.
  - `3.1.0-owner.16` (`?v=46b2a8af7c40`, pictures full screen in the player): `owner.16-46b2a8af7c40/`.
  - `3.1.0-owner.15` (`?v=55615685f366`, one viewer: the timeline opens camera pages): `owner.15-55615685f366/`.
  - `3.1.0-owner.14` (`?v=5efdba698b31`, dependable swipes, sideways cameras upright, calendar):
    `owner.14-5efdba698b31/`.
  - `3.1.0-owner.13` with the first swipe fix (the zoom reset keeping `pan-y`; `?v=c1ff6fe65f17`, live 13:20–13:39):
    `owner.13-c1ff6fe65f17/`. The plain owner.13 (`?v=73634d48ca26`) rebuilds from commit `415f87d`.
  - `3.1.0-owner.12` (`?v=aa147f734a4a`, save to the phone, swipe between cameras): `owner.12-aa147f734a4a/`.
  - `3.1.0-owner.11` (`?v=7bcf110dcdb8`, double-tap skip, pinch zoom): `owner.11-7bcf110dcdb8/`.
  - `3.1.0-owner.10` (`?v=df69b8b421eb`, the player's own controls, turned seek bar, landscape gallery images):
    `owner.10-df69b8b421eb/`.
  - `3.1.0-owner.9` (`?v=94836c9848f2`, quiet auto-play, landscape full screen, native controls):
    `owner.9-94836c9848f2/`.
  - `3.1.0-owner.8` (`?v=1bd78a4a0ec3`, BL-008 replay engine progress): `owner.8-1bd78a4a0ec3/`.
  - `3.1.0-owner.7` (`?v=3d277e449f92`, BL-008 with the download engine): `owner.7-3d277e449f92/`.
  - `3.1.0-owner.6` (`?v=76df89c30952`, deep links): `owner.6-76df89c30952/`.
  - `3.1.0-owner.5` (`?v=b3fa1f014fd6`, BL-007): `owner.5-b3fa1f014fd6/`.
  - `3.1.0-owner.4` (`?v=514a65062fdf`, BL-006): `owner.4-514a65062fdf/`.
  - `3.1.0-owner.3` (`?v=68f5d4fa0b24`): `owner.3-68f5d4fa0b24/`.
  - `3.1.0-owner.2` (`?v=9b81a5001b09`): `owner.2-9b81a5001b09/`.
- **Dashboards:** `dashboards/main.yaml` sets these on all 10 cards:
  - `scrub_on_drag: true`;
  - `thumbnail_folder: thumbs`, the previews kept by the **Gallery Thumbnails** add-on (`/addons/gallery_thumbs`);
  - `preload_thumbnails: true` with `preload_days: 2`;
  - `show_favorite: false`.
  - `nvr_channel` on the 7 NVR cameras (and on the timeline's cameras): Backyard right 0, Left front 1, Right front 2,
    Right back 3, Backyard left 4, Front 6, Front right 7. Not on the doorbell, bedroom or kids' room.
  - `floodlight_entity: light.<url_id>_floodlight` and `siren_entity: siren.<url_id>_siren` on the same 7.
  - `swipe_cameras: *swipe_cameras` (the timeline's camera list);
  - `gallery_chevrons_enabled: false` and `gallery_pills: {index_counter: {enabled: false}}` (owner 10-20: no arrows,
    no picture count); on all but the doorbell also `autoplay_all: {enabled: false}` (the auto-play-all pill plays a
    day's video clips in turn, and only the doorbell has clips);
  - Left Front and Right Front (mounted sideways): `gallery_aspect_ratio: "3:4"` and `gallery_fit: contain`.
- **Caps:** `max_media: 350` on the 7 NVR cameras (busiest day 192 clips, plus 144 stills a day since the 10-minute
  stills of 2026-10-20), 200 on the bedroom, and `max_media: 400` on the doorbell, which saves a Ring still every 5
  minutes since 2026-10-18 (288 a day plus events).

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
- **owner.6 (deep links)**, live:
  - the timeline at 13:00 → "Open camera" → the Front Right gallery on `hourly_20261019_130000.gif`, in gallery mode,
    with the address cleaned;
  - a moment on 10-17 → that day, on `motion_20261017_205744.gif`;
  - 0 page errors.
- **owner.7 (BL-008, NVR playback)**, live dashboards (Pixel 6 viewport):
  - The newest Front Right snapshot (16:00:11) → Low: playing in 2.95 s. The clock 5 s later read 4.8 s past the
    moment, and the camera's burned-in clock matched the player's to the second.
  - Backyard Right, 10 min into its recording: playing in 9.9 s.
  - A 10:00:00 snapshot (the end of the 09:30 file) → the next recording; playback continues into the next file at
    the end.
  - High on a browser without HEVC: "can't play the High stream (HEVC 4512×2512) … Play Low", and the NVR download
    is stopped.
  - Timeline, Front at the track moment (21 min into its recording): playing in 16 s, clock on the moment.
  - Every ingress request carried the session cookie the card set. Close sent `api/stop`. 0 page errors.
  - Channel map confirmed from each camera's burned-in name.
  - The harness answers the `supervisor/api` calls itself, because the Supervisor refuses them from add-ons. It
    forwards the ingress requests through a temporary in-container forwarder (removed after the tests).
- **owner.8 with add-on 0.2.0 (the NVR's own protocol)**, live dashboards (Pixel 6 viewport, 15 Mbps Wi-Fi):
  - Front Right, 16 min into its recording → Low: playing 2.1 s after the tap (v1: 10–19 s). The player's clock
    and the camera's burned-in clock both read 05:15:59 PM.
  - Backyard Right → High (H.264 2560×1440): playing in 3.0 s, no stall in 20 s, 15 s buffered ahead by then.
  - High on the 12 MP HEVC cameras: the browser without HEVC says so in 0.8 s (the codec arrives with the first
    frames).
  - Timeline, Front Right 95 min back → Low: playing in 2.6 s, clock on the moment; closing returns to the track.
  - Regression: `tlopen` (Open camera lands on the same file) and `cal` (calendar) unchanged.
- **owner.9 with add-on 0.2.1** (10-19 22:44), live dashboards, Pixel 6 viewport, 15 Mbps Wi-Fi. The 1-min load
  was 5–8 from another session.
  - Seeking (`--nvrseek`): back 2 min, back to the file's start, forward 400 s and back 30 s each played on in
    1.5–1.9 s. Before the fix, back 2 min and back 10 min stalled 25 s, then failed once (502).
  - Real touch drag on the strip, released (`--script nvrauto`):
    - a quiet Low player started when the strip came to rest, and showed itself, playing, 1.0–1.1 s later;
    - while it loaded it was never visible (opacity 0 in every 50 ms sample), with no spinner and no text;
    - its clock matched the burned-in clock.
  - A tap on another thumbnail: selected, nothing started.
  - Full screen through the player's button:
    - the player's own root held it (the document sees `<home-assistant>`);
    - portrait 412×915, so the picture was turned 90° to fill the screen, still playing;
    - the native full-screen button is hidden;
    - leaving it worked, and playback went on.
  - Timeline full view → Low: plays, clock on the moment. The bare bar now has the full-screen button.
  - Regression: `tlopen` (same file) and `cal` unchanged.
- **owner.10** (10-20 10:37), live dashboards, Pixel 6 viewport, real touch input (`--script nvrfs`):
  - **The owner's report:** dragging the seek bar in landscape landed elsewhere. Chrome's native video timeline
    measures the drag along the screen's x axis, which the turned bar no longer follows.
  - **Now:** the player's own seek bar. A real drag from 25 % to 75 % along the turned bar (down the screen)
    showed 0.50 at mid-drag, right under the finger, and landed at 0.755: 0.75 plus the playback since release.
  - **Controls:**
    - over the picture, with no native controls;
    - shown when it starts, hidden 2.6 s later; a tap shows them again;
    - full screen from the bottom bar, turned 90° and filling 412×915; left again while still playing.
  - **Gallery image full screen** (an hourly 4512×2512 snapshot): turned 90° on the portrait screen, with the real
    full screen held by the overlay.
  - **Regression:**
    - quiet auto-play: unseen while loading, a tap doesn't start it;
    - the Timeline full view → Low: plays, the clock on the moment;
    - `nvr` seeks.
- **owner.11** (10-20 10:58), live dashboards, Pixel 6 viewport, real CDP touches (`--script nvrgest`, the gallery;
  `--script vigest`, the cars page):
  - **The owner's report:** zoom and double-tap skipping didn't work; the "NVR" label and the clock covered the
    picture, which shows the time itself.
  - **Gallery, inline and in turned full screen (the same results):**
    - a double tap on the right: +10 s with a "+10 s" bubble; a third tap right after: +10 s more ("+20 s");
    - on the left: −10 s; in the middle: nothing, and the controls stay as they were;
    - a single tap shows the controls after the 300 ms wait for a second tap;
    - the overlay reads only "Low High 6:56 / 28:02": no "NVR" label or clock;
    - a two-finger pinch from 20 % to 50 % of the width: 2.5×, the point between the fingers kept within 1.5 px;
    - one finger then pans (−59 px for −59.4), and a double tap still skips while zoomed;
    - the chip resets the zoom; leaving full screen resets it too.
  - **Gallery image full screen:** a pinch gives 2.6× (fingers 80 → 208 px apart), turned.
  - **The cars page:** the Vehicle Intelligence card's own viewer and Recording button (a stand-in photo of
    front_right, since its lists need a family member's login) opened `<cgc-nvr-player>` from this bundle
    (`?v=7bcf110dcdb8`, the same class), `bare`, channel 7, playing in 0.8–1.5 s. Every gesture result above
    matched there too, inline (a 16:9 box) and in turned full screen.
  - Harness note: CDP touches wait for the page's acknowledgement. Under load, a pair of taps can arrive 0.5 s
    apart and count as two single taps (seen once); the probe now sends them back to back.
- **owner.12** (10-20 12:18), live dashboards, Pixel 6 viewport, real CDP touches, with NVR Playback 0.4.0
  (`--script nvrsave`, `nvrswipe`, `tlswipe`; `nvrgest`, `vigest` again):
  - **The owner's ask:** "a button to capture a snapshot when the video is playing and another to start
    recording, and both save the files to my phone"; "when I swipe left and right it should move me to the next
    cam and start streaming from the same moment and using the same quality if it's already streaming, or the
    closest snapshot if it's not streaming, and for the doorbell only the closest snapshot".
  - **Saving:**
    - record on Front Right (Low): the REC chip read 0:02, then 0:08; stop → "Saved · Front Right 2026-10-20
      11-00-01.mp4" and a download of that name. The file: 9.1 s, H.264 896×512 + AAC, decoded cleanly
      (ffmpeg);
    - the snapshot → "Front Right 2026-10-20 11-00-12.jpg", 896×512, EXIF DateTimeOriginal 11:00:12.
    - Harness limit: the download request itself bypasses the harness's ingress routing (real HA refused its
      fake ingress cookie). The same URLs fetched from the add-on gave the files above, with
      `Content-Disposition: attachment; filename="…"`.
    - Add-on alone (the API from inside its container): a 60 s Low clip, 8.2 MB, answered in 0.12 s; a 30 s
      High clip (HEVC 4512×2512, 20 fps), 31.7 MB, in 0.05 s; both decode; NVR channel names for unnamed files
      ("Front right", "Front").
  - **Swiping:**
    - a snapshot on Front Right → Front, on its snapshot closest to the moment, no stream; the history length
      unchanged (the page is replaced);
    - streaming Low on Front (11:53:43) → Doorbell: its closest snapshot, the stream kept → Left Front: playing
      Low from 11:53:44 (the camera's own clock shows it), labelled "Left Front";
    - full screen (turned) on Left Front, a swipe along the turned picture → Right Front, playing, still in
      turned full screen;
    - Timeline full view: Front Right (Low) → Front (channel 6, playing from the moment on screen) → Doorbell
      (its closest frame, the stream kept) → Left Front (channel 1, playing).
  - **Regression:** double-tap skips, the streak, pinch 2.5×, panning, the chip and full-screen resets, the
    gallery's image pinch, and the cars page (the same results there).
- **owner.13** (10-20 12:56), live dashboards, Pixel 6 viewport, real CDP touches (`--script stillswipe`, the
  owner's flow: the page opens live, a tap on a thumbnail, then swipes):
  - **The owner's report:** "swiping doesn't work on still images or the GIFs, only when streaming it swipes".
  - **Causes:**
    - a swipe starting on a chevron (shown for a few seconds after a tap, at the picture's edges, where a thumb
      starts a swipe) was ignored. And the browser took the gesture there: the chevron's `overflow: hidden`
      makes it a scroll container, where the preview's `touch-action: pan-y` no longer applies, so the pointer
      was cancelled after the first move;
    - the image full screen had no swipe at all.
    - The stream player covers the chevrons, so streaming swipes worked.
  - **Now:**
    - from the right chevron, all moves arrive and the swipe opens Front (camera1);
    - real taps on the chevrons still step to the next / previous snapshot of the same camera;
    - image full screen: Front Right → Front → Doorbell → Left Front, each opened full screen (turned on this
      portrait screen, the document still full screen).
  - **Regression:** the streaming flows (`nvrswipe`): snapshot → Front; stream → Doorbell (stream kept) → Left
    Front streaming; full-screen stream → Right Front, still full screen.
  - The swipe state no longer re-renders the card on every finger move.
- **owner.14** (10-20 13:39), live dashboards, Pixel 6 viewport, real CDP touches, with NVR Playback 0.4.1
  (`--script swipevariants`, `portrait`; `nvrswipe`, `nvrgest`, `vigest` again):
  - **The owner's report:** "swiping doesn't always work, especially on the front and front right cameras"; no
    arrows, no picture count; "what is the icon beside the count?"; the calendar should close on a click outside
    it; Left Front and Right Front are portrait: their GIFs showed only part of the picture, and the stream was
    sideways.
  - **Why swipes failed:** the zoom reset, run on every change of snapshot, cleared the picture's
    `touch-action: pan-y`. Lit doesn't write an unchanged attribute again, so from the second snapshot on, the
    browser panned on a sideways swipe and cancelled it. A swipe starting slanted, or on the pill row, was also
    cancelled before it read as sideways.
  - **Now:**
    - the zoom reset restores `pan-y`;
    - swipes are also read from touch events, start to end (≥ 45 px, within 45° of horizontal, within 5 s), in
      the gallery and in the player, where the browser's own pan no longer cancels them.
    - On Left Front and Front, all six real-touch variants moved to the next camera: straight, a slanted start,
      30° down, slow (1.4 s), from the pill row, from the right edge.
  - **Cameras mounted sideways:** the NVR records the sensor's landscape frame. Turned 90° clockwise, its frames
    match the GIFs (correlation 0.987 Left Front, 0.991 Right Front), so the add-on's `rotate_channels` holds
    channels 1 and 2 at 90. On both pages:
    - the gallery is a 396×528 (3:4) box showing the whole 360×646 GIF;
    - Low streams upright in that box (`rotate` 90 from the add-on);
    - full screen stays portrait: not turned, the picture across the whole width;
    - Left Front's saved snapshot is 512×896, upright; its clip is H.264 896×512 with the phone-style turn
      (ffprobe: rotation −90), and its first frame, turned by the player, matches the snapshot.
  - **Calendar:** opened from the date, closed by a press below the card (both cameras).
  - **No arrows or count:** after a tap on the picture, the pills are auto-play, full screen, Low and High, with
    no chevrons. The auto-play icon (`mdi:playlist-play`, upstream's `autoplay_all`) plays a day's video clips one
    after another; it does nothing on GIF / JPG galleries.
  - **Regression:**
    - `nvrswipe`: a snapshot on Front Right → Front's; a stream on Front → Doorbell (stream kept) → Left Front
      playing Low from the same second; a full-screen stream on Left Front → Right Front, still full screen;
    - `nvrgest` (gallery) and `vigest` (cars page, the same element and bundle): double-tap skips and the streak,
      pinch 2.5×, panning, a skip while zoomed, the chip and full-screen resets, the gallery image's pinch.
    - Under load (load average 4–5.5), CDP sometimes delivered a double tap's second tap more than 300 ms after
      the first, so it read as two single taps. One run each of the cars page's zoomed full-screen skip and
      middle double tap; each passed in the other run. The tap code is unchanged in owner.14.
- **owner.15** (10-20 15:35), live dashboards, Pixel 6 viewport, real CDP touches, with NVR Playback 0.4.1
  (`--script tlpage`, `vifs`, `pills`; `nvrswipe`, `nvrgest` again):
  - **The owner's ask:** hide auto-play-all except on the doorbell; "the timeline view when I open a camera shows
    a different view than what we have been fixing"; "on the vehicle when I click on recording and do full screen
    I no longer see the low and high setting".
  - **Timeline** (`tlpage`): the timeline set to 14:58, a tap on Left Front's tile → its page in 0.27 s, on the
    tile's GIF (14:51), the link's moment 14:58 kept; pills full screen, Low, High; Low played from 14:58 (the
    camera's clock within 0.03 s). The header's back arrow → the timeline, the same element, on 14:58.
    - First run: the arrow went to the dashboard's first view. Home Assistant's back arrow only steps back when the
      history entry says where it came `from` (its own navigate writes that); the timeline now writes it too.
  - **Cars page** (`vifs`, its own viewer on a stand-in photo of Front Right, then Recording): inline, no player bar
    (the card's own Low / High above); full screen: the player's Low / High and close; High → the player switched
    (`nvr-stream` "main"; HEVC doesn't decode in headless Chromium); out of full screen, the bar is gone again.
    The card's own Low / High still showed Low: it doesn't follow `nvr-stream` (the Vehicle Intelligence card's
    code).
  - **Pills** (`pills`): the doorbell: auto-play all and full screen; Front Right: full screen, Low, High.
  - **Regression:** `nvrswipe` (snapshot → Front; stream → Doorbell → Left Front playing; full-screen stream →
    Right Front, still full screen) and `nvrgest` (skips, streak, pinch 2.5×, panning, a skip while zoomed, the
    chip and full-screen resets, the gallery image's pinch).
- **owner.16** (10-20 16:47), live dashboards, Pixel 6 viewport, real CDP touches, with NVR Playback 0.4.2
  (`--script fs16 --fsmode main|iphone|swipe|portrait|front|auto`; `nvrswipe`, `nvrgest`, `vifs`, `swipevariants`,
  `tlpage` again):
  - **The owner's report:** "the front camera snapshots and GIFs don't show fully, they're trimmed from both
    sides"; "the full screen on the snapshots or GIFs doesn't work as it works beautifully for the streaming from
    the NVR"; "the full screen button location on the snapshot is up, I like its location better on the
    streaming"; "the auto play button doesn't work on the ring doorbell".
  - **Front:** its stills are 1280×480 and its GIFs 360×136 (8:3), cut to 16:9 at both sides. Now a 396×149 (8:3)
    box with `contain`: the whole picture.
  - **Full screen** (Front Right, a still): the button at the bottom right → the player's full screen (document full
    screen, the picture turned 90 on the portrait screen, as a recording); its controls hid after 1.8 s and a tap
    brought them back; a double tap zoomed 2.5× and another went back; Low played that moment's recording
    (the player's clock within 5 ms), still full screen; leaving full screen, it played on inline.
    - Left Front's portrait still: full screen, upright and not turned (713×1280).
    - Front's: turned, the whole 8:3 picture.
    - A swipe along the turned picture → Front's closest snapshot, full screen again (document full screen).
    - Without element full screen (`--fsmode iphone`: `requestFullscreen` removed, as on an iPhone): the player
      covered the window (top, left middle and bottom right all hit it), Low played there, and leaving it put it
      back in the gallery's box.
  - **Doorbell auto-play:** 202 items today, the newest selected; the button → the day's first (00:03) and 3 stills
    on after 3.1 s; pressed while playing; a second tap stopped it.
  - **Regression:**
    - `nvrswipe`: snapshot → Front; stream → Doorbell (stream kept) → Left Front playing; full-screen stream →
      Right Front, still full screen;
    - `nvrgest`: skips, streak, pinch 2.5×, panning, a skip while zoomed, the chip and full-screen resets. Its
      picture-pinch step now pinches in the player's still full screen: 2.6× as expected, turned. One run broke
      off before playing (the probe found no player); the next passed.
    - `vifs` (cars page): full screen Low / High, High switched, the bar gone inline;
    - `swipevariants` from Front's new 8:3 box: all six moved;
    - doorbell: its snapshot full screen in the player, no Low / High, the close button;
    - `tlpage`: Timeline → Left Front on a 10-minute still, Low from the track's moment, Back to the same moment.
- **owner.17** (10-20 22:01), live dashboards, Pixel 6 viewport, real CDP touches (`--script fs16 --fsmode strict`:
  every full-screen request after the first one fails, as in the HA app's WebView without a fresh touch):
  - **The owner's report:** "when I swipe to the next camera when on full screen, it doesn't load the next camera
    on full screen".
  - **Causes:** the full screen was the player element's own, so it ended with the page, and the next page's player
    had to ask again (refused in the app; desktop Chromium allowed it, so earlier probes passed). The leaving page's
    gallery card also exited any document full screen in its `disconnectedCallback` (upstream), and Home Assistant
    attaches the next page before it removes the last.
  - **Now:** snapshots Front Right → Front → Doorbell → (from Front) Left Front, all full screen, with one request
    in total; the exit button back to the gallery; a stream on Left Front → Right Front playing full screen.
  - **Regression:** `nvrswipe`, `nvrgest` (including the still full screen's pinch, 2.6×).
- **owner.18** (10-21 11:37), Front Right, Pixel 6 viewport, real CDP touches (`--script acts`; the harness relay
  now answers every `call_service` itself and records it, so no test touches the house):
  - **The owner's ask:** "add flash and siren controls to the cameras … on top of the still images, GIFs, videos,
    or live stream, similar to the full screen button".
  - Buttons at the bottom left over live, a snapshot, the playing recording (above its seek bar) and its turned full
    screen; a floodlight tap → `light.turn_on light.front_right_floodlight`; the siren: one tap armed ("Tap again"),
    the second → `siren.turn_on` with `duration: 10` (pulsing red), a third → `siren.turn_off`.
  - Regression: `nvrgest` (skips, pinch, the still full screen's pinch).
- **Not checked:** real phones, iOS Safari (native HLS, HEVC), live WebRTC and talkback (WebRTC doesn't run in
  headless Chromium). The HA app's WebView was emulated by the portrait screen without an orientation lock.

Harness and results: `/share/dev/bl002-work`.

- Scripts: `harness/measure_golive.mjs --script touch3|fast|staricon|count|preload|browsefull|cal|tl|tlopen|nvr|tlnvr`
  (`tl` with `--tag camera-timeline-card --view timeline [--shot file.png]`; `nvr` / `tlnvr` with
  `--nvr <forwarder> --nvr-ingress <ingress path> [--nvrstream sub|main] [--nvrat <ms>] [--nvrwatch <ms>]
[--nvrseek "-120,-600,+400"] [--tlnvr '{entity: ch}']`. `--nvrwatch` counts the stalls while playing, and
  `--nvrseek` seeks by those seconds and times each one. `nvrauto`: a real touch drag on the strip, the quiet
  start, a tap, and full screen. `nvrfs`: the overlay controls, a real touch drag on the turned seek bar, and
  the gallery's image full screen).
- Results: `results/golive-*.jsonl`, `results/star-*.jsonl` and `results/live.jsonl`.

## What the fork adds on top of v3.1.0

| Commit                                                                                                                | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Why                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build: fork version 3.1.0-owner.1; CGC_ELEMENT_SUFFIX…`                                                              | `CGC_ELEMENT_SUFFIX=-fork npm run build` → `dist/camera-gallery-card-fork.js` defining `<camera-gallery-card-fork>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Test the fork next to the installed card                                                                                                                                                                                                   |
| `perf(thumbs): still first-frame thumbnails…`                                                                         | Sensor GIF tiles stream the GIF head (`Range`), stop at the end of the first frame, show it, keep a JPEG copy in IndexedDB. `gif_thumbnails: still` (default) / `animated` (v3.1.0 tiles)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Speed: the strip loaded every visible GIF in full                                                                                                                                                                                          |
| `feat(thumbs): drag the thumbnail strip to scrub…`                                                                    | `scrub_on_drag: true` (default false), upstream issue #152                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Owner's feature request                                                                                                                                                                                                                    |
| `feat(viewer): pinch-to-zoom… fullscreen image viewer`                                                                | Cherry-pick of upstream PR #253                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Fixes upstream #245                                                                                                                                                                                                                        |
| `fix(fullscreen): use full video height…`                                                                             | Cherry-pick of upstream PR #246                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Part of upstream #155                                                                                                                                                                                                                      |
| `test(viewer): regression spec for #245…`                                                                             | jsdom spec for the #253 fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Triage: a test per fix                                                                                                                                                                                                                     |
| `perf(render): build Intl date/time formatters once…`                                                                 | Cache `Intl.DateTimeFormat` and the 12/24-hour probe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Speed: two formatter builds per thumbnail per render were the card's top CPU cost                                                                                                                                                          |
| `perf(render): coalesce poster-driven re-renders…`                                                                    | One card render per frame while thumbnails arrive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Speed: N posters used to cost N full renders                                                                                                                                                                                               |
| `perf(thumbs): start GIF stills on reveal…`                                                                           | Queue a tile's still when it scrolls into view; first visits don't wait for an empty IndexedDB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Speed: first thumbnails sooner (finished from eng-gallery's WIP `ea9415d`)                                                                                                                                                                 |
| `fix(sensor): don't show temporary files…`                                                                            | Sensor fileLists skip `.tmp`/`.part`/`.crdownload`/… and dotfiles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Cancelled recordings left `_tmp_*.mp4.tmp` (1–4 MB) as broken tiles that still downloaded                                                                                                                                                  |
| `build: fork version 3.1.0-owner.2`                                                                                   | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Live 2026-10-18 13:04–16:39                                                                                                                                                                                                                |
| `perf(thumbs): window the thumbnail strip…`                                                                           | Only the tiles around the visible strip are real (blocks of 24, two strip-lengths each side, at most 72); every other item is an empty box of the same size. Also re-arms the reveal observer when HA re-attaches the card                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Speed: a doorbell still every 5 min means ~300 tiles a day. Also fixes blank thumbnails after returning to a view                                                                                                                          |
| `perf(thumbs): draw the favourite star as inline SVG…`                                                                | An `<svg>` with HA's own mdi paths instead of a per-tile `<ha-icon>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Speed: card-mod re-reads computed styles on every `ha-icon`, after each update and 5 more times over 1.25 s                                                                                                                                |
| `build: fork version 3.1.0-owner.3`                                                                                   | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `feat(thumbs): previews next to the files (thumbnail_folder)…`                                                        | Server previews (`<dir>/thumbs/<file>.jpg`) for tiles, scrub frames (always), the placeholder under the full file and video posters; `preload_thumbnails`/`preload_days` load the day's previews, then the neighbour days'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | BL-006: photos were tiles and scrub frames in full (1–6 MB)                                                                                                                                                                                |
| `feat(date): pick the day from a month calendar`                                                                      | Tap the date: month grid, days with media pickable, HA first weekday                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | BL-006: owner asked for a calendar                                                                                                                                                                                                         |
| `build: fork version 3.1.0-owner.4`                                                                                   | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `refactor(date): one month calendar for both cards`                                                                   | The calendar is `src/ui/calendar-picker.js` + its styles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Shared with the timeline card                                                                                                                                                                                                              |
| `feat(timeline): camera-timeline-card…`                                                                               | A second element: every camera on one time track (shared moment, previews, play, calendar, full view, preloading)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | BL-007: owner asked for one timeline for all cameras                                                                                                                                                                                       |
| `style(timeline): taller activity lanes`                                                                              | 7 px lanes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | An easier thumb target                                                                                                                                                                                                                     |
| `build: fork version 3.1.0-owner.5`                                                                                   | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| PR #236 (6 commits, cherry-picked, authors kept)                                                                      | `url_id` deep links: `?cgc_id=…&cgc_view=live/gallery&cgc_camera=…`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Notification and timeline links into a card                                                                                                                                                                                                |
| `feat(deep-link): open the gallery on one file or moment…`                                                            | Fork: `cgc_src` (an exact file of the card's own) and `cgc_time` (the frame at or before a moment), applied on in-app navigation too, removed from the address after use                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | BL-007 follow-up: the timeline's "Open camera" should land on the same snapshot                                                                                                                                                            |
| `feat(timeline): Open camera opens that camera's gallery…`                                                            | Timeline cameras' `gallery_id` → the link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Same                                                                                                                                                                                                                                       |
| `build: fork version 3.1.0-owner.6`                                                                                   | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `feat(nvr): play the NVR recording from the selected moment…`                                                         | `<cgc-nvr-player>` (src/nvr): ingress session + add-on lookup, progress while the NVR file downloads, hls.js or native HLS from the moment, Low / High, next file at the end. Gallery pill `nvr` (`nvr_channel`, `nvr_addon`), timeline full view (cameras' `nvr_channel`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | BL-008: owner asked for low / high NVR playback from the moment; HA's own Reolink playback fails on this firmware                                                                                                                          |
| `build: fork version 3.1.0-owner.7`                                                                                   | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `feat(nvr): progress for the add-on's replay engine`                                                                  | Status `engine` (`replay`/`download`) and the replay states; "Opening the … recording" with no "skipping N min", polled every 150 ms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Add-on 0.2.0 plays the moment through the NVR's own protocol, ready in about a second                                                                                                                                                      |
| `build: fork version 3.1.0-owner.8`                                                                                   | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `feat(nvr): the strip coming to rest plays Low quietly; landscape full screen; seeking retries`                       | `nvr_autoplay` (default on): the scrub gesture's settle starts a `quiet` player (unseen, no progress or errors, shown once it plays; taps don't start it). Full-screen button (native one hidden): orientation lock where possible, else the picture turned on a portrait screen; iPhone: the video's own. hls.js asks again for a replay segment after 15 s. `warmNvr`: the add-on lists the camera's day when the gallery opens                                                                                                                                                                                                                                                                                                                 | Owner 10-19 21:14: seeking back broke; full screen should be landscape; stop scrolling → Low in the background, quietly; a tap shouldn't stream                                                                                            |
| `build: fork version 3.1.0-owner.9`                                                                                   | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `feat(nvr): the player's own controls over the picture; landscape full screen for gallery images`                     | Overlay controls (top bar, play / pause, a seek bar along its own axis, mute, full screen) that hide while playing and come back on a tap; no native controls. `util/landscape`: the turn shared by the player and the gallery's image full screen (turned on a portrait screen; pan and zoom mapped into the turned frame; the real full screen requested)                                                                                                                                                                                                                                                                                                                                                                                       | Owner 10-20 09:54: dragging the seek bar in landscape landed elsewhere; the bar made the picture smaller; gallery snapshots stayed portrait                                                                                                |
| `build: fork version 3.1.0-owner.10`                                                                                  | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `feat(nvr): double tap skips 10 s, pinch zooms; no NVR label or clock over the picture`                               | Gestures on the picture (pointer events): a double tap on the left or right (outside the middle fifth of the picture's own frame) seeks ∓/±10 s with a bubble, further taps within 0.8 s add 10 s; a single tap waits 300 ms for a second one; pinch zoom on the fingers' midpoint (1–8×), one-finger pan, trackpad pinch / Ctrl + wheel, mapped into the turned frame; a zoom chip resets it, as do a new start and full screen changes. The top bar keeps only Low / High and close (bare: none)                                                                                                                                                                                                                                                | Owner 10-20 10:36: zooming and double-tap skipping didn't work; the NVR clock and label are redundant (the camera prints the time); fixes must reach the cars page too (it creates the same element)                                       |
| `build: fork version 3.1.0-owner.11`                                                                                  | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `feat(nvr): save snapshots and clips to the phone; swipe between cameras`                                             | Player: snapshot (the frame on screen, posted to the add-on) and record (the stretches played, cut by the add-on into an MP4) buttons, REC chip, toasts; downloads from the add-on (the HA app keeps the name); a clip is saved on Low / High, the next recording, close, or its longest. A horizontal swipe on the picture fires a cancelable `nvr-swipe`; a re-attached player starts again where it was; `fullscreen` starts it full screen. Gallery: `swipe_cameras` (the timeline cameras' shape) → the next / previous camera's page at the same moment (`cgc_near`, `cgc_nvr`, `cgc_fs`), streaming on, or its closest snapshot; a camera without NVR passes the stream on. Timeline full view: the same between its cameras               | Owner 10-20 11:17: snapshot / record buttons saving to the phone; swipe left / right to the next camera at the same moment, same quality when streaming, the doorbell only its snapshot                                                    |
| `build: fork version 3.1.0-owner.12`                                                                                  | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `fix(swipe): swipe on snapshots and GIFs from the chevrons and in the image full screen`                              | A swipe may start on a chevron (no pointer capture there, so a tap still steps through the items); `.pnavbtn { touch-action: pan-y }` (its overflow made it a scroll container where the preview's pan-y didn't apply: the browser took the swipe). The image full screen swipes to the next camera (one finger, not zoomed, along the turned picture), opening its snapshot full screen (`cgc_fs` without `cgc_nvr`); a full-screen stream arriving at a camera without NVR opens its snapshot full screen. The swipe state is no longer reactive                                                                                                                                                                                                | Owner 10-20 12:41: "swiping doesn't work on still images or the GIFs, only when streaming it swipes"                                                                                                                                       |
| `build: fork version 3.1.0-owner.13`                                                                                  | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `feat: dependable swipes, upright sideways cameras, calendar closes on an outside press`                              | Gallery: the zoom reset restores the preview's `touch-action` (`pan-y`, `auto` live) instead of clearing it; swipes are also read from touch events, start to end (≥ 45 px, within 45°, within 5 s). Player: the same touch swipes (also over the loading / error screen; the pointer path swipes for a mouse only); the add-on's `rotate` turns a portrait channel's video (`.nvr.portrait`, `.nvr-video.quarter`, composed with the zoom), its full screen isn't turned and locks portrait, and snapshots are drawn upright. `OutsidePress`: a press outside the calendar closes it (gallery and Timeline). Options `gallery_aspect_ratio` / `gallery_fit` (gallery only); `gallery_chevrons_enabled` also hides the image full screen's arrows | Owner 10-20 13:08: "swiping doesn't always work, especially on the front and front right cameras"; no arrows, no count; close the calendar on a click outside it; Left Front / Right Front are portrait: GIFs cut off, the stream sideways |
| `build: fork version 3.1.0-owner.14`                                                                                  | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `feat: one viewer: timeline cameras open their page; the player's own bar in full screen`                             | Timeline: a tap on a camera opens its page (`navigation_path`, with `cgc_src` + `cgc_time` = the track's moment); the full view (its picture, Low / High, swipes) is removed, with `nvr_channel` / `nvr_addon` there. The pushed history entry carries `from`, as HA's navigate does, so HA's back arrow returns to the timeline. Gallery: a link's moment (`_moment`) for its item: Low / High start there and a swipe carries it. Player: a `bare` player shows its own Low / High and close in full screen                                                                                                                                                                                                                                     | Owner 10-20 14:29: "the timeline view when I open a camera shows a different view … fix in one place"; "on the vehicle … full screen I no longer see the low and high setting"                                                             |
| `build: fork version 3.1.0-owner.15`                                                                                  | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `feat: pictures full screen in the NVR player; full screen button at the bottom right; auto-play all as a time-lapse` | Player: `still` (a snapshot or GIF shown in the player until Low / High: the same turn, overlay controls that hide, pinch / double-tap zoom, swipes; Low / High play that moment's recording in place), `nvr-fullscreen` event, a window-covering full screen where there is no element full screen (an iPhone). Gallery: a picture's full screen opens the player (still mode; clips keep the gallery's overlay), ending back in the gallery unless a recording started; the full screen pill moves to the picture's bottom right (`.pfs-btn`, overlay mode); auto-play all steps forward in time through stills (1 s), GIFs (3 s) and clips (to their end), stopping at the newest, a second tap, or another pick                               | Owner 10-20 16:17: full screen on snapshots / GIFs "as it works for streaming", the button where the player has it, auto-play on the doorbell                                                                                              |
| `build: fork version 3.1.0-owner.16`                                                                                  | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `fix(fullscreen): a swipe in full screen stays full screen`                                                           | Player `docfs` (set by the gallery): full screen is the player covering the window, with the document full screen underneath; ownership is handed to the next page's player on a swipe (no second request; a 10 s timer ends it if nobody takes it), and only the owner ends it. The gallery's `disconnectedCallback` exits only its own (element) full screen                                                                                                                                                                                                                                                                                                                                                                                    | Owner 10-20 21:46: "when I swipe to the next camera when on full screen, it doesn't load the next camera on full screen"                                                                                                                   |
| `build: fork version 3.1.0-owner.17`                                                                                  | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |
| `feat: floodlight and siren buttons over the picture`                                                                 | `ui/camera-actions.js` (states → buttons, the buttons, their styles), used by the gallery (over snapshots, GIFs, clips, live) and the player (`actions`, `nvr-action`; above its seek bar while it plays). Options `floodlight_entity`, `siren_entity`, `siren_duration`. The siren arms on a first tap (3 s), sounds on the second, stops on a tap                                                                                                                                                                                                                                                                                                                                                                                               | Owner 10-21: "add flash and siren controls to the cameras … on top of the still images, GIFs, videos, or live stream, similar to the full screen button"                                                                                   |
| `build: fork version 3.1.0-owner.18`                                                                                  | Version shown in the bundle banner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The live build                                                                                                                                                                                                                             |

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
