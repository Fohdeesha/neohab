# Changelog

One line per change. The release workflow publishes the matching section as the release notes.

Anything not listed here yet is on `main` and ships with the next release.

## Unreleased

## 1.38.0

- Restoring a backup only rebuilds neohab's own preset rules, never any other openHAB rule.
- The app now sets a Content-Security-Policy, and JavaScript widgets run in a sandboxed page of their own.
- Camera and image addresses that could run script are refused, and template expressions can only call safe methods.
- Importing a shared file as a copy can no longer overwrite a different dashboard.
- A proxy login survives a token refresh, and a proxy's 401 no longer signs you out.
- Nothing is saved over the server's copy while the configuration failed to load.
- Replacing everything from a backup made without images keeps the images its dashboards use.
- Lowering "Restore points kept" asks first, and a named restore point is only removed by hand.
- The background address saves on Enter or when you leave the field, not on every keystroke.
- A theme with no colors or a broken settings section no longer takes the app down.
- Saving a preset keeps what you added to its rule, "turn off" only switches lights, and a toggled preset turns its wall switch off too.
- Re-importing from HABPanel keeps custom widgets you edited since.
- Dials ignore presses in the gap and the centre, stop at an end when dragged past it, and no longer jump at 12 o'clock.
- Right-clicking a dial no longer sends a value, and the detail sheet only drags live where the widget does.
- The thermostat no longer jumps to the far end when stepping from outside its range.
- Stepper, thermostat, player and selection show what you sent until the device answers.
- A dashboard that fails to load says so and retries, and an update offers a reload instead of reloading under you.
- Cameras recover after a restart, and new openHAB items can be picked without reloading.
- Charts count grouped readings once, keep the live tail on refresh, and the full-screen chart stops inventing the rest of the day.
- The log catches up after openHAB restarts, and a logger filter full of stars can no longer freeze the page.
- Dates, times and chart axes follow the app's language.
- A missing item keeps the tile's name, and only the widget's main item blanks it.
- Pasted widgets from an older neohab are converted, and custom widget checkboxes, choices, colors and icons get proper fields.
- "Sign in and save" keeps your changes through the openHAB login, and signing in returns you to the page you were on.
- Lowering the column count pushes widgets down instead of stacking them, and typing a number no longer squeezes the layout.
- The editor stacks exactly where the dashboard does, and turning a tablet upright edits the layout the phone shows.
- Uploaded backgrounds are stored at up to 4K, as JPEG or PNG, whichever is smaller.
- Sheets keep keyboard focus inside and hand it back when they close, and a hold on a log tile opens it when you let go.
- Web audio plays the newest clip, and the same clip twice in a row.
- Status colors are readable in every built-in theme, and theme switches no longer flash unstyled.
- The theme editor judges see-through colors correctly and its stylesheet checks can no longer be switched off.
- Bigger text in toasts, tooltips, the heatmap, the weather forecast and badges, and the remaining English strings are translated.
- Toggle buttons report pressed, the log is announced as a log, and timeline bands and floor plan lights work from the keyboard.
- Generating dashboards is all or nothing, and a failed item read can be retried.

## 1.37.0

- Tiles on `autoupdate=false` items show what the device reports back, not what you sent, without a
  reload.
- A notice says when such a device reports the opposite of the command it was sent.
- Sliders and color controls on those items no longer hide changes made elsewhere.

## 1.36.0

- A dashboard no longer flickers between two sizes when its height lands close to the window's. The
  page scrollbar was changing the width the cells are sized from, which changed the height again.
- Deleting a widget while the tablet layout is on screen now takes it off that layout only, and says
  so. It used to delete it from the desktop layout as well.
- Adding a widget on the tablet layout no longer drops it on top of an existing one on the desktop
  layout.
- The icon picker searches every icon set at once. Pick a tab to narrow it to one.
- The widths where the stacked and tablet layouts take over are now settings, under Settings ›
  Appearance.
- The full-screen log opens on the newest line again. It could open part way up, and stay there
  until another line arrived, when a row turned out taller than the list had guessed.
- A toggle bound to an item with `autoupdate=false` works again. openHAB posts no state for those,
  so the tile sat on the last state the device reported and sent the same command every press. It
  now shows what you asked for, ringed to say nothing has confirmed it, and a real state still wins.

## 1.35.0

- A jar you install by hand now appears in openHAB's add-on store, so you can see it and remove it
  from there. Its `addon.xml` had been sitting in a folder openHAB does not read.
- The build now runs openHAB's own code style and static analysis, and CI publishes the report.

## 1.34.0

- Sliders, colour pickers and dials now command the device as you drag, up to five times a second,
  so you see the level before letting go. On by default; turn it off under Settings › Controls, or
  per widget with "Send while dragging". Thermostat setpoints still send on release only.
- A control holds the value you sent for 4 seconds instead of 8 before showing a change made
  elsewhere.
- A widget stored outside its dashboard's columns is drawn back inside them. A restored backup or a
  hand-edited dashboard could leave one as an 8px sliver at the right-hand edge.
- A new Button starts with no name, so binding an item fills it from the item's label like every
  other widget does.
- The HABPanel Import button reports a configuration it cannot read instead of doing nothing, and
  reads ones with a missing or empty piece that openHAB stored happily.
- A custom widget called `__proto__` imports instead of vanishing.
- DOMPurify updated to 3.4.15, which closes a published advisory. The flaw was never reachable here.

## 1.33.0

- Value and Stat are one widget now, with a Style setting. Stored stat tiles keep their look and
  everything they had set.
- Six new looks for it: sparkline, split, bar, segment, pill and hero.
- Every value tile can now take a trend arrow, colour stops, a caption, a badge and a second
  reading. Those were stat-only before.
- And every stat tile can take per-state icons, which were value-only.
- The Settings page reads a lot shorter. Every explanation on it was rewritten to say the same thing
  in a line or two.
- The Widget gallery section is gone. Its five widgets are example templates, so they now sit in
  Custom widgets as a "Start from an example" row, which is where a copy of one ends up anyway.
- A widget you have not picked an item for yet says so, instead of drawing a slider at 0 or a dial
  at empty as though the device were off.
- A long item name no longer spills out of a small tile on the "not on this server" message.
- The palette has a search box. It also matches what a widget does, so "graph" finds the chart.
- Dialogs use the height of the screen on a desktop, so fewer widgets sit below the fold.
- The dashboard generator shows both layout choices without scrolling. One of them was hidden under
  the buttons on a laptop, and both were on a phone.
- A stepper shows the value the item actually holds. An item at 3.6 read "4" when the step was 1.
- An upload that fails because the file is the wrong kind no longer tells you to sign in.
- "No matching icons" no longer renders one icon wide.
- The HABPanel report says where a dashboard's web address comes from. It said names became
  addresses, when they come from HABPanel's own dashboard ids.

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
