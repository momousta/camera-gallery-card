<img width="1640" height="624" alt="B-leftaligned-dark" src="https://github.com/user-attachments/assets/c691413f-e475-4ff6-b636-352e420cef0b" />

# Camera Gallery Card

Custom **Home Assistant Lovelace card** for browsing camera media in a clean **timeline-style gallery** with preview player, object filters, optional live view, and a built-in visual editor.

**Current version:** `v3.1.0` <!-- x-release-please-version -->

<p align="center">
  <img src="https://github.com/user-attachments/assets/1c71ada8-98bb-435e-bbc6-b6974186c2e0" width="30%" />
  <img src="https://github.com/user-attachments/assets/40caf878-bc55-4cfd-9381-3a353785acf3" width="30%" />
</p>

---

## Installation

### HACS (Recommended)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=TheScubadiver&repository=camera-gallery-card&category=plugin)

1. Click the button above
2. Click **Download**
3. Restart Home Assistant

## Quick start

Got the card installed? Here's the fastest way to see something on screen.

1. In Home Assistant, open your dashboard and click **Edit dashboard** (top right).
2. Click **Add card** and search for **Camera Gallery Card**.
3. Pick a **source mode** when prompted:
   - **Sensor mode** — you have snapshot files in `/config/www/...` (e.g. saved by an automation). Also requires [FileTrack](#filetrack-optional--for-sensor-mode).
   - **Media mode** — you use Frigate, a NAS folder, or anything reachable via Home Assistant's media browser.
   - **Combined mode** — both at once, merged into one timeline.
4. Save. The editor walks you through the rest.

> [!TIP]
> Not sure which mode? See [Choosing a source mode](#choosing-a-source-mode) below.

> [!NOTE]
> The card shows files that **already exist**. It does *not* trigger snapshots itself — that's the job of a Home Assistant automation or your camera integration (e.g. Frigate). If your gallery is empty, you probably need to set up a snapshot automation first.

### FileTrack (optional – for sensor mode)

> **Using sensor mode?** Follow the steps below to set up your file sensors.

The **FileTrack** integration creates a sensor that scans a folder and exposes its contents as a `fileList` attribute — this is what the Camera Gallery Card reads in **sensor mode**.

FileTrack is a fork of the archived [files integration by TarheelGrad1998](https://github.com/TarheelGrad1998/files).

1. Open **HACS**
2. Go to **Integrations**
3. Click the three-dot menu and choose **Custom repositories**
4. Add `https://github.com/TheScubadiver/FileTrack` as an **Integration**
5. Search for **FileTrack** and install it
6. **Restart Home Assistant**
7. Go to **Settings → Devices & Services** and add **FileTrack**

> [!NOTE]
> Once you have installed FileTrack, you can leave it alone. No need to configure anything in FileTrack — everything is configured in the card editor UI.

<img width="434" height="181" alt="Scherm­afbeelding 2026-03-28 om 13 51 00" src="https://github.com/user-attachments/assets/3d0bb033-7523-4204-bedf-2548cebbbec1" />

---

## Features

### Gallery

- Image & video preview
- **Fullscreen image viewer** — tap to open in fullscreen, rotates to landscape on mobile, with pinch-to-zoom, pan, double-tap and mouse wheel zoom (owner fork: snapshots and GIFs open in the NVR player's full screen, see below)
- Timeline thumbnails with lazy loading
- Day grouping
- Filename timestamp parsing
- Object filter buttons with custom icon support
- Object detection pill in timestamp bar
- Horizontal or vertical thumbnail layout
- Mobile friendly
- Media type icon (image / video)
- Cover / Contain option for media display
- **Favorites** — star any item with a tap; filter the timeline to show only favorites
- **Prev / next + keyboard navigation** — arrow buttons in the fullscreen viewer, plus <kbd>←</kbd>/<kbd>→</kbd> on desktop
- **Runtime mute pill** — tap-to-mute pill on the video preview, independent of the global auto-mute toggle

<img width="490" height="407" alt="Scherm­afbeelding 2026-03-29 om 17 05 49" src="https://github.com/user-attachments/assets/6817a0ae-5d57-4ebf-8c8d-b5452c66ad66" />

### Sources

- Sensor entities with `fileList` (sensor mode)
- Home Assistant `media_source` (media mode)
- **Combined mode** — use a sensor entity and a media source simultaneously, merged into a single timeline
- Multiple sensors or media folders

#### Choosing a source mode

| You have… | Use |
|---|---|
| Frigate (add-on or container) | `media` |
| Files in `/config/www/<folder>/` saved by an automation | `sensor` (+ FileTrack) |
| A NAS or external folder mounted as a media source | `media` |
| A mix of the above | `combined` |

**Sensor mode** reads file paths from a Home Assistant sensor's `fileList` attribute. You create that sensor with the **FileTrack** integration.

**Media mode** uses Home Assistant's built-in media browser — anything you can browse in HA (Frigate, Samba, local media) works as a source.

**Combined mode** merges a sensor source and a media source into one timeline (useful when you have both legacy snapshot files and a newer Frigate setup).

> [!TIP]
> Curious how Frigate, Reolink and custom NVRs are handled internally? See [How sources are routed](#how-sources-are-routed-under-the-hood) below.

#### How sources are routed under the hood

When you use `source_mode: media` (or `combined`), the card picks an engine per media-source URI:

| URI prefix | Engine | `path_datetime_format` |
|---|---|---|
| `media-source://frigate/...` | Frigate REST / events path — uses event-id timestamps directly | not needed |
| `media-source://reolink/...` | Dedicated Reolink engine — parses Reolink's folder/file titles intrinsically | not needed |
| Anything else (Synology, BlueIris, NAS, custom NVR, ...) | Generic calendar walker | **required** — set this to match how dates appear in your file paths |

A few notes on the generic walker:

- The NVR must be visible as a `media-source://...` in Home Assistant's **Media** browser (sidebar). Without that, the card can't browse it.
- NVRs that only expose RTSP / SMB without a media-source integration can fall back to `source_mode: sensor` with a FileTrack-style sensor that lists the file paths.
- If `path_datetime_format` is missing or wrong, the gallery won't be able to group by day or sort by time — but clips still appear. Use the **Auto-detect format** button in the editor to probe your sources and suggest a format.

### Live view

- Native Home Assistant **WebRTC live preview**
- Redesigned live view layout: camera name on the left, controls on the right
- **Controls mode** — choose between `overlay` (controls fade out after inactivity) or `fixed` (always visible)
- Native fullscreen button (iOS + Android/desktop)
- **Pinch to zoom in fullscreen** — touch, trackpad, and Ctrl + scroll wheel; pan with the mouse after zooming in
- **Aspect ratio toggle** — quickly switch between 16:9, 4:3 and 1:1, remembered per camera
- Live badge
- **Multiple live cameras** — configure several cameras and switch between them using chevron arrows
- **Multi-camera grid layout** (`live_layout: grid`) — show all cameras at once, tap a tile to focus on one
- **Multiple RTSP streams** — configure multiple named RTSP streams via `live_stream_urls`
- **Offline camera placeholder** — unavailable cameras show a clear "offline" tile instead of a black frame
- **Keyboard navigation** — <kbd>←</kbd>/<kbd>→</kbd> to switch between cameras in single layout
- Default live camera
- Camera friendly names and entity IDs in selector
- Auto-teardown of stream + push-to-talk on view switch (no audio/bandwidth leak)
- **Two-way audio (talkback)** — tap the mic pill in live view to speak through a camera's backchannel speaker. Per-camera, with tap-to-toggle or push-to-talk modes. *Advanced setup* — see [Two-way audio](#two-way-audio-advanced) below.

### Actions

- **Menu buttons** — configure custom action buttons (toggle, navigate, perform action, etc.) accessible via a hamburger menu during live view
- Delete (sensor files + Frigate clips)
- Multiple delete with red selection style
- Download
- Long-press action menu

### Frigate

- **WebSocket via HA integration** (default) — uses the official Frigate HA integration's WS API. CORS-free, no `frigate_url` required, works with standalone Frigate containers. **New events arrive in real time** — no polling, no refresh.
- **Direct REST API** (`frigate_url`, optional) — even faster if your Frigate is reachable from the browser
- Automatic fallback: if REST fails, WS path takes over
- Automatic Frigate snapshot thumbnails
- **Frigate clip delete** via `rest_command` — see [Delete setup](#delete-setup)

### Thumbnails

- Automatic frame capture for **all** video sources in media source mode
  - Frigate cameras: Frigate snapshot
  - All other sources (NAS, Blue Iris, etc.): first-frame capture
- Sensor mode: first-frame capture
- Sensor mode GIF clips: a still first frame by default (`gif_thumbnails: still`). The card fetches only the head of each GIF with an HTTP `Range` request (typically 5–20 % of the file), and caches the still in IndexedDB, so a second visit needs no download at all. `gif_thumbnails: animated` loads and animates the whole GIF in every tile, as before
- **Drag to scrub** (`scrub_on_drag: true`): press and drag the thumbnail strip; the viewer follows the thumb under the centre line (Ring / iOS Photos style). While you drag, the viewer shows the thumbnail; the clip loads, and a video plays, when you let go. A tap still selects; mouse drag and the mouse wheel scrub too
- **Previews next to the files** (`thumbnail_folder: thumbs`): the strip and scrubbing use small JPEG previews (10–30 KB) instead of the clips and photos themselves; the full file loads when you stop on it. With `preload_thumbnails: true` the day's previews, then the neighbouring days', load in the background, so scrolling never waits
- **Calendar**: tap the date to pick a day from a month calendar; days with media are highlighted, the others can't be picked. A tap anywhere outside it closes it
- **Paired image + video** — when a snapshot and clip share the same filename stem they're shown as one item, with the image used as the thumbnail

### NVR recordings (owner fork)

With `nvr_channel` set, the gallery pills get **Low** and **High**. They play the Reolink NVR's own recording from
the selected item's moment:
- playback starts in a second or two, anywhere in a recording (add-on 0.2+), and its seek bar seeks anywhere in
  that half hour;
- Low and High switch in place, and playback continues into the next recording;
- the player has its own controls over the picture (play / pause, a seek bar with the clock time under the
  finger, mute, full screen; Low / High and close at the top). They hide while it plays, and a tap brings them
  back. Nothing else covers the picture: the time of day is the one the camera prints on it;
- on the picture, a double tap on its left or right side goes back or forward 10 s, and each further tap there
  adds 10 s. Pinch zooms on the point between the fingers (up to 8×), one finger then moves the zoomed picture,
  and the magnifier chip at the top (shown with the controls) returns to the whole picture. A trackpad pinch or
  Ctrl + wheel zooms too;
- full screen is landscape: Chrome turns the screen. In an app's WebView (the Home Assistant app), where a page
  can't turn the screen, the picture is turned while the screen is portrait; hold the phone sideways. The seek
  bar, the double taps and the zoom follow the turned picture. iPhones use their own player;
- **saved to the phone** (NVR Playback add-on 0.4.0+): the camera button saves the frame on screen as a JPEG; the
  record button records what plays until you stop it (a red REC chip shows the clip's length) and saves an MP4.
  The clip is the camera's own stream, cut by the add-on from what it already sent, so it's ready as soon as you
  stop. Seeks and skips while recording are cuts; pauses aren't recorded. Switching Low / High, the next
  recording or closing the player saves the clip so far. Clips are at most 15 minutes in Low and 5 in High. Files
  are named `<camera> <date> <time>` (the NVR's local time, as printed on the picture) and carry that time, so
  galleries file them under the moment they show. They download from the add-on, so the Home Assistant app keeps
  their names (Android: Downloads).

**Swiping between cameras** (`swipe_cameras`): a swipe left / right on the picture opens the next / previous
camera of the list at the same moment, replacing the page (Back goes where you came from). It works anywhere on
the picture, also starting on the chevrons (a tap on them still steps through the snapshots), slowly (up to 5 s)
or slanted (up to 45°), and in the gallery's image full screen. While a recording plays, that camera plays its
recording from the moment on screen, in the same quality. Otherwise it shows its snapshot closest to the moment.
Full screen (the player's or the image's) stays full screen: in the gallery the player's full screen is the whole document's, which outlasts
the page change, and the player covers it, so the next camera's player takes it over without asking the
browser again (the Home Assistant app refuses a second request without a fresh touch). A camera without `nvr_channel` (a doorbell) shows
its closest snapshot, and swiping on from it streams again. The list has the timeline card's `cameras` shape
(`gallery_id` = each gallery's `url_id`, `navigation_path` = its page), so one YAML anchor serves both.

**From the timeline card:** a tap on a camera opens that camera's page, this gallery, on the frame shown at the
timeline's moment. Low / High there play from that moment, a swipe carries it on to the next camera, and Back
returns to the timeline on the same moment. The timeline has no viewer of its own, so every change to this one
reaches it.

The Vehicle Intelligence card's **Recording** button opens this same player (`<cgc-nvr-player>`, defined by this
bundle), so it has the same controls and gestures, with that card's own Low / High and back button above it. In
full screen, where those can't be seen, the player shows its own Low / High and close, as in the gallery.

**Full screen for snapshots and GIFs** is the same viewer: the full screen button (at the bottom right of the
picture, where the player has it) opens the picture in `<cgc-nvr-player>`, without a stream. So it turns as a
recording does (a landscape picture on a portrait screen, not a portrait one), its controls hide and come back on
a tap, it pinch-zooms and pans, a double tap zooms on that point (again: the whole picture), and a swipe opens the
next camera at the same moment, full screen. Low / High at its top play that moment's recording right there, and
it plays on when full screen ends; otherwise leaving full screen returns to the gallery. A camera without
`nvr_channel` (the doorbell) has no Low / High there. Where the browser has no element full screen (an iPhone),
the player covers the window instead. Video clips keep the gallery's own full screen, and `fullscreen_zoom` no
longer applies to pictures.

**Floodlight and siren** (`floodlight_entity`, `siren_entity`): buttons at the bottom left of the picture,
opposite the full screen button and shown and hidden with the other controls, over everything the card shows:
snapshots, GIFs, clips, live, and the NVR player (inline and full screen, above its seek bar), so the cars page's
player could carry them too. The floodlight lights up yellow while on. The siren takes two taps (a stray tap
doesn't sound it), pulses red while it sounds, and stops on a tap.

**Camera tiles** (`custom:camera-tile-card`, same bundle; owner fork): one camera's live picture for an overview
page, in the same design: the name at the top left, a red chip while a `detections` sensor is on, the floodlight
and siren buttons (the same code and two-tap siren as the gallery) at the bottom left, full screen at the bottom
right. A tap opens the camera's page (`navigation_path`; Back returns). Full screen covers the window over the
document's full screen: a landscape camera turns on a portrait screen, the controls hide and come back on a tap, a
double tap or a pinch zooms, and a swipe goes to the page's next tile, still full screen. Options: `entity` (the
live stream, Home Assistant's own player), `name`, `navigation_path`, `aspect_ratio` (`"9:16"` for a camera on its
side), `fit` (`contain` default, or `cover`), `live: false` (a still refreshed every 10 s, for a battery doorbell),
`floodlight_entity`, `siren_entity`, `siren_duration`, `detections` (`entity`, `label`, `icon`).

**A picture at once while live connects** (owner fork; the tiles and the gallery's live view): Home Assistant's
player is black until the stream's first keyframe. A poster covers that wait and fades when the first frame shows.
It is the last frame this phone saw of the camera: the playing video is copied every 30 s, and when the view closes,
into a small JPEG (≤960 px) in `localStorage`, already turned like the stream. A kept frame is used for up to 6 h.
When none is kept, or it is over 10 min old, a snapshot sized to the box loads as well
(`camera_proxy?width=…&height=…`, ~90 KB instead of a 1–2 MB full frame). Snapshots come back unturned, so the
poster applies the camera's orientation setting (`camera/get_prefs`) the way go2rtc turns the stream. Nothing to
configure.

**Cameras mounted sideways** (a portrait picture): the NVR records the sensor's landscape frame. The add-on's
`rotate_channels` option (NVR Playback 0.4.1+) says how far to turn a channel. The player then shows it upright,
in a portrait box, and keeps full screen portrait. Saved snapshots are upright, and saved clips carry the turn,
as phones write it. For that camera's snapshots and GIFs, `gallery_aspect_ratio: "3:4"` with `gallery_fit:
contain` shows the whole picture.

With `scrub_on_drag`, scrolling the strip and letting it come to rest plays the Low stream of the moment it rests
on, quietly: nothing shows while it loads, and the video replaces the snapshot once it plays (about a second). A
tap on a thumbnail, the chevrons, a new day or a link don't start it. `nvr_autoplay: false` turns this off.

Low is the sub stream (H.264, plays everywhere). High is the main stream (HEVC, only where the device decodes
it). This needs the **NVR Playback** add-on. It asks the NVR for the moment through the NVR's own protocol, as the
Reolink app does, and serves it through Home Assistant ingress. If that protocol is refused, it falls back to
fetching the recording file, and the progress then shows over the snapshot.

### Video controls

- Video autoplay toggle (gallery)
- **Auto-play all** (owner fork): plays the day as a time-lapse, forward in time from the selected item (from the
  day's first when the newest is selected): a snapshot for 1 s, a GIF for 3 s, a clip to its end. It stops at the
  newest item, on a second tap, or when you pick something else (upstream only went on after a clip ended, so on
  a gallery of snapshots it did nothing)
- Separate auto-mute toggle for gallery and live view
- Per-object filter color customization

<img width="441" height="307" alt="Scherm­afbeelding 2026-03-29 om 20 49 53" src="https://github.com/user-attachments/assets/bdcde10e-b882-444f-a99d-0ae0073e68a7" />

### Editor

Built-in Lovelace editor with tabs:

- **General**
- **Viewer**
- **Live**
- **Thumbnails**
- **Styling**

Features:

- Entity suggestions
- Media folder browser (starts at root)
- Field validation
- Object filter picker
- Controls mode dropdown (Overlay / Fixed)
- Menu buttons tab — configure action buttons with entity, icon, label and on/off icon
- Frigate URL field — set the direct Frigate API URL (shown in media and combined mode)
- Deep-link id field — set `url_id` for notification deep-links, see [Notification deep-links](#notification-deep-links)
- **Auto-detect path datetime format** — scans your sources and suggests a working format
- Cleanup of legacy config keys
- Live preview in the HA card picker
- Create new FileTrack sensor from the General tab

### Debug mode

Enable **Debug mode** in the General tab to surface a debug pill in live view. Tapping it opens a diagnostics modal with card version, HA info, Frigate state, runtime queue stats, and the active source/path. Useful for support questions and issue reports.

### Styling

The **Styling** tab provides a visual editor for colors and border radius.

<details>
<summary>Show styling sections</summary>

| Section | Options |
|---|---|
| Card | Background, Border color, Border radius |
| Preview bar | Bar text color, Pill color |
| Thumbnails | Bar background, Bar text color, Border radius |
| Filter buttons | Background, Icon color, Active background, Active icon color, Border radius |
| Today / Date / Live | Text color, Chevron color, Live active color, Border radius |

</details>

---

## Delete setup

The card supports two independent delete paths. Configure either or both — they're complementary:

### Sensor file delete (shell_command)

For sensor mode items (and combined-mode sensor-backed items). Add a `shell_command` to your `configuration.yaml`:

```yaml
shell_command:
  gallery_delete: 'rm -f "{{ path }}"'
```

Then in the card editor: **General → Delete services → Sensor** → pick `shell_command.gallery_delete`.

> [!NOTE]
> Sensor delete is path-based. The path must start with `/config/www/` (or resolve from `/local/`). Media-source URIs without a filesystem mapping can't use this path.

### Frigate clip delete (rest_command)

For Frigate event items in any source mode. Add a `rest_command` that calls Frigate's `DELETE /api/events/<id>` endpoint:

```yaml
rest_command:
  delete_frigate:
    url: "http://frigate.local:5000/api/events/{{ event_id }}"
    method: DELETE
```

Then in the card editor: **General → Delete services → Frigate** → pick `rest_command.delete_frigate`.

> [!TIP]
> Frigate's DELETE event endpoint wipes the clip, snapshot, and thumbnail in one call. The card hides paired items together after a successful delete.

> [!WARNING]
> The variable names in your `shell_command` and `rest_command` templates **must stay exactly as shown**. The card passes `{{ path }}` to the sensor delete service, and `{{ event_id }}` plus `{{ camera }}` to the Frigate delete service (so you can template `{{ camera }}` into the URL if your Frigate setup needs it). Renaming any of these (e.g. `{{ path }}` → `{{ filepath }}`) silently breaks the call. After editing `configuration.yaml`, restart Home Assistant (or reload YAML via *Developer Tools → YAML*).

### Confirmation & bulk

- `delete_confirm` — show confirmation dialog (default: `true`)
- `allow_bulk_delete` — enable multi-select bulk delete (default: `true`)

---

## Notification deep-links

Opt-in URL parameters so an HA notification action can open this exact card straight into live view or the gallery. Nothing here does anything until you set `url_id` — without it the card ignores the query string entirely, which matters because the query string is page-scoped and would otherwise be picked up by every camera-gallery-card on the dashboard at once.

Set a `url_id` in the editor's **Source → View** section (or `url_id: porch` in YAML), then point a notification action at:

```
/lovelace/home?cgc_id=porch&cgc_camera=camera.porch_gate
```

| Parameter | Meaning |
|---|---|
| `cgc_id` | Must match the card's `url_id` exactly, or the whole query string is ignored |
| `cgc_view` | `live` or `gallery` — which screen to open |
| `cgc_camera` | An entry from the card's own live camera list — a camera entity, or a `live_stream_urls` stream — opens live view on that camera |
| `cgc_src` | Owner fork: one of the card's own gallery files (e.g. `/local/snapshots/cam/motion_20261019_120000.gif`) — opens the gallery on that file, switching to its day |
| `cgc_time` | Owner fork: a moment (epoch ms or seconds, or ISO 8601) — opens the gallery on the item at or just before it; the fallback when `cgc_src` is gone. While the linked item stays selected, Low / High play from this moment and a swipe to the next camera carries it on |

A worked example, e.g. from a motion automation:

```yaml
action: notify.mobile_app_your_phone
data:
  message: "Motion at the porch"
  data:
    clickAction: "/lovelace/home?cgc_id=porch&cgc_camera=camera.porch_gate"
```

`?cgc_id=porch&cgc_view=gallery` opens the gallery on the newest clip regardless of `thumb_sort_order` — with one caveat: once a day has more items than `max_media` (default 50), the gallery only ever holds the oldest `max_media` of them under `oldest` sorting, so the deep link lands on the newest clip *within that truncated window*, not necessarily the day's actual newest clip. That truncation applies to `oldest` sorting generally, deep link or not.

> [!NOTE]
> `cgc_camera` only works together with live view. The gallery's sources are configured separately from the live camera list, and the card has no camera-to-clip mapping, so a camera can't filter the gallery. Passing `cgc_camera` therefore implies live view — and an explicit `cgc_view=gallery` makes `cgc_camera` be ignored.

> [!NOTE]
> Deep links apply when the card first initializes on page load. Navigating to the same URL within an already-open dashboard may not re-run that initialization, since Home Assistant is a single-page app — for a reliable deep link, the notification should open the dashboard fresh (e.g. via `clickAction`) rather than assume a tab already on the dashboard will react.

> [!NOTE]
> All of `cgc_id`, `cgc_view`, and `cgc_camera` are case-sensitive. `cgc_view=Gallery` isn't recognized as `gallery` — and if a camera is also present, that falls through to opening *live* instead, the opposite of what a mistyped gallery link probably intended. And if more than one card on the dashboard shares the same `url_id`, they'll all react to the same query string at once — keep `url_id` unique per card.

> Owner fork: the parameters apply once and are then removed from the address, also when the card's page is opened by in-app navigation (a view HA had already built, e.g. from a tap on a timeline card's camera), not only on page load. A `cgc_src` that isn't one of the card's own items is ignored, so a link can't make the card load anything new.

---

## Configuration options

<details>
<summary>Show all configuration options</summary>

| Option | Description |
|------|------|
| **Source** | |
| `source_mode` | `sensor`, `media`, or `combined` |
| `entity / entities` | Sensor source(s) |
| `media_source / media_sources` | Media browser source(s) |
| `path_datetime_format` | Format pattern for parsing timestamps from paths. Needed in **all source modes** for day grouping and time sort. Exceptions: Frigate sources (`media-source://frigate/...`) carry their own event-id timestamps, and Reolink sources (`media-source://reolink/...`) are parsed intrinsically by the dedicated engine |
| `max_media` | Max media items |
| **Frigate** | |
| `frigate_url` | Optional direct Frigate REST API URL (e.g. `http://192.168.1.x:5000`). If omitted, the card uses the HA Frigate integration via WebSocket |
| **Gallery view** | |
| `start_mode` | Default view: `gallery` or `live` |
| `url_id` | Opt-in id for notification deep-links. See [Notification deep-links](#notification-deep-links) |
| `preview_position` | `top` or `bottom` |
| `clean_mode` | Hide overlays when preview is closed |
| `object_fit` | Media display mode: `cover` or `contain` |
| `aspect_ratio` | Preview aspect ratio: `16:9`, `4:3`, or `1:1` |
| `autoplay` | Auto-play videos in gallery |
| `auto_muted` | Auto-mute videos in gallery |
| **Thumbnails** | |
| `thumb_layout` | `horizontal` or `vertical` |
| `thumb_size` | Thumbnail size in px |
| `thumb_bar_position` | Thumb timestamp bar position |
| `thumb_sort_order` | `newest_first` or `oldest_first` |
| `gif_thumbnails` | Sensor-mode GIF tiles: `still` (default; cached first frame from a small `Range` request) or `animated` (whole GIF per tile) |
| `scrub_on_drag` | Drag the horizontal thumbnail strip to scrub the viewer; clips load on release (default `false`) |
| `thumbnail_folder` | Sensor mode: a folder next to each file holding small previews named `<file name>.jpg` (e.g. `thumbs` → `/local/cam/thumbs/clip.gif.jpg`, made by a thumbnailer). Used for the strip, the frames shown while scrubbing (the full file loads when you stop), as the placeholder under the full file and as video posters. A missing preview falls back to the file itself (default off) |
| `preload_thumbnails` | With `thumbnail_folder`: preload the previews of the whole day, nearest the selection first, then of the days around it (default `false`) |
| `preload_days` | Days on each side of the shown day to preload, 0–7 (default `2`) |
| **NVR recordings (owner fork)** | |
| `nvr_channel` | The camera's channel on a Reolink NVR. Adds **Low** / **High** pills that play the NVR's recording from the selected item's moment, through the NVR Playback add-on (default off) |
| `nvr_addon` | That add-on's slug (default `local_nvr_playback`) |
| `nvr_autoplay` | With `scrub_on_drag`, letting the scrolled strip come to rest plays the Low stream of that moment, quietly (default `true`) |
| `swipe_cameras` | The cameras in order, as the timeline card's `cameras` (`gallery_id`, `navigation_path`, `name`): a swipe on the picture opens the next / previous one at the same moment. `name` names saved files. This card must be in the list (its `url_id`) |
| `gallery_aspect_ratio` | The viewer's shape in the gallery only (not live), as `W:H`, e.g. `"3:4"` for a camera mounted sideways (default: `aspect_ratio`) |
| `gallery_fit` | `cover` or `contain` for the gallery's snapshots and GIFs only; thumbnails and live keep `object_fit` (default: `object_fit`) |
| `floodlight_entity` | Owner fork: the camera's floodlight (`light.*`): a button at the picture's bottom left toggles it, over snapshots, GIFs, clips, live and NVR recordings (also full screen) |
| `siren_entity` | Owner fork: the camera's siren (`siren.*`): a button next to it; the first tap arms it ("Tap again", 3 s), the second sounds it, a tap while it sounds stops it |
| `siren_duration` | Seconds the siren sounds (1–300, default 10) |
| `gallery_chevrons_enabled` | The previous / next arrows over the gallery's picture, also in its full screen (default `true`) |
| `gallery_pills` | Per-pill settings, e.g. `index_counter: {enabled: false}` hides the "3 / 40" count |
| `bar_position` | Preview timestamp bar position |
| `bar_opacity` | Preview timestamp bar opacity |
| **Live view** | |
| `live_enabled` | Enable live mode |
| `live_camera_entity` | Default camera entity for live view |
| `live_camera_entities` | Camera entities visible in the live picker |
| `live_layout` | `single` or `grid` (multi-camera) |
| `live_grid_labels` | Show camera name labels in grid mode |
| `live_stream_urls` | Array of named RTSP streams: `[{url, name}]` |
| `live_auto_muted` | Auto-mute audio in live view |
| `controls_mode` | Live controls display: `overlay` or `fixed` |
| `show_camera_title` | Show camera name in controls bar |
| `persistent_controls` | Always show controls (don't fade out) |
| `menu_buttons` | Configurable action buttons in the hamburger menu |
| `live_mic_streams` | Per-camera map of go2rtc backchannel streams. See [Two-way audio](#two-way-audio-advanced) |
| `live_go2rtc_stream` | Legacy single-camera fallback for talkback |
| `live_go2rtc_url` | Optional direct go2rtc URL for the live video fast-path |
| `live_mic_mode` | Mic interaction model: `toggle` (default) or `ptt` |
| `live_mic_audio_processing` | Per-mic Web Audio constraints |
| `live_mic_ice_servers` | Advanced. Override built-in STUN list with custom STUN/TURN |
| `live_mic_force_relay` | Advanced. Force `iceTransportPolicy: "relay"` (TURN-only) |
| **Filters** | |
| `object_filters` | Filter buttons (built-in and custom) |
| `object_colors` | Color per object filter |
| **Delete** | |
| `delete_service` | Sensor file delete service (`shell_command.*`) |
| `frigate_delete_service` | Frigate clip delete service (`rest_command.*`) |
| `delete_confirm` | Show confirmation before deleting (default: `true`) |
| `allow_bulk_delete` | Enable bulk delete (default: `true`) |
| **Layout & misc** | |
| `card_height` | Card height in px |
| `pill_size` | Pill text size (px) — pills scale around this |
| `row_gap` | Vertical spacing between rows (preview / controls / topbar / filters / thumbnails) in px. Default `8`, range 0–40 |
| `debug_enabled` | Show debug pill with diagnostics in live view |
| `style_variables` | Custom CSS variable overrides |

</details>

---

## Example configurations

### Two-way audio (talkback)

Multi-camera setup with mic on the two cameras that actually have speakers:

```yaml
type: custom:camera-gallery-card
source_mode: media
live_enabled: true
live_camera_entities:
  - camera.front_door     # mic-capable doorbell
  - camera.driveway       # mic-capable PTZ
  - camera.backyard       # no speaker, intentionally omitted from the map
live_mic_streams:
  camera.front_door: front_door     # go2rtc streams: key
  camera.driveway: driveway
live_mic_mode: ptt        # press-and-hold; omit for tap-to-toggle
```

See [Two-way audio (advanced)](#two-way-audio-advanced) for prerequisites and TURN setup.

### Minimal — sensor mode

For users with file sensors (FileTrack) pointing at local camera storage. **Create the FileTrack sensors first** via *Settings → Devices & Services → FileTrack* (or use the editor's **Create new FileTrack sensor** button on the General tab) — the entity ids below should match what you created.

```yaml
type: custom:camera-gallery-card
source_mode: sensor
entities:
  - sensor.frontdoor_files
  - sensor.driveway_files
path_datetime_format: YYYY-MM-DD_HH-mm-ss   # matches "2026-03-09_12-31-10_person.jpg"
delete_service: shell_command.gallery_delete   # see "Delete setup"
object_filters:
  - person
  - car
```

> [!NOTE]
> The `path_datetime_format` line is what gives your items dates. Adjust it to match how your snapshot files are actually named — the example here matches the recommended filename format (`YYYY-MM-DD_HH-mm-ss_<object>.jpg`). See [Path datetime format](#path-datetime-format) for more layouts, or use **Auto-detect** in the editor.

### Frigate via HA integration (no `frigate_url` needed)

For Frigate add-on or standalone container — uses the HA WebSocket path, CORS-free. If you also want clip delete to work, set up `rest_command.delete_frigate` first — see [Delete setup](#delete-setup).

```yaml
type: custom:camera-gallery-card
source_mode: media
media_sources:
  - media-source://frigate/main/event/clips/all/all/recent/7
path_datetime_format: YYYY/MM/DD/HHmmss
frigate_delete_service: rest_command.delete_frigate
live_enabled: true
live_camera_entities:
  - camera.frontdoor
  - camera.driveway
live_layout: single
object_filters:
  - person
  - car
```

### Reolink NVR / Doorbell / camera

The official **Reolink HA integration** exposes recordings under
`media-source://reolink/...`. The card detects this prefix and routes
those sources through a dedicated engine (mirrors Advanced Camera
Card's approach) — no `path_datetime_format` needed, no `M`/`D` token
gymnastics, no manual day-URI:

```yaml
type: custom:camera-gallery-card
source_mode: media
media_sources:
  - media-source://reolink/CAM|01JVCNA6DC12AMNF2QE2SWXNK3|0
live_enabled: true
live_camera_entities:
  - camera.deurbel
```

How it works under the hood:
- The engine auto-promotes a `CAM|...` URI to `RES|...|main` so the user
  only has to copy the camera-level URI from HA's media browser. (Want
  the sub stream? Paste the `RES|...|sub` URI directly — the engine
  leaves explicit RES URIs alone.)
- Day folders titled `2026/4/9` (unpadded) are parsed directly — no
  date-token configuration.
- File titles starting with `HH:mm:ss` are parsed to derive each clip's
  timestamp; the rest of the title (duration, detection tags) is ignored
  for now.
- Playback uses HA's MP4 proxy URL via `media_source/resolve_media` —
  same fast path that Advanced Camera Card uses. No HLS wrapping.
- Thumbnails are intentionally not generated for Reolink clips (the
  integration provides none, and first-frame capture would re-fetch the
  MP4 via the camera proxy — same trade-off ACC makes). The Reolink
  brand mark is shown instead.

**Find your CAM URI:** open Home Assistant → Media → Reolink, click on
your camera, and copy the path from the breadcrumb. It looks like
`media-source://reolink/CAM|<long-id>|<channel>` where `<channel>` is
`0` for single-lens cameras and `0..N` for NVR channels.

---

## Styling / CSS variables

All visual styling can be customized via the **Styling** tab in the editor.

<details>
<summary>Show all CSS variables</summary>

| Variable | Element | Default |
|---|---|---|
| `--cgc-card-bg` | Card background | theme card color |
| `--cgc-card-border-color` | Card border | theme divider color |
| `--r` | Card border radius | `10px` |
| `--cgc-tsbar-txt` | Preview bar text color | `#fff` |
| `--cgc-pill-bg` | Preview pill background | theme secondary bg |
| `--cgc-tbar-bg` | Thumbnail bar background | theme secondary bg |
| `--cgc-tbar-txt` | Thumbnail bar text color | theme text color |
| `--cgc-thumb-radius` | Thumbnail border radius | `10px` |
| `--cgc-obj-btn-bg` | Filter button background | theme secondary bg |
| `--cgc-obj-icon-color` | Filter icon color | theme text color |
| `--cgc-obj-btn-active-bg` | Active filter background | primary color |
| `--cgc-obj-icon-active-color` | Active filter icon color | `#fff` |
| `--cgc-obj-btn-radius` | Filter button border radius | `10px` |
| `--cgc-ctrl-txt` | Today/date/live text color | theme secondary text |
| `--cgc-ctrl-chevron` | Date navigation chevron color | theme text color |
| `--cgc-live-active-bg` | Live button active background | error color |
| `--cgc-ctrl-radius` | Controls bar border radius | `10px` |
| `--cgc-pill-size` | Pill text size (px). Fixed-mode pill height scales as `2 ×` this value | `14px` |

</details>

---

## Object filters

Supported built-in filters:
```
bicycle · bird · bus · car · cat · dog · motorcycle · person · truck · visitor
```

Custom filters with a custom icon can be added via the editor.

Object filter colors can be assigned per filter type in the editor.

> [!TIP]
> Recommended filename format for object detection:
> ```
> 2026-03-09_12-31-10_person.jpg
> 2026-03-09_12-31-10_car.mp4
> ```

---

## Path datetime format

The card extracts timestamps from a single configurable pattern, `path_datetime_format`, that matches the *tail* of each item's path (or media-source URI). The `/` character separates directory levels; the leaf segment matches the filename.

> [!WARNING]
> `path_datetime_format` is needed in **all source modes** (sensor, media, combined) — without it, items load but have no dates: no day grouping, no day navigation, no time sort. The only built-in exception is Frigate via `media-source://frigate/...` URIs, which carry their own event-id timestamps. Use the editor's **Auto-detect path datetime format** button (General tab) if you're unsure what to set.

| Token | Meaning |
|------|------|
| YYYY | 4-digit year |
| YY | 2-digit year (pivots at 2000) |
| MM | 2-digit month |
| DD | 2-digit day |
| HH | 2-digit hour (24h) |
| mm | 2-digit minute |
| ss | 2-digit second |
| X | 10-digit Unix timestamp in seconds (decoded to local time) |
| x | 13-digit Unix timestamp in milliseconds (decoded to local time) |

**Range filenames (`start-end`).** When a format includes the same date/time token twice (or the `X` token twice), the **first** capture is used as the canonical timestamp and the second is treated as a structural anchor. This is what lets a single format string describe `start-end`-style filenames without picking the wrong instant.

### Layouts

The same knob handles three real-world archive shapes — and for nested archives the walker discovers the date tree without browsing inside day folders, then loads each day's files only when the user navigates to it. Very large archives (thousands of days) stay snappy.

**A. Flat folder — all files in one directory**
```
/media/cam/RLC_20260502_050106.mp4
            └────date────┘└─time─┘
path_datetime_format: RLC_YYYYMMDD_HHmmss.mp4
```

The literal extension is optional — leave it off and the format matches as a substring of the filename, useful when timestamps are surrounded by other tokens (`RLC-520A-front_00_20260502050106.mp4` matches `YYYYMMDDHHmmss`).

**B. Date-named folder — recordings inside daily folders**
```
/media/recordings/20260502/173154.mp4
                  └─date─┘ └─time─┘
path_datetime_format: YYYYMMDD/HHmmss
```

If the filenames carry no time tokens, write just `YYYYMMDD` — the card uses the folder name as the dayKey and shows files in their natural order.

**C. Nested folders — year/month/day/file**
```
/media/cam/Front/2026/04/30/RLC_20260430131245.mp4
                 └y─┘└m┘└d┘ └─────filename─────┘
path_datetime_format: YYYY/MM/DD/RLC_YYYYMMDDHHmmss.mp4
```

(Reolink/FTP shape — see [issue #99](https://github.com/TheScubaDiver/camera-gallery-card/issues/99).)

**D. Unix epoch in the filename**
```
/media/tapo/1706108297-1706108310.mp4
            └──start──┘ └───end───┘
path_datetime_format: X-X
```

Tapo Control writes `unix_start-unix_end.mp4`; `X-X` captures both but uses the start as the canonical time. A single epoch (`1706108297.mp4`) is just `X`. UniFi Protect's `.ubv` files encode the millisecond epoch — `B4FBE47EEF30_0_rotating_1642402659065.ubv` matches `x`.

**E. Calendar-range filenames**
```
/media/reolink/cam_20240315083000_20240315083127.mp4
                   └────start────┘└─────end────┘
path_datetime_format: YYYYMMDDHHmmss_YYYYMMDDHHmmss

/media/dahua/2024-03-15/ch1/dav/11/11.00.01-11.00.59[M][0@0][0].mp4
                                   └─start─┘└──end──┘
path_datetime_format: YYYY-MM-DD/HH.mm.ss-HH.mm.ss
```

Reolink SD-card exports and Dahua/Amcrest filenames carry two same-format timestamps; the first wins.

---

## Troubleshooting

**Gallery is empty.**

- In **sensor mode**: check that the sensor entity exists (*Developer Tools → States*) and its `fileList` attribute actually has files. If empty, FileTrack isn't seeing the folder.
- In **media mode**: open the editor and use the **media folder browser** — can you see your files there?
- Frigate? Make sure the Frigate HA integration is loaded (*Settings → Devices & Services*).

**Live view says "offline" or shows a placeholder.**
The camera entity is unavailable in Home Assistant. Check it in *Developer Tools → States* — it must report a live state to stream.

**Frigate clips don't appear.**
The `path_datetime_format` must match Frigate's path layout. Use the editor's **Auto-detect path datetime format** button (General tab) to let the card propose the right pattern, or see [Path datetime format](#path-datetime-format) for examples.

**Items load but aren't grouped by day (no dates, no day navigation).**
`path_datetime_format` is missing or doesn't match your filenames. The card needs it to extract dates from paths — without a match, items stay undated and the timeline loses day grouping, day navigation and time-based sort. The only built-in exception is Frigate via `media-source://frigate/...` URIs, which carry their own event-id timestamps. Use **Auto-detect** in the editor's General tab, or see [Path datetime format](#path-datetime-format).

**Delete does nothing / errors.**
Check that the `shell_command` or `rest_command` you point to is actually defined in `configuration.yaml` and that you restarted (or reloaded YAML) afterwards. Variable names like `{{ path }}` and `{{ event_id }}` must be **exact** — the card passes those names, renaming them breaks the call.

**Need more info?** Enable **Debug mode** in the General tab — a debug pill appears in live view; tap it for a diagnostics modal with version, HA info, Frigate state and runtime stats. Attach the contents when filing an [issue](https://github.com/TheScubaDiver/camera-gallery-card/issues).

---

## Two-way audio (advanced)

Two-way audio (talkback) lets you speak through a camera's backchannel speaker from the live view. Setup is more involved than the rest of the card — read this if you want to enable it.

**You need:**

- A camera with an **audio backchannel speaker** (most Reolink doorbells, some Hikvision, Tapo, etc.).
- The [AlexxIT/WebRTC](https://github.com/AlexxIT/WebRTC) HACS integration — provides the signed `/api/webrtc/ws` endpoint the card connects to.
- A go2rtc `streams:` entry that routes the camera's backchannel audio.

**Configuration:**

- `live_mic_streams: { <camera_id>: <go2rtc_stream_key> }` — map of cameras → go2rtc stream keys. The mic pill appears only on cameras present in this map.
- Optional `live_mic_mode: ptt` for push-to-talk (default is tap-to-toggle).
- Optional `live_mic_audio_processing` to tweak echo cancellation, noise suppression, AGC.
- Optional `live_mic_ice_servers` / `live_mic_force_relay` if you're behind symmetric NAT and need a TURN relay.

**Visual states:** the pill cycles through four states — idle, connecting, active, error — and announces them to screen readers. Transient WebSocket glitches retry automatically.

**Custom TURN (Coturn) for symmetric NAT.** Default is STUN-only — voice traffic stays direct on your LAN. If you need a relay (e.g. talking to a Tailscale endpoint from a flaky cellular network):

```yaml
live_mic_ice_servers:
  - urls: stun:stun.cloudflare.com:3478
  - urls:
      - turn:turn.example.com:3478
      - turns:turn.example.com:5349
    username: your_username
    credential: your_secret
# live_mic_force_relay: true   # only if direct ICE never succeeds
```

**Caveat for `live_stream_urls` (synthetic ids).** When you put mic config on a stream-URL entry, the key is `__cgc_stream_<N>__` where `N` is the position in `live_stream_urls`. If you reorder the array, the keys point at the wrong streams. Use the editor (it re-binds the inputs to the visible names) or stick to entity-keyed entries for stability.

See the [Two-way audio YAML example](#two-way-audio-talkback) for a working config.

---

## License

MIT License
