<picture>
  <source media="(prefers-color-scheme: dark)" srcset="web/public/logo.svg">
  <img src="web/public/logo-light.svg" alt="neohab" width="360">
</picture>

# neohab

A modern dashboard UI for [openHAB](https://www.openhab.org/). Touch-friendly dashboards for
phones, tablets and wall panels, configured entirely in the browser. No file editing, ever.

> **Status: in daily use.** The latest release is **1.28.0**. Everything below is built and tested
> against a live openHAB server by a browser suite that drives the whole UI. Anything added since
> that release sits on `main` and ships with the next one. Marketplace packaging is still to come.
> Feedback welcome.

neohab is a community project and is not an official openHAB UI.

## Requirements

- **openHAB 4.3 or newer**, including 5.x. The bundle declares that range, so 4.0 to 4.2 will not
  start it. Tested against apt-installed **4.3.7** and a zip install of **5.2.1**; Docker and
  openHABian are the same jar in the same folder but have not been run yet.
- **A browser from 2023 or later**: Chrome or Edge 111, Safari 16.4, Firefox 121, or a matching
  Android WebView. An older one is told so instead of rendering a broken page.
- **Nothing else.** Only openHAB's public REST and SSE APIs, no server-side code of ours, no
  internet access, no account anywhere.
- Some features need **HTTPS**, because browsers only offer them in a secure context: installing
  as an app (PWA), keeping the screen awake, and the microphone. Everything else works over plain
  HTTP, which is how most home openHAB servers are reached. Install below says what changes if
  you switch, including the certificate an app install needs and what happens to `http://`
  cameras.
- Charts, timelines, gauge sparklines and stat trends read history from a **persistence service**.
  Any one will do; the widgets say so if none is set up.

## Install

1. Download the add-on jar from the [releases page](https://github.com/Fohdeesha/neohab/releases).
   Each release has a `.sha256` beside it if you want to check the download.
2. Drop it into your openHAB `addons/` folder:
   - apt or openHABian: `/usr/share/openhab/addons`
   - Docker: whatever you mounted at `/openhab/addons` (the file has to be readable by uid 9001)
   - manual zip install: `<openhab-home>/addons`
3. It is picked up in a few seconds, no restart. `openhab.log` says `Started neohab at /neohab`.
4. Open **http://your-server:8080/neohab/**.

It appears on the openHAB start page too. The jar is about 6 MB; a much smaller one did not build
properly and will install cleanly and then serve nothing.

**Upgrading:** delete the old jar first, wait for it to stop, then copy the new one in. Two jars in
`addons/` at once register the same page twice. Open tabs notice the new version and offer to
reload themselves.

**Removing it:** delete the jar. Your dashboards stay in openHAB's JSON database, in the three
`neohab:*` namespaces, so putting the jar back brings everything with it. Going back to an older
version leaves anything a newer one wrote alone rather than misreading it, so those dashboards are
invisible until you upgrade again.

Viewing works out of the box on a server that allows anonymous read, which is openHAB's default.
Editing asks you to sign in as an administrator.

If you have turned openHAB's implicit user role **off**, neohab asks you to sign in before it
shows anything, and commands and configuration then work normally. Live item values are the
exception: they arrive over an `EventSource`, which browsers do not let us attach a token to, so
on a server locked down that way the dashboard renders but its values do not update. neohab says
so on screen rather than showing stale numbers.

**Behind a reverse proxy**, do not buffer the event stream, or live values arrive in bursts or not
at all:

```nginx
location / {
  proxy_pass http://localhost:8080/;
  proxy_set_header Host $host;
  proxy_http_version 1.1;
  proxy_buffering off;      # the item-state stream is server-sent events
  proxy_read_timeout 3600s;
}
```

neohab resolves every path against wherever it is served from, so a sub-path proxy works in
principle. It is designed for openHAB Cloud and the openHAB phone app as well, and picks up their
credentials by itself - but neither of those, nor a sub-path proxy, has been tested end to end yet.

**Over HTTPS**, everything works and a few things start working that cannot over plain HTTP:
installing neohab as an app, keeping a wall panel's screen awake, and the microphone. openHAB
already listens on port 8443, so `https://your-server:8443/neohab/` needs nothing set up.

Two things are worth knowing before you switch:

- **The certificate has to be one the browser trusts.** openHAB generates a self-signed one, and a
  browser will let you click past the warning to read the dashboard but will not install it as an
  app: the service worker is refused outright, with nothing on screen to say why. A certificate
  from your own authority or from Let's Encrypt, usually terminated at a reverse proxy, is what
  makes the app install and the wake lock work.
- **An `http://` address cannot be loaded into an `https://` page.** Browsers block it, silently,
  so a camera at `http://192.168.1.10:1984`, a framed page or an image from a plain-HTTP host
  simply never arrives. neohab says so on the widget and in its settings as you type the address,
  rather than leaving you with a tile that looks broken. Give those devices HTTPS too, put them
  behind the same proxy, or reach neohab over HTTP.

Opening a *link* to an http address still works: that is a navigation, not something the page
loads, so a button that goes to a web address is unaffected.

## Coming from HABPanel

Import your panels from **Settings › Migrate from HABPanel**, either straight off your server or
from a `habpanel-config.json` export. Widgets, layout, icons and dashboards are mapped across, and
panel names become web addresses, so "Bedroom Lighting" arrives as `bedroom-lighting`. You get a
report of what came over cleanly, what was approximated, and what needs a look.

If nothing is found on your server, HABPanel is probably keeping your panels in the browser rather
than in openHAB. Open HABPanel, save the panel configuration to the server or export it, and come
back with the file.

All seven HABPanel themes have a port here, so an imported dashboard arrives looking like itself.
Custom AngularJS templates import as neohab template widgets.

The one thing that cannot come across is `additional_stylesheet_url`, because its selectors are
HABPanel's. The import says so, and [the theming guide](docs/theming.md) has the table you need to
translate it.

## What it does

**Layout**

- **Mobile-first.** Phones and portrait tablets get a single-column stack you can reorder
  independently of the grid. On the grid, icons and text both scale with the cell (on a screen
  driven by a mouse the text keeps its normal size wherever the row can hold it, so a narrower
  window does not mean small labels), widget chrome slims down in tight cells so labels stay
  readable, and a big reading is sized to the tile it is in rather than clipped by it - a clock
  in a landscape phone's short row shrinks to fit instead of losing half of itself, and a chart
  that short spends what room it has on the plot rather than on its axes. Text size is
  adjustable per dashboard, per widget and per device.
- **Tablet layouts.** An optional second arrangement with its own column count. Any widget can be
  left out on phones, tablets or desktops entirely.
- **Every widget, the same settings.** Whatever the widget, its title is called its Name, sits
  where Name alignment and Name position put it, and can be dropped entirely - a weather panel or
  a camera does not need a word above it saying so.
- **Inline editing.** Arrange dashboards on the live grid. Drag to move or resize, drag from the
  palette onto the cell you want, multi-select (Ctrl/Cmd-click, Shift-click, marquee, long-press),
  copy and paste between dashboards, and undo anything. Drop a widget onto an occupied spot and it
  is rejected; hold it there and the widgets in the way step aside. Escape backs out: first
  whatever panel is open, then the selection, then edit mode itself. What you see while editing is
  what a save produces: the editor's own chrome is drawn only on the widget you are pointing at,
  and opening a settings panel zooms the grid out to make room rather than squeezing it into a
  narrower dashboard.
- **A closer look at any widget.** Hold a tile, or right-click it, and a sheet opens with the
  current value, when it last changed, recent history and a link to the item in Main UI. A tile is
  a deliberate summary; this answers what it has actually been doing, without leaving the
  dashboard. A log tile opens the log full screen instead, with a search box and the filters as
  chips. Widgets that are not about an item answer too: a weather tile opens the whole
  forecast it fetched - every reading, the next twelve hours in two rows of six, and the week
  under it - and a clock opens the date in full, the time to the second, which zone that is, any
  other zones it carries, and whether this device's clock and the server's read the same, or how
  far apart they are. Hold a control and you get that widget's own control too - a slider on the
  range it was set to, a rollershutter's up, stop and down, a media player's transport, a
  selection's own choices - while a readout or a read-only gauge gives you none, because those are
  displays. The hold replaces the tap rather than adding to it, so a slow press never commands
  anything by accident: hold a slider or a dial and the value goes back where it was, while a tap
  on a slider's track still sets it there and a drag still drags.
- **Steady controls.** Lights do not step to a new value: openHAB predicts it, the binding reports
  what the channel is doing mid-fade, and the real value lands a second later. Whether you set it
  or a rule, a scene or another panel did, a slider or a colour fader moves once and settles where
  the device settles, instead of jumping to the new value, collapsing to near-black and climbing
  back. A floor plan's glows and preset chips follow the same rule, so a room does not flash
  through the scene it is leaving. Nothing is hidden for long: an ordinary change appears the
  moment it arrives.
- **Navigate from anywhere.** A pull-out sidebar lists every dashboard. It pushes the dashboard
  aside on desktop, overlays on phones, and can be pinned or switched off.
- **Dashboards it builds for you.** Point neohab at your items and it lays out dashboards from
  them: from your semantic model if you have one, otherwise clustered by naming convention or
  group, or just tick the items you want. Everything it chose is listed for review first.

**Widgets**

- **Charts.** Multiple series with per-series colors and styles, dual y-axes, thresholds and
  bands, a toggling legend, crosshair tooltip, drag-to-zoom, live updates, and ranges from an hour
  to a year with a say in which of them the chart offers as quick chips.
  History can be grouped before drawing (per hour, day, week or month, or by hour of
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
- **Clocks, including other countries.** Digital or an analog face, with the date written the way
  you want it. Set a clock to any time zone and it works the whole tile out there: the digits, the
  hands and the date, with daylight saving handled for you. It can caption itself with the zone's
  short name, its UTC offset, or a name of your own, so a row of tiles reads Home, Head office,
  Tokyo. A clock follows your **openHAB server's** clock by default, because on a home network
  that is the one kept properly, and switches to this device's if you would rather. Hold the tile
  and the sheet names both clocks, says whether they read the same or how far apart they are, and
  lists the same moment in any other zones you added.
- **Weather.** Current conditions, the next hours and a daily outlook, drawn three ways: a big
  hero, a compact row, or a forecast strip, all with animated weather drawings. The hero fills the
  tile it is given: feels-like, humidity, wind and rain chance sit beside the temperature wherever
  there is width for them and underneath where there is not, and a tile too small for all of it
  draws the temperature smaller rather than cutting anything off. Data comes from
  [Open-Meteo](https://open-meteo.com/) (free, no key: search for your town and you are done) or
  from your own weather items, and your server's measurement system decides °F or °C. Rain chance
  is the day's, the way every forecast site quotes it; if the numbers look nothing like the
  forecast you usually read, pick another weather model (ECMWF, GFS, ICON, GEM) and see.
- **Buttons and switches.** One widget, drawn as a pressable tile, as a card with the icon and the
  name in its corners, or as a sliding toggle. A tile or a card then picks a finish: plain follows
  the theme, and solid, glass, glow, edge, outline, sheen and bare fill the tile and take the colour
  from the widget's own Accent color, so a board can be as loud or as quiet as you want it. The
  style and the finish are only the look: every one of them sends the same commands, can toggle
  between a command and an alternate one, and can show whether the item is on. How "on" is decided
  is a setting of its own: exactly matching the command, or counting any value above 0, so a dimmer
  part way up or a color with any brightness reads as on. Per-state icons throughout, and any of
  them can open another dashboard or a web address instead of sending anything.
- **Cameras.** Live video from go2rtc, Frigate, an openHAB camera binding or any stream URL.
  MJPEG, HLS, MP4, snapshots and WebRTC are all understood. neohab tries the lowest-latency route
  first and falls back until one works. Streams stop when nobody is looking.
- **Colour.** Hue, saturation and brightness on three tracks, each showing what dragging it would
  do at the other two. A pair of buttons sits on the swatch unless you turn them off: Off switches
  the light off and openHAB keeps its colour, so every panel still shows what it will come back to,
  and On restores the brightness it was last seen at instead of jumping to full. That takes no
  extra openHAB item and writes nothing to the server.
- **Slider.** Five styles: a gradient track, a wedge that thickens toward the thumb, a rail sunk
  into a plate with the ends of its scale printed either side, the value riding the thumb in a
  bubble, and the theme's own plain control. Any of them lies across the tile or stands on end as
  a fader. Each keeps the colours it was designed in, and is rebuilt in the tile's accent colour
  when you set one.
- **Stepper.** A value with a step up and a step down: a thermostat setpoint, a volume, a fan
  speed, or a list such as a TV's inputs, which it cycles through and can wrap around. Six looks
  (a stack, a pair of buttons under the reading, a spinner, a split tile whose two halves are the
  buttons, a carousel with position dots, a range bar), five finishes from the theme's plain
  controls to frosted glass, a neon glow, solid accent plates and a glossy sheen, and your choice
  of arrow glyph. A run of quick taps costs the device one command.
- **Battery.** The charge of anything with a battery, drawn eight ways: a phone-shaped body lit
  from the base, a neon tube, four cells, a tick ring, a lozenge with a caption and an icon, the
  status-bar battery, a liquid wave, or a segment meter. The item is read as 0 to 100 unless you
  give it its own range, which is scaled to a percent. Green, amber or red by level with the
  thresholds yours to set, or the tile's accent colour; a charging item lights a bolt; the
  percent can be shown or hidden on every style. Short and narrow tiles put the glyph beside the
  number rather than clipping either.
- **Log.** openhab.log, events.log or both, as they happen, on a tile: a console that follows the
  newest line, colours warnings and errors and dims debug output, and is filtered by a minimum
  level, logger names (`org.openhab.binding.mqtt`, or a glob) and a text the message must
  contain. A pause button at the top right stops the tile so a line can be read, and picks up
  where it left off rather than losing what went past. Hold the tile and the same log opens full
  screen with a search box, the level and the source as chips, pause, clear and copy. It reads
  the feed openHAB's own log viewer uses, so
  there is no file to reach and nothing to configure on the server; openHAB 5 shows it to
  administrators only, and the tile says so to anyone else.
- **Thermostat.** The room's temperature and the setpoint, with buttons to move the setpoint and
  a ring you can drag it round, plus buttons for the mode (heat or cool), the fan (auto or on)
  and auxiliary heat, each bound to whatever item your thermostat binding gives you and each
  optional. Four looks: an arc with the buttons in its gap, a solid dial in the mode's colour
  ringed with ticks, a disc that marks both temperatures on its rim, and a ring around a plate of
  readings. A face that is heating or cooling takes that colour; one that is neither is coloured
  by temperature instead, its ring running cool to warm across the scale, so you can see how warm
  a setting is before you read it. Both colours are yours to change. The commands and the words
  your binding uses for heat, cool, auto and on are settings, so a Nest, an Ecobee and a Z-Wave
  thermostat all fit, and a status item turns the label into Heating, Cooling or Idle. A run of
  quick taps costs the device one command.
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

- **Wall panels and kiosks.** Installable as an app (PWA) with an offline-capable shell, and able
  to keep the screen awake - both of those need HTTPS, because browsers only offer them in a
  secure context. Adding it to a home screen while a dashboard is open pins that dashboard: the
  icon is named after it and opens straight into it, so you can keep several side by side. Per
  device: blank after idle or show a drifting clock, open onto a pinned dashboard, and hide all
  chrome in kiosk mode. A dashboard-control item lets your rules switch what every panel shows.
- **Voice and audio.** openHAB's Web Audio sink plays through the browser, a speech item announces
  changes out loud, and a microphone button sends spoken commands to the interpreter. Each device
  decides whether it joins in.
- **As many tabs as you like.** Browsers allow only a handful of connections per server, so
  several dashboards would normally leave one frozen on stale values. neohab shares a single
  connection across the whole browser, and says so if updates ever stop arriving.
- **View-only for visitors.** Like openHAB's own UIs, devices not signed in as an administrator
  get a clean read-only panel: buttons and sliders still work, but dashboards, themes, presets
  and settings can only be changed after an administrator sign-in.
- **Away from home.** Built for a reverse proxy or openHAB Cloud, though neither has been tested
  end to end yet. Credentials are kept in memory for the session, never written to the device.
  Inside the official openHAB phone app it picks them up by itself.
- **Your language.** English, German, Spanish, French, Italian, Dutch and Polish (machine-drafted,
  native review welcome), from the browser language with a per-device override.
- **What is yours and what is this device's.** The theme, backgrounds, dashboards, presets and
  widgets are shared with every device and travel in a backup. The theme override, language, text
  size, kiosk and audio choices and the pinned sidebar belong to the browser they were set in, and
  do not. Settings says which is which.
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
  contains, the dashboard around it keeps working and the editor is still there to fix it. If a
  whole screen fails, you get a panel saying what went wrong with links back to the dashboard list
  and to settings, so there is always a way out without editing the address bar. Configuration
  saved by a newer neohab than the one running is left strictly alone rather than guessed at. It is
  never overwritten or tidied away, so an older wall panel cannot damage what a newer one wrote.

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
add-on: [DSEG](https://github.com/keshikan/DSEG) (© keshikan),
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

## Help and bugs

Open an [issue](https://github.com/Fohdeesha/neohab/issues). Settings ends with an **About** screen
that offers one block to paste in: it says which neohab and openHAB you are on, what the device is
signed in as, whether live values are arriving, and which persistence services the server has, with
no addresses, credentials or item names in it.

Security problems go **privately** instead - see [SECURITY.md](SECURITY.md).

## License

[Eclipse Public License 2.0](LICENSE)
