# Changelog

What changed in each release, in a few lines. The release workflow publishes the matching section
as the release notes, so this file is what people read on the releases page.

Anything not listed here yet is on `main` and ships with the next release.

## Unreleased

## 1.28.0

- Battery widget: the charge of anything with a battery, drawn eight ways (Neon to start), with its own input
  range scaled to a percent, colour by level or by the tile's accent, an optional charging item
  that lights a bolt, and the percent shown or hidden on every style.
- A chart in a short tile draws a chart again. Its axes took a flat 50px each whatever was left, so on
  a landscape phone the plot was squeezed to nothing and the widget showed a flat line with no values
  against it. An axis now only takes its space while the plot keeps a usable share, and the room it
  takes follows the text size, which also stops a two-line date label being cut off at the bottom of
  the canvas. The range choosers stay on one row and scroll sideways rather than wrapping over the
  plot, and a chart with a name puts its full-screen button in that name row instead of a row of its
  own.
- The timeline names its rows and shows its clock on a short tile. Both were being dropped when the
  tile was short, though the names cost width rather than height, which left a landscape phone with
  three unlabelled strips. The clock also reads the hour rather than the hour and minute on a window
  of more than a few hours, so the times no longer run into each other on a phone.
- The chart's range choosers, its x and y axis labels, the timeline's clock and the chart legend are set
  at the tile's own text size instead of a fixed small one. The choosers were the worst of it: parked in
  the widget's name row they inherited its size and then shrank again on top, which put them at 8.7px on
  a normal dashboard. They follow the dashboard, device and per-widget text settings now, like everything
  else a person reads.
- A widget added while you were editing the desktop layout no longer lands on top of one that had been
  moved on the tablet layout. It is fitted around the widgets that have a tablet position of their own,
  which also repairs a dashboard that already overlaps.
- Buttons have a look worth putting on a wall. Alongside the pressable tile and the sliding toggle
  there is now a Card style, with the icon in a chip at one corner, a state pip at the other and the
  name over its caption along the bottom. Both take a Finish: plain is the theme's own control and is
  what every existing button keeps, while solid, glass, glow, edge, outline, sheen and bare fill the
  tile edge to edge and take their colour from the widget's Accent color. A theme still restyles the
  plain finish; the others keep the look you picked whichever theme is on.
- The log widget keeps up with a chatty server without taking the browser with it. Every arriving line
  was written to the store on its own, and each write re-drew every log tile's whole list, so a server
  writing forty lines a second used a whole processor core. Lines are collected and drawn five times a
  second now, and the rows scrolled out of sight are left for the browser to skip. Same log, a third of
  the work, and nothing was growing without bound either way.
- A log tile no longer stops following the newest line on its own. Anything that moved the box for a
  frame, such as opening a settings panel beside it, could be read as the reader scrolling away, and
  the tile then held its place and walked further from the newest line with every line that arrived.
  Only your own scrolling stops it following now.
- Typing into an item or icon picker is no longer interrupted by another widget on the same dashboard.
  Anything scrolling anywhere in the page closed the list and put the stored name back under the
  typing, and a log tile follows its newest line about once a second, so on a dashboard with one the
  search was wiped a second or two after it was typed. Only a scroll that can actually move the field
  closes the list now.

## 1.27.0

- The switch widget is now a style of the button widget rather than a widget of its own. They were
  two ways of drawing the same job, and the palette offered both with no way to tell which you
  wanted. The Style setting is only the look, a pressable tile or a sliding toggle; both send the
  same commands and behave the same way. Dashboards that already have switches are converted when
  they load, keeping their commands, icons and names, and are written back in the new shape the
  next time you save.
- How a tile decides it is on is now a setting rather than a side effect of which widget you
  picked. "Count any value above 0 as on" makes a dimmer at 50% or a color with any brightness
  read as on, which is what the switch widget used to do; leave it off and the tile lights up only
  when the item matches its command exactly. It works on either style.
- A new widget now arrives set to toggle between its command and its alternate, so it does
  something useful the moment you give it an item.
- Panel group, its explanation and the "Theme default" name-alignment option are translated. They
  had never been in the catalogs, so they showed in English in all six languages.

## 1.26.0

- Adding neohab to a phone's home screen while a dashboard is open now pins that dashboard. The
  icon is named after it and opens straight into it, and a second dashboard gets a second icon
  rather than replacing the first. Adding it from the dashboard list still gives a plain neohab
  icon.
