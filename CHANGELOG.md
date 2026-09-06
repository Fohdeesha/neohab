# Changelog

What changed in each release, in a few lines. The release workflow publishes the matching section
as the release notes, so this file is what people read on the releases page.

Anything not listed here yet is on `main` and ships with the next release.

## Unreleased

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
