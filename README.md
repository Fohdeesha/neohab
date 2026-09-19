<picture>
  <source media="(prefers-color-scheme: dark)" srcset="web/public/logo.svg">
  <img src="web/public/logo-light.svg" alt="neohab" width="360">
</picture>

# neohab

A modern dashboard UI for [openHAB](https://www.openhab.org/).
Modern web dashboards with mobile devices and tablets as first class citizens, built and configured entirely in the browser.

**Status:** in daily use, latest release **1.33.0**. A community project, not an official openHAB UI.

## Requirements

- **openHAB 4.1 or newer, including 5.x: everything works.** One jar covers every version
- **openHAB 3.1 to 4.0: supported, with four gaps - see below**
- **openHAB 3.0 and older** cannot run it at all, the add-on interface neohab plugs into did not exist yet

openHAB **4.0** | Loses: the **log widget**. openHAB added the log feed it reads in 4.1  
openHAB **3.9** | Loses: **Floor plan presets for signed-out viewers.** Signed in they work; a wall panel with nobody logged in will not list them  
openHAB **3.9** | Loses: **Semantic tags you define yourself** in the dashboard generator. Built-in tags work everywhere, so generation still works  

- **A browser from 2023 or later**: Chrome or Edge 111, Safari 16.4, Firefox 121. Older browsers are shown a warning instead of rendering broken pages
- **Nothing else.** Only openHAB's public REST and SSE APIs. No server-side code of ours, no
  account, no cloud. The only possible outside service neohab can call is
  [Open-Meteo](https://open-meteo.com/), and only once you put a weather widget on a dashboard and chose Open-Meteo as the data source, instead of local items
- **A persistence service** for charts, timelines, sparklines and trends: rrd4j, InfluxDB, JDBC and
  the in-memory service all work. MapDB stores only each item's last value, so there is no history
  to draw, and the widgets say so
- **HTTPS** for three things only: installing as an app, keeping a screen awake, and the
  microphone. Modern browsers offer those in a secure context and nowhere else

## Install

1. Download the jar from the [releases page](https://github.com/Fohdeesha/neohab/releases)
2. Drop it into openHAB's `addons/` folder (`/usr/share/openhab/addons`)
3. It's picked up in a few seconds, no restart. openhab.log says `Started neohab at /neohab`
4. Open **http://your-server:8080/neohab/** and sign in as an openHAB administrator

There is a [five-minute guide](docs/getting-started.md) in the add-on, linked from the welcome
screen and served at `/neohab/docs/getting-started.html`

**Upgrading:** delete the old jar, wait for it to stop, then copy the new one in. Don't keep the old
one beside the new one, openHAB keeps whichever it read last and logs a
warning, so you can end up still running the old version with nothing obvious
to show for it. Open tabs offer to reload themselves

**Removing it:** Just delete the jar. Dashboards stay in openHAB's JSON database under the three
`neohab:*` namespaces, so putting the jar back brings everything with it.

## Widgets

Not guaranteed to be an exhaustive list, but at minimum: Buttons, sliders, dials, steppers, colour pickers, selections, rollershutters,
thermostats and media players. Flexible value readouts (plain, stat, sparkline, split,
bar, segment, pill, hero), plus compasses, batteries, clocks, weather and plain labels. Charts,
timelines, floor plans with live light glows and control, cameras, images, embedded pages and the server log.
Anything missing can be built as a custom widget from an HTML template, with an optional sandboxed
JavaScript API

Every widget shares the same naming, sizing and per-state icon settings. Long-hold or right click a widget, and you'll get a details
page with the current value, when it last changed, recent history graph and that widget's own
full-size control options which varies per widget

## Dashboards

Add and arrange your widgets on a dash: drag to move or resize, drag in from the palette, select multiple widgets by clicking and dragging, copy
and paste between dashboards or on the same dashboard with ctrl+c ctrl+v, undo anything. What you see while editing is what a save produces.

Phones and portrait tablets get a single-column stack you can reorder on its own without effecting landscape / full size displays, and there's an
optional tablet layout with its own column count. Any widget can be left off any of the three.
Text and icons scale with the tile, and with per-dashboard, per-widget and per-device settings.

A lot of effort was spent ensuring that regardless of the device / screen / orientation you open your dashboards on, the layout and sizing does what's needed to maintain layout and visibility - smart text, icon, and widget resizing, so nothing is ever cut off or clipped.  Settings to further optimize this also exist: per device scaling / text size overrides, per dashboard overrides, per widget overrides.

You can optionally have Neohab create dashboards for you, from your semantic model if you
have one, otherwise by naming convention or group. Everything it picks and puts together is listed for review first.

## Theming

Sixteen themes ship with it, seven of them ports of HABPanel's. The editor previews as you type,
explains every design token, checks whether your colours can actually be read, and validates a
custom stylesheet. Themes are global to the Neohab instance
unless you pin one to a single device, and they travel with your backups. See
**[Making a theme](docs/theming.md)**.

If a theme ever makes the app unusable or invisible, add `?theme=none` to the address to load with the default
one for that page load to recover.

## Running it

- **Wall panels** - Installable as an app from your mobile browser (Android, iOS is currently untested) with an offline shell, able to keep the screen awake, with
  a per-device pinned dashboard, idle blanking and a kiosk mode. Adding a dashboard to a home
  screen pins that dashboard, so several shortcuts can sit side by side. A dashboard-control item lets your
  rules switch what every panel shows
- **Visitors** - Devices not signed in get a read-only panel: controls still work, configuration
  does not. That's openHAB's default posture, same with HabPanel
- **Voice and audio** - openHAB's Web Audio sink plays through the browser, a speech item announces
  changes, and a microphone button sends spoken commands to the interpreter
- **Backups** - Export and import the whole configuration as a single JSON file, or a single dashboard, widget or
  theme on its own
- **Change Tracking** - A restore point is taken before each change you make in Neohab, the last twenty-five are kept by
  default, and you can see what changed field by field, and roll back to whatever point you wish
- **Languages** - English, German, Spanish, French, Italian, Dutch and Polish, from the browser
  language with a per-device override

## Coming from HABPanel

**Settings › Migrate from HABPanel** imports your HABPanel dashboards completely, either from the OpenHAB install or from a
`habpanel-config.json` export you can upload. Widgets, layout, icons and dashboards are mapped, all seven of
HABPanel's themes have a port here (the originals are by Yannick Schaus and the openHAB
contributors), and custom AngularJS templates arrive as neohab template widgets. You get
a report of what came over cleanly, what was approximated and what needs a look, and nothing is
written until you've seen it and approved.

`additional_stylesheet_url` is the one thing that cannot come across, because its selectors are
HABPanel's. [The theming guide](docs/theming.md) has the table to translate it.

## Behind a reverse proxy

Don't buffer the event stream, or live values arrive in bursts or not at all:

```nginx
location / {
  proxy_pass http://localhost:8080/;
  proxy_set_header Host $host;
  proxy_http_version 1.1;
  proxy_buffering off;      # the item-state stream is server-sent events
  proxy_read_timeout 3600s;
}
```

Two things are worth knowing if you move to HTTPS. The certificate has to be one the browser
trusts, or the app will read fine but will not install as an app. And an `http://` camera, frame or
image cannot load into an `https://` page: browsers block it silently, so neohab says so on the
widget and in its settings as you type the address.

If you have turned openHAB's implicit user role **off**, neohab asks you to sign in before showing
anything. Commands and configuration then work normally, but live values do not update: they arrive
over an `EventSource`, which browsers do not allow a token to be attached to. neohab says so on screen
rather than showing stale numbers

## Icons and fonts

Nearly 10,000 icons ship in the add-on, so it works with no internet at all: [Material Design
Icons](https://pictogrammers.com/library/mdi/), [Fluent
Emoji](https://github.com/microsoft/fluentui-emoji), [Flat Color
Icons](https://github.com/icons8/flat-color-icons) and
[Meteocons](https://github.com/basmilius/meteocons). Your server's own icon sets and your own
uploads sit alongside them. The themes that need a font bundle them: DSEG, Montserrat and Poppins.

Everything bundled, with its licence and copyright, is listed in [NOTICE](NOTICE).

## Development

React, TypeScript and Vite, served by a thin OSGi add-on shell, talking to openHAB through its
public REST and SSE APIs. **[CONTRIBUTING](CONTRIBUTING.md)** covers running it against your own
openHAB with no Java build. The browser end-to-end suites live in [`e2e/`](e2e/); read
[`e2e/README.md`](e2e/README.md) before pointing them at a server you care about to avoid unwanted changes being made to your production dashboards

## Help

Open an [issue](https://github.com/Fohdeesha/neohab/issues). In your Neohab install, the Settings page ends with an **About** blurb
that shows all the relevent info - please paste this in to any github issues. Security
issues should go **privately** instead: see [SECURITY.md](SECURITY.md).

## License

[Eclipse Public License 2.0](LICENSE)


[Eclipse Public License 2.0](LICENSE)