- The app icon no longer has the top of its arch cut off on Android. A launcher only shows about
  the middle two thirds of an icon, so the mark now sits centred and small enough to survive that.

## 1.25.0

- neohab has a logo: the name in Poppins with a doorway for its n and its windows lit in the
  openHAB orange. It is the wordmark on the home screen, the favicon, the app icon and the tile
  on openHAB's start page.
- Signing out now ends the session on the server, not just on the device.
- A server that shows nothing without an account works properly: signing in loads your dashboards
  straight away, a deep link asks you to sign in instead of claiming the dashboard does not exist,
  and a failed sign-in says so rather than leaving you looking at an unchanged screen.
- A save the server refuses now offers a sign-in and saves again afterwards, keeping your work.
  Leaving the editor with unsaved changes asks first, whichever way you leave.
- Failures are written in words instead of REST calls and status codes, throughout.
- Editing on a phone: the toolbar no longer pushes Save off the screen.
- A browser too old to run neohab is told so instead of rendering a broken page.
- Settings has an index at the top, and says which of its options are shared and which belong to
  this device only.
- Escape closes any panel or sheet; a new tile is named after the item you bind to it; new widgets
  start at a more sensible size.
- The slider's gradient and bubble styles run copper to verdigris instead of cyan to magenta,
  and the gradient's reading is tinted toward the theme's ink so it reads on a light theme too.
- Serving neohab over HTTPS is supported and tested. Where an `http://` address cannot be loaded
  into an https page - a camera stream, a framed page, an image - the widget says so instead of
  showing an empty box, and the settings field warns while you are typing it.
- A log widget: openhab.log, events.log or both on a tile, live, following the newest line and
  filtered by level, logger and text. A pause button at the top right stops the tile so a line
  can be read, and picks up where it left off. Holding it opens the log full screen with a
  search box, level and source chips, pause, clear and copy.

## 1.24.0

- Sliders in five styles - gradient, wedge, inset rail, value bubble, and the theme's own - and any
  of them can stand on end as a fader.
- A HABPanel vertical slider now imports as one.

## 1.23.0

- Thermostat widget: room temperature and setpoint, buttons and a draggable ring, plus mode, fan
  and auxiliary heat, each bound to whatever item your binding gives you. Four looks.

## 1.22.0

- Stepper widget: step a value or cycle a list, in six looks and five finishes. A run of taps costs
  the device one command.
- Swiss Sheet redone flat against its reference, and it no longer bundles a font.
- On a screen driven by a mouse, text keeps its normal size wherever the row can hold it.
- A bottom sheet stays clear of a pinned sidebar.

## 1.21.0

- The colour picker's on and off buttons are shown by default, stack on the swatch, and keep one
  fixed pair of colours instead of changing with the light.

## 1.20.1

- The on and off buttons lie on the swatch rather than moving off it in a short tile.

## 1.20.0

- Colour picker: Off switches the light off and openHAB keeps its colour; On restores the
  brightness it was last seen at. No extra item, nothing written to the server.

## 1.19.0

- Weather and clock tiles answer a hold with a view of their own: the whole forecast, or the date,
  the seconds and the time zone.
- Clocks can be set to any time zone, and follow the openHAB server's clock by default.
- A big reading is sized to the tile it is in rather than clipped by it.

## 1.18.0

- Faders and floor-plan glows move once and settle where the device settles, instead of jumping
  about while a light fades.
- The clock widget has a card like every other widget, and can be told not to.
- The weather panel fits its tile, and its rain chance is the day's, as every forecast site quotes
  it.

## 1.17.0

- What you see while editing is what a save produces: the editor's chrome is drawn only on the
  widget you point at, and opening a settings panel zooms the grid rather than squeezing it.
- Every widget calls its title its Name, and can be told not to show one.

## 1.16.0

- Weather widget, in three looks, from Open-Meteo or your own items.
- Hold or right-click any tile for its current value, when it last changed, and recent history.
- Charts gained 3h and 6h ranges, and a say in which ranges they offer.

## 1.15.1

- Editing is administrators-only, like openHAB's own UIs.

## 1.14.0

- Hardening from a full read of the source: URLs are normalised before they are judged, tables are
  never indexed with a key from stored configuration, and the item catalog asks only for the fields
  it reads.

## Older

For 1.13.0 and earlier, see the
[release history](https://github.com/Fohdeesha/neohab/releases).
