# neohab

A modern dashboard UI for [openHAB](https://www.openhab.org/) — the spiritual successor to HABPanel.

neohab installs as a standard openHAB UI add-on and lets you build touch-friendly dashboards for
phones, tablets and desktops, configured entirely in the browser. No file editing, ever.

> **Status: 1.0.** Everything described below is built and tested end to end against a live
> openHAB server — dashboards, live controls, inline editing, theming, charts, kiosk mode,
> voice and audio, backup/restore, HABPanel import and custom widgets. Marketplace packaging
> is still to come; until then, grab the add-on jar and drop it in your `addons` folder.
> Feedback welcome.

## Goals

- **Mobile-first** — dashboards are always viewable and dynamically sized, from phone to
  wall-mounted tablet to desktop. Phones and portrait tablets get a single-column stack whose
  order you can drag-to-reorder independently of the grid layout. On the grid a dashboard scales
  as one proportional unit: icons *and* text track the cell size (text down to a readable floor),
  and widget chrome slims itself down in tight cells, so labels stay readable instead of
  clipping. Stacked rows are full-width, so there they size their text to the room the row has
  rather than shrinking it to match a desktop. On top of the automatic sizing, text size is
  adjustable at every level: per dashboard, per widget, and per device (so a wall panel across
  the room can run bigger text than your desk's monitor).
- **Navigate from anywhere** — a pull-out sidebar lists every dashboard, so switching is one tap
  from wherever you are. It slides the dashboard aside on desktop and overlays it on phones, and
  stays put until you pick something or click away — that click only dismisses it, so you never
  hit a control by accident on the way out. Pin it if you would rather it always stayed, and the
  dashboard stays live beside it. The Home screen is still there, and the sidebar can be switched
  off entirely.
- **Everything in the UI** — dashboards, widgets, themes and settings are all managed in the
  browser and stored on your openHAB server. Zero config files.
- **Dashboards it builds for you** — point neohab at your items and it lays out dashboards from
  them. It reads your semantic model when you have one (a dashboard per location, a section per
  piece of equipment, icons from the tags), and works just as well without one: it clusters items
  by their naming convention or by group membership, or you can simply tick the items you want.
  Every widget it chose is listed for review first — drop any row, or swap it for a different
  widget — and nothing is written until you say so.
- **Inline editing** — arrange dashboards on the live grid itself: drag widgets to move or
  resize, delete them from a button on the widget, undo/redo anything, and save when you are
  ready (Save returns you to the live dashboard). Dropping onto an occupied spot rejects by
  default; hold there for a moment and the widgets in the way step aside — swapping with a
  same-size neighbour, or shuffling down. Select several widgets at once (Ctrl/Cmd- or
  Shift-click, a drag-a-box marquee, or long-press on touch) to copy, cut or delete them
  together, and copy/paste widgets — including from one dashboard to another — with the usual
  Ctrl+C / Ctrl+V.
- **Wall panels & kiosks** — install neohab as an app (PWA) with an offline-capable shell; per
  device, keep the screen awake, blank it after idle (or show a slowly drifting clock), open
  straight onto a pinned dashboard, and hide all chrome in kiosk mode (five quick taps in a
  screen corner exits, and `?kiosk=on` / `?kiosk=off` in the address works for kiosk-browser
  apps). A dashboard-control item lets your rules remotely switch what every wall panel shows.
- **Charts** — history graphs straight from openHAB persistence: multiple series with
  per-series colors and styles (smooth/linear/stepped lines, gradient fills, points), left and
  right y-axes with fixed or automatic ranges, threshold lines and shaded bands, a legend that
  toggles series on and off, a crosshair tooltip, quick time-range switching from an hour to a
  year, drag-to-zoom, and live updating as item states change. History can also be grouped
  before it is drawn — per hour, day, week or month, or by hour of day, day of week or month of
  year — with each series reducing its bucket its own way (time-weighted average, min, max,
  first, last, sum or count of readings), drawn as lines or bars. A heatmap mode shows one
  series as an hour-by-weekday matrix, which is how you see *when* something happens. Any chart
  opens full screen from a ⤢ button, where you can walk backwards and forwards a day, week,
  month or year at a time. A timeline widget shows the same history as colored state bands —
  one row per item, with configurable state colors — which is the right shape for switches,
  presence and modes.
- **Cameras** — live video on your dashboard, from go2rtc, Frigate, an openHAB camera binding,
  or any camera that serves its own stream. Point it at a camera server and pick a camera, or
  paste a URL directly: MJPEG, HLS, MP4, still-image snapshots and WebRTC are all understood.
  neohab tries the lowest-latency route first and falls back until one works, so a camera shows
  up without you having to know which of them your server speaks — and you can pin a specific
  one if you would rather it never varied. Streams stop when nobody is looking at them (a
  dashboard that is scrolled away or in a background tab), tapping a camera can go fullscreen,
  jump to another dashboard, open a URL or send a command, and each camera can carry audio.
- **Voice & audio** — every open dashboard can be a speaker: sounds your rules play through
  openHAB's Web Audio sink come out of the browser, a speech item announces its changes out
  loud (voice picked per device), and a microphone button sends spoken commands to openHAB's
  interpreter where the browser supports it. Each device decides for itself whether it plays
  along, so the wall panel chimes and your desk stays quiet.
- **As many tabs and windows as you like** — browsers only allow a handful of connections per
  server, and a live dashboard holds one open permanently, so several tabs would normally leave
  one of them frozen on stale values. neohab keeps a single connection for the whole browser and
  shares live item states between its tabs. If updates ever do stop arriving, the dashboard says
  so instead of quietly showing you old readings.
- **Import / export** — back up, restore and share complete dashboard configurations as JSON;
  restore by replacing everything or merging a backup into what you have. A single dashboard,
  custom widget or theme can also be exported on its own, and it takes the things it uses with
  it (the custom widgets, uploaded icons and background it references), so it works on someone
  else's server. Importing one offers it as a numbered copy, leaving anything of yours with the
  same name untouched — or overwrites it deliberately, if that is what you meant.
- **Version history** — every change is preceded by a restore point, so you can look back through
  a dated list, see exactly what changed at each one (down to the individual fields, before and
  after), and put the whole configuration back to any of them. Points are named by date and can
  be given a name of your own; changes made close together share one, so an afternoon of tweaking
  leaves one entry rather than dozens. Twenty-five are kept by default, and that is configurable.
- **Your language** — the UI ships in English, German, Spanish, French, Italian, Dutch and
  Polish (the translations are machine-drafted and welcome native review), picked automatically
  from the browser language with a per-device override in Settings. Your own dashboard text is
  never touched.
- **View-only devices** — an editing lock hides every editing control from devices that are not
  signed in as an administrator, so wall panels and guests get a clean, read-only dashboard;
  administrator devices are never affected, and a locked device can still sign in from Settings.
- **Custom widgets** — build your own widgets from HTML templates with live item bindings, plus
  an optional sandboxed JavaScript widget API for power users. A small gallery of ready-made
  widgets ships inside the add-on (so it works with no internet at all) and installs with one
  tap; installed widgets are then yours to edit like any other.
- **First-class theming** — theme editor with live preview, light/dark themes, and custom
  themes that travel with your backups. Any device can pin its own theme (a light desk browser
  next to a dark wall panel) without changing what the others share. Every theme can carry its own CSS on top of the color
  tokens, so a theme can change fonts and widget styling too — the bundled Swiss Sheet themes
  (dark and light, in the International Typographic Style) are built that way, and ship with
  [Instrument Sans](https://github.com/Instrument/instrument-sans)
  (© Instrument, [SIL OFL 1.1](https://openfontlicense.org/), license included in the add-on).
  Dashboards can also carry background images — one global default plus per-dashboard
  overrides, set by URL or uploaded. Uploads are stored losslessly as PNG at up to 5K (no
  compression artifacts) in your openHAB config, so backups include them; exports keep the
  image data at the end of the file to stay readable, and can leave it out entirely to stay
  small.
- **HABPanel migration** — import your existing HABPanel panels (from a `habpanel-config.json`
  export or directly from your server) with best-effort widget mapping and a detailed report.

## Compatibility

Targets openHAB **4.x and 5.x**. Distributed as an add-on jar installable through the openHAB
community marketplace (planned) or manually via the addons folder.

## Tech

React + TypeScript + Vite frontend served by a thin OSGi add-on shell, talking to openHAB
exclusively through its public REST and SSE APIs.

The browser end-to-end suites live in [`e2e/`](e2e/) — they drive a real browser against a live
openHAB server with the add-on deployed. See [`e2e/README.md`](e2e/README.md) before running
them against a server you care about.

## Icons

Nearly 10,000 icons are bundled in the add-on, so everything works fully offline — plus your
openHAB server's own icon sets and your own uploads:

- **Color** — [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (flat style, curated
  for dashboards; © Microsoft, MIT) and
  [icons8 flat-color-icons](https://github.com/icons8/flat-color-icons) (MIT)
- **Mono** — [Material Design Icons](https://pictogrammers.com/library/mdi/)
  (© Pictogrammers, [Apache License 2.0](https://github.com/Templarian/MaterialDesign/blob/master/LICENSE)),
  tinted by your theme or any color you pick per widget
- **Weather** — [Meteocons](https://github.com/basmilius/meteocons) animated weather icons
  (© Bas Milius, MIT)
- **openHAB** — the server's classic icon set (state-aware where the set provides variants)
- **Custom** — upload your own PNG, JPG, GIF, WebP, BMP or SVG straight from the icon picker;
  transparency and GIF animation survive, and uploads are stored in your openHAB config so
  backups and exports include them

Stateful widgets (switches, toggle buttons, value readouts) can show a different icon — and a
different mono tint — for their active state, or per state beyond that: rules map exact states
or numeric ranges (a dimmer at `0`, `1-49` and `50-100` can be three different bulbs). Icon
sizes are authored against a desktop-width dashboard and scale automatically with the actual
cell size, so the same config looks right on any screen.

## License

[Eclipse Public License 2.0](LICENSE)

neohab is a community project and is not an official openHAB UI.
