# Changelog

One line per change. The release workflow publishes the matching section as the release notes.

Anything not listed here yet is on `main` and ships with the next release.

## Unreleased

## 1.32.0

- A timeline widget with nothing to draw covered the whole dashboard with an invisible box and
  swallowed every click on it. It did that while loading history too, so any dashboard with a
  timeline was dead to the touch for a second or two on every load.
- A widget bound to an item your server does not have now says so and names the item, instead of
  drawing a slider at 0 or a dial at empty as though the device were off.
- An image that cannot be loaded says so instead of leaving a blank tile.
- When live values stop arriving, the reason given is the right one. A server that shows nothing
  without an account used to be reported as a proxy problem to anyone signed in.
- The stepper's Glass finish gets its blur back on Safari 17 and older.

## 1.31.0

- Installs on openHAB 3.1 and up. It refused anything older than 4.3 before, and said so only in
  the server log.
- The log widget says "needs openHAB 4.1 or newer" and names your version, instead of retrying for
  ever on a server that has no log feed at all.
- Settings, About lists anything your openHAB is too old to do, so you are not left guessing why a
  widget is empty.
- The dashboard generator no longer asks openHAB 3 for semantic tags it does not have, which was a
  404 in the browser console on every open.

## 1.30.0

- The widget gallery only offers what ships in the add-on. It could also pull widget code off
  GitHub at runtime, which is not something an add-on should do.
- Added a NOTICE file listing every icon set, font and library in the jar, with licenses. It ships
  inside the jar.
- Sign in, New dashboard, Add a widget, Generate and the HABPanel import are centred dialogs on a
  desktop instead of full width bottom sheets. A 1920px screen used to give you a 1890px box to
  type a dashboard name into. Still full width on a phone.
- The five minute guide is linked from the first screen, not only after you sign in.
- Links in neohab's own screens use the theme colour instead of browser blue.
- The README is about a quarter of the length it was.

## 1.29.0

- Translated 45 strings that were still English, mostly theme editor token names and contrast
  verdicts.
- Widget settings ask which item first, instead of after nine appearance settings.
- Widget settings are grouped, and the groups fold away where the panel covers a phone screen.
- Messages on the settings page appear where you are looking, not at the top of a very long page.
- The HABPanel import lists what it would change for every device before writing anything, and you
  can decline any of it.
- A server that cannot be asked about HABPanel says so instead of reporting an empty one.
- The welcome screen's import and restore buttons open Settings at that section.
- A getting started guide ships with the add-on.
- A chart opened full screen fills the page instead of sitting at its smallest height.
- Floor plan lighting shows up on light themes.
- A floor plan on a phone is sized for the plan, and the preset chips no longer cover it.

## 1.28.0

- Battery widget, drawn eight ways, with its own input range, colour by level and a charging bolt.
- Charts work in short tiles again. The axes took a fixed 50px each and squeezed the plot to
  nothing on a landscape phone.
- The timeline keeps its row names and its clock on a short tile.
- Chart and timeline text follows the tile's text size instead of a fixed small one. The range
  chips were 8.7px.
- A widget added on the desktop layout no longer lands on top of one moved on the tablet layout.
- Buttons have a Card style, and eight finishes from plain to glass, glow and neon.
- The log widget keeps up with a chatty server. It was using a whole core at forty lines a second.
- A log tile stops following the newest line only when you scroll it yourself.
- Typing in an item or icon picker is no longer interrupted by a log tile scrolling elsewhere.

## 1.27.0

- The switch widget is now a style of the button widget. Existing switches convert when they load.
- "Count any value above 0 as on" is its own setting, so a dimmer part way up can read as on
  whichever style is drawing it.
- A new button arrives set to toggle, so it does something the moment you give it an item.
- Translated the Panel group and the Theme default alignment option.

## 1.26.0

- Adding a dashboard to a phone's home screen pins that dashboard, with its own icon.
- The app icon is no longer cut off by Android launchers.

## 1.25.0

- neohab has a logo: the name in Poppins with a lit doorway for the n.
- Signing out ends the session on the server, not just on the device.
- Servers that show nothing without an account work properly.
- A save the server refuses offers a sign in and saves again after, keeping your work.
- Failures are written in words instead of REST calls and status codes.
- The editor toolbar no longer pushes Save off a phone screen.
- A browser too old to run neohab is told so instead of rendering a broken page.
- Settings has an index, and says which options are shared and which belong to this device.
- Escape closes any panel or sheet.
- HTTPS is supported and tested. An `http://` camera or framed page inside an https page says so
  instead of showing an empty box.
- Log widget: openhab.log, events.log or both, live on a tile, filtered by level, logger and text.

## 1.24.0

- Sliders in five styles, and any of them can stand on end as a fader.
- A HABPanel vertical slider imports as one.

## 1.23.0

- Thermostat widget: room temperature and setpoint, buttons and a draggable ring, plus mode, fan
  and auxiliary heat. Four looks.

## 1.22.0

- Stepper widget: step a value or cycle a list, in six looks and five finishes.
- Swiss Sheet redone flat against its reference, and it no longer bundles a font.
- On a screen driven by a mouse, text keeps its normal size wherever the row can hold it.
- A bottom sheet stays clear of a pinned sidebar.

## 1.21.0

- The colour picker's on and off buttons show by default and keep one fixed pair of colours.

## 1.20.1

- The on and off buttons lie on the swatch rather than moving off it in a short tile.

## 1.20.0

- Colour picker: Off switches the light off and keeps its colour, On restores the brightness it was
  last seen at. No extra item, nothing written to the server.

## 1.19.0

- Weather and clock tiles answer a hold with a view of their own.
- Clocks can be set to any time zone, and follow the openHAB server's clock by default.
- A big reading is sized to the tile it is in rather than clipped by it.

## 1.18.0

- Faders and floor plan glows move once and settle where the device settles, instead of jumping
  about while a light fades.
- The clock widget has a card like every other widget, and can be told not to.
- The weather panel fits its tile, and its rain chance is the day's.

## 1.17.0

- What you see while editing is what a save produces. The editor's chrome is drawn only on the
  widget you point at, and opening a settings panel zooms the grid rather than squeezing it.
- Every widget calls its title its Name, and can be told not to show one.

## 1.16.0

- Weather widget, in three looks, from Open-Meteo or your own items.
- Hold or right click any tile for its current value, when it last changed, and recent history.
- Charts gained 3h and 6h ranges, and a say in which ranges they offer.

## 1.15.1

- Editing is administrators only, like openHAB's own UIs.

## 1.14.0

- Hardening from a full read of the source: URLs are normalised before they are judged, tables are
  never indexed with a key from stored configuration, and the item catalog asks only for the fields
  it reads.

## Older

For 1.13.0 and earlier, see the
[release history](https://github.com/Fohdeesha/neohab/releases).
