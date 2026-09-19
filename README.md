<picture>
  <source media="(prefers-color-scheme: dark)" srcset="web/public/logo.svg">
  <img src="web/public/logo-light.svg" alt="neohab" width="360">
</picture>

# neohab

A modern UI for [openHAB](https://www.openhab.org/).
Modern web dashboards with mobile devices and tablets as first class citizens, built and configured entirely in the browser. **Status:** in daily use, latest release **1.33.0**. A community project, not an official openHAB UI.

<p float="center">
  <img src="imgs/1.png" width="400" />
  <img src="imgs/2.png" width="400" /> 
</p>

<p float="center">
  <img src="imgs/3.png" width="400" />
  <img src="imgs/4.png" width="400" /> 
</p>

## Requirements

- **openHAB 4.1 or newer, including 5.x: everything works.** One jar covers every version
- **openHAB 3.1 to 4.0: supported, with some disabled features: [see end of readme](#old-openhab-limitations)**
- **openHAB 3.0 and older** cannot run at all, the add-on interface neohab uses did not exist yet  

- **A browser from 2023 or later**: Chrome or Edge 111, Safari 16.4, Firefox 121. Older browsers are shown a warning instead of rendering broken pages
- **Nothing else.** Only openHAB's public REST and SSE APIs. No server-side code of ours, no
  account, no cloud. The only possible outside service neohab can call is
  [Open-Meteo](https://open-meteo.com/), and only once you put a weather widget on a dashboard and chose Open-Meteo as the data source, instead of local items
- **A persistence service** for charts, timelines, sparklines and trends: rrd4j, InfluxDB, JDBC and
  the in-memory service all work. MapDB stores only each item's last value, so there is no history
  to draw, and the widgets say so
- **HTTPS** for two things only: keeping a screen awake, and the
  microphone for voice input. Modern browsers will not allow those over HTTP

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

<table>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-button.png" width="100%"><br><b>Button</b><br>Send a command, toggle an item, or jump to another dashboard. Eight finishes, a card or a sliding-switch look, and an icon that can change with the state.</td>
<td width="50%" valign="top"><img src="imgs/widget-slider.png" width="100%"><br><b>Slider</b><br>Set a dimmer or any number. It will not jump back under your finger while the device catches up, which is the HABPanel slider everyone has fought with. Five looks, across or upright.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-dial.png" width="100%"><br><b>Dial</b><br>A round control in six looks, from a plain knob to an LED ring. Coloured zones, markers, an alarm band, a history ring, and a second item on the same face.</td>
<td width="50%" valign="top"><img src="imgs/widget-color.png" width="100%"><br><b>Colour</b><br>Hue, saturation and brightness on one tile. On puts the lamp back to the brightness it was last used at, instead of blasting it to full.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-selection.png" width="100%"><br><b>Selection</b><br>A set of commands as buttons or a dropdown. It reads the item's own options when it has them, or you type your own list.</td>
<td width="50%" valign="top"><img src="imgs/widget-stepper.png" width="100%"><br><b>Stepper</b><br>Up and down by a step you pick, or around a list of values, in six looks. Volume, fan speed, a setpoint, a source.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-thermostat.png" width="100%"><br><b>Thermostat</b><br>Room and setpoint on one face, with heat and cool, fan and aux heat. It reads the room at the precision your setpoint steps in, not the whole degree openHAB prints by default.</td>
<td width="50%" valign="top"><img src="imgs/widget-rollershutter.png" width="100%"><br><b>Rollershutter</b><br>Up, stop and down, with the position underneath. No position slider to catch with a thumb, here or in the detail view, because that is a real door moving.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-player.png" width="100%"><br><b>Player</b><br>Previous, play or pause, and next, for any Player item.</td>
<td width="50%" valign="top"><img src="imgs/widget-label.png" width="100%"><br><b>Label</b><br>Fixed text to title a row or break a dashboard into groups. Plain, in a pill, or in a box.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-value.png" width="100%"><br><b>Value</b><br>One reading, drawn eight ways: plain, stat, sparkline, split, bar, segment, pill or hero. The sparkline and the trend arrow come from your persistence service.</td>
<td width="50%" valign="top"><img src="imgs/widget-battery.png" width="100%"><br><b>Battery</b><br>Charge in eight styles, coloured by how low it is, with a charging item for the bolt.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-compass.png" width="100%"><br><b>Compass</b><br>Wind or any bearing on a compass face, with a second item, usually the speed, in the middle.</td>
<td width="50%" valign="top"><img src="imgs/widget-clock.png" width="100%"><br><b>Clock</b><br>Analog or digital, with the date, extra time zones for the people you call, and either the device's clock or the server's.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-weather.png" width="100%"><br><b>Weather</b><br>Conditions, hours and days from Open-Meteo, or from your own items if a binding already fetches them. Three layouts and a choice of forecast model.</td>
<td width="50%" valign="top"><img src="imgs/widget-floorplan.png" width="100%"><br><b>Floor plan</b><br>Your plan with the lights on it, each glowing in the colour and brightness it is actually at. Tap one to control it, and scenes you save become openHAB rules any panel or wall switch can run.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-chart.png" width="100%"><br><b>Chart</b><br>History from your persistence service: several items, two axes, thresholds, a period picker, and new values drawn as they arrive. It also groups by hour, weekday or month, or draws a heatmap.</td>
<td width="50%" valign="top"><img src="imgs/widget-timeline.png" width="100%"><br><b>Timeline</b><br>What was on and when, as coloured bands. You pick the colour for each state.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-camera.png" width="100%"><br><b>Camera</b><br>go2rtc, Frigate or a plain URL, over WebRTC, MSE, HLS, MJPEG or snapshots. It works down the list until one connects, and drops the stream when the tile is off screen.</td>
<td width="50%" valign="top"><img src="imgs/widget-image.png" width="100%"><br><b>Image</b><br>Any image by URL, refreshed on a timer: a camera snapshot, a radar map, a plan, a graph something else already draws.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-frame.png" width="100%"><br><b>Frame</b><br>Any web page in a tile, with a refresh timer and a sandbox switch for pages you do not fully trust.</td>
<td width="50%" valign="top"><img src="imgs/widget-log.png" width="100%"><br><b>Log</b><br>openHAB's log and its event bus as they happen, filtered by level, logger or text, with a pause and a full-screen view. Needs openHAB 4.1 or newer.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="imgs/widget-template.png" width="100%"><br><b>Template</b><br>Your own HTML with <code>{{ }}</code> expressions and the same helpers HABPanel had, so its custom widgets come across. For real code there is an opt-in sandboxed JavaScript widget.</td>
<td width="50%" valign="top"></td>
</tr>
</table>

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

## Old OpenHAB Limitations

openHAB **4.0** | Loses: the **log widget**. openHAB added the log feed it reads in 4.1  

openHAB **3.1 - 3.x** | Loses: **Floor plan presets for signed-out viewers.** Signed in they work; a wall panel with nobody logged in will not list them. Also **Semantic tags you define yourself** in the dashboard generator. Built-in tags work everywhere, so generation still works  

openHAB **3.0 and older** | Incompatible, Neohab will not start

## License

[Eclipse Public License 2.0](LICENSE)
