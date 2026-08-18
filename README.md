# neohab

A modern dashboard UI for [openHAB](https://www.openhab.org/). Touch-friendly dashboards for
phones, tablets and wall panels, configured entirely in the browser. No file editing, ever.

> **Status: in daily use.** The latest release is **1.15.0**. Everything below is built and tested
> against a live openHAB server by a browser suite that drives the whole UI. Anything added since
> that release sits on `main` and ships with the next one. Marketplace packaging is still to come.
> Feedback welcome.

neohab is a community project and is not an official openHAB UI.

## Install

1. Download the add-on jar from the [releases page](https://github.com/Fohdeesha/neohab/releases).
2. Drop it into your openHAB `addons/` folder. It is picked up in a few seconds, no restart.
3. Open **http://your-server:8080/neohab/**.

It appears on the openHAB start page too. To remove it, delete the jar. To upgrade, replace it:
open tabs pick the new version up on their next load, with no cache to clear.

Works with openHAB **4.x and 5.x**, using only public REST and SSE APIs - tested against 4.3.7
and 5.2.1. Viewing works out of the box on a server that allows anonymous read, which is
openHAB's default. Editing asks you to sign in as an administrator.

If you have turned openHAB's implicit user role **off**, neohab asks you to sign in before it
shows anything, and commands and configuration then work normally. Live item values are the
exception: they arrive over an `EventSource`, which browsers do not let us attach a token to, so
on a server locked down that way the dashboard renders but its values do not update. neohab says
so on screen rather than showing stale numbers.

## Coming from HABPanel

Import your panels from **Settings › HABPanel import**, either straight off your server or from a
`habpanel-config.json` export. Widgets, layout, icons and dashboards are mapped across, and panel
names become web addresses, so "Bedroom Lighting" arrives as `bedroom-lighting`. You get a report
of what came over cleanly, what was approximated, and what needs a look.

All seven HABPanel themes have a port here, so an imported dashboard arrives looking like itself.
Custom AngularJS templates import as neohab template widgets.

The one thing that cannot come across is `additional_stylesheet_url`, because its selectors are
HABPanel's. The import says so, and [the theming guide](docs/theming.md) has the table you need to
translate it.

## What it does

**Layout**

- **Mobile-first.** Phones and portrait tablets get a single-column stack you can reorder
  independently of the grid. On the grid, icons and text both scale with the cell, and widget
  chrome slims down in tight cells so labels stay readable. Text size is adjustable per dashboard,
  per widget and per device.
- **Tablet layouts.** An optional second arrangement with its own column count. Any widget can be
  left out on phones, tablets or desktops entirely.
- **Inline editing.** Arrange dashboards on the live grid. Drag to move or resize, drag from the
  palette onto the cell you want, multi-select (Ctrl/Cmd-click, Shift-click, marquee, long-press),
  copy and paste between dashboards, and undo anything. Drop a widget onto an occupied spot and it
  is rejected; hold it there and the widgets in the way step aside.
- **Navigate from anywhere.** A pull-out sidebar lists every dashboard. It pushes the dashboard
  aside on desktop, overlays on phones, and can be pinned or switched off.
- **Dashboards it builds for you.** Point neohab at your items and it lays out dashboards from
  them: from your semantic model if you have one, otherwise clustered by naming convention or
  group, or just tick the items you want. Everything it chose is listed for review first.

**Widgets**

- **Charts.** Multiple series with per-series colors and styles, dual y-axes, thresholds and
  bands, a toggling legend, crosshair tooltip, drag-to-zoom, ranges from an hour to a year, and
  live updates. History can be grouped before drawing (per hour, day, week or month, or by hour of
  day, day of week, month of year) with each series reducing its bucket its own way. A heatmap
  mode shows one series as an hour-by-weekday matrix. Any chart opens full screen and steps
  backwards through time.
- **Timeline.** The same history as colored state bands, one row per item. The right shape for
  switches, presence and modes.

  Anything that draws history (charts, timelines, gauge sparklines, stat trends) reads it from
  whichever **persistence service** your openHAB uses. Any of them will do. If none is set up, the
  widgets say so and tell you what to do about it.
- **Gauges.** Six looks, from a classic arc slider to an LED ring, tick ring, tachometer arc,
  block segments and a 3D clay face. All share color thresholds, alarm ranges, arcs and half
  gauges, tick scales, reference markers, zones, an inline history sparkline, and an optional
  second item as a concentric inner ring.
- **Stat tiles.** One large reading with its unit set apart, a caption, a second figure beneath,
  and a trend arrow against its own history or another item. Which direction counts as good news
  is yours to say.
- **Compass.** Wind direction or any bearing, with a live pointer, cardinal names, and an optional
  second item (wind speed) in the middle.
- **Cameras.** Live video from go2rtc, Frigate, an openHAB camera binding or any stream URL.
  MJPEG, HLS, MP4, snapshots and WebRTC are all understood. neohab tries the lowest-latency route
  first and falls back until one works. Streams stop when nobody is looking.
- **Floor plan.** Upload a plan of your home (any image; a styling pipeline re-inks it to match
  the theme) and drag your lights onto it. Each light casts a live glow in its actual color and
  brightness, thrown in every direction or out of one side only for a sconce or a cove, and
  overlapping lamps blend like real light. Tapping a light opens its control.

  Set the room the way you like it and save it as a **lighting preset**. It is stored as a real
  openHAB scene, so your rules and Main UI see it too, and any panel (even signed-out ones) can
  recall it with a tap. Presets are managed from the plan: rename one, change what it sets each
  light to without setting the room first, add a light to it or drop one, and delete it. Link a
  preset to the Switch item your wall switches already use and neohab adds the rule that runs it,
  with the active preset highlighted on every panel. Optionally, tapping the preset that is
  already on switches its lights back off.
- **Custom widgets.** Build your own from HTML templates with live item bindings, plus an optional
  sandboxed JavaScript API. A small gallery ships inside the add-on and installs with one tap.

**Theming**

A theme editor that previews as you type, offers every design token grouped and explained, tells
you whether your colors can actually be read, and checks a custom stylesheet against the rules
that are easy to get wrong. Saving a theme does not switch anyone else over unless you say so, and
any device can pin its own. Themes travel with your backups and export on their own.

A theme can also carry its own stylesheet, which is how the bundled **Swiss Sheet**, **Ember**,
**LCD Console**, **Operations** and **Assembly** themes change fonts and widget structure rather
than only the palette. Dashboards can carry background images, global or per dashboard.

If a theme ever makes the app unusable, `?theme=none` in the address loads with the default one
for that page load, without changing anything.

See **[Making a theme](docs/theming.md)** for the tokens, the class names and the six rules.

**Running it**

- **Wall panels and kiosks.** Installable as an app (PWA) with an offline-capable shell. Per
  device: keep the screen awake, blank after idle or show a drifting clock, open onto a pinned
  dashboard, and hide all chrome in kiosk mode. A dashboard-control item lets your rules switch
  what every panel shows.
- **Voice and audio.** openHAB's Web Audio sink plays through the browser, a speech item announces
  changes out loud, and a microphone button sends spoken commands to the interpreter. Each device
  decides whether it joins in.
- **As many tabs as you like.** Browsers allow only a handful of connections per server, so
  several dashboards would normally leave one frozen on stale values. neohab shares a single
  connection across the whole browser, and says so if updates ever stop arriving.
- **View-only for visitors.** Like openHAB's own UIs, devices not signed in as an administrator
  get a clean read-only panel: buttons and sliders still work, but dashboards, themes, presets
  and settings can only be changed after an administrator sign-in.
- **Away from home.** Works behind a reverse proxy or openHAB Cloud. Credentials are kept in
  memory for the session, never written to the device. Inside the official openHAB phone app it
  picks them up by itself.
- **Your language.** English, German, Spanish, French, Italian, Dutch and Polish (machine-drafted,
  native review welcome), from the browser language with a per-device override.
- **When something is wrong.** Settings ends with an About screen: the neohab and openHAB
  versions, what this device is signed in as, whether live states are arriving, and which
  persistence services the server has. It offers all of that as one block to paste into a bug
  report, with no addresses, credentials or item names in it.

**Your configuration**

- **Import and export.** Back up, restore and share complete configurations as JSON, replacing or
  merging. Lighting presets ride along when the exporting device may read them. A single
  dashboard, widget or theme exports on its own and takes what it uses with it, so it works on
  someone else's server.
- **Version history.** Every change is preceded by a restore point. Look back through a dated
  list, see exactly what changed field by field, and roll the whole configuration back.
  Twenty-five are kept by default.
- **Hard to break.** Configuration that did not come from the editor is treated as untrusted
  wherever it is read, and a widget that cannot make sense of its own settings becomes one tile
  saying so rather than a blank page. Whatever a hand edit, an old backup or someone else's export
  contains, the dashboard around it keeps working and the editor is still there to fix it.
  Configuration saved by a newer neohab than the one running is left strictly alone rather than
  guessed at. It is never overwritten or tidied away, so an older wall panel cannot damage what a
  newer one wrote.

## Icons

Nearly 10,000 icons are bundled in the add-on, so everything works fully offline. Your openHAB
server's own icon sets and your own uploads are available alongside them:

- **Color.** [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (flat style, curated for
  dashboards; © Microsoft, MIT) and
  [icons8 flat-color-icons](https://github.com/icons8/flat-color-icons) (MIT)
- **Mono.** [Material Design Icons](https://pictogrammers.com/library/mdi/)
  (© Pictogrammers, [Apache License 2.0](https://github.com/Templarian/MaterialDesign/blob/master/LICENSE)),
  tinted by your theme or any color you pick per widget
- **Weather.** [Meteocons](https://github.com/basmilius/meteocons) animated weather icons
  (© Bas Milius, MIT)
- **openHAB.** The server's classic icon set, state-aware where the set provides variants
- **Custom.** Upload your own PNG, JPG, GIF, WebP, BMP or SVG from the icon picker. Transparency
  and GIF animation survive, and uploads are stored in your openHAB config so backups include them

Stateful widgets can show a different icon, and a different mono tint, per state. Rules map exact
states or numeric ranges, so a dimmer at `0`, `1-49` and `50-100` can be three different bulbs.

## Fonts

The themes that need one bundle it, so nothing is fetched from the internet. All are under the
[SIL Open Font License 1.1](https://openfontlicense.org/), with the license included in the
add-on: [Instrument Sans](https://github.com/Instrument/instrument-sans) (© Instrument),
[DSEG](https://github.com/keshikan/DSEG) (© keshikan),
[Montserrat](https://github.com/JulietaUla/Montserrat) (© Julieta Ulanovsky et al.) and
[Poppins](https://github.com/itfoundry/poppins) (© Indian Type Foundry).

## Development

React + TypeScript + Vite, served by a thin OSGi add-on shell, talking to openHAB only through its
public REST and SSE APIs.

**[CONTRIBUTING](CONTRIBUTING.md)** covers running it locally against your own openHAB with no Java
build, the checks, and how to add a widget. `npm run check` in `web/` runs the typecheck, the
linter and the unit suite, which is what CI runs.

The browser end-to-end suites live in [`e2e/`](e2e/). They drive a real browser against a live
openHAB with the add-on deployed, so read [`e2e/README.md`](e2e/README.md) before running them
against a server you care about.

## License

[Eclipse Public License 2.0](LICENSE)
