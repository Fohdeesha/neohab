# Getting started with neohab

Five short steps, from an empty screen to a dashboard on your phone with a backup of it saved.
Nothing here needs a text editor or a restart.

## 1. Open it and sign in

Go to **http://your-server:8080/neohab/** (or whatever address you reach openHAB on). It is also
on the openHAB start page, beside Main UI.

On a stock openHAB anyone can look at a dashboard without signing in, but making one needs an
administrator. Press **Sign in**, and openHAB's own sign-in page takes it from there. Your
password is never typed into neohab and never stored by it; what comes back is a token this
browser keeps.

If the screen says the server needs you to sign in before it will show anything, that openHAB has
its implicit user role turned off. Signing in is the whole answer.

## 2. Your first dashboard

The welcome screen offers two ways in.

- **Create your first dashboard** gives you an empty one to fill.
- **Generate from my items** reads the items you already have, groups them by room or by what they
  are, and builds a dashboard you can then edit. On a house that already has semantic tags it is
  usually the faster start.

Either way you end up on a dashboard with the ✎ button in the top bar. That button is edit mode,
and it is where everything else in this page happens.

## 3. Put something on it

In edit mode:

1. Press **+** to open the palette and pick a widget. A Button is the one to start with.
2. It lands on the grid. Drag it about, drag a corner to resize.
3. Tap it to open its settings.

The first field is **openHAB Item**. Start typing part of an item's name and pick it from the list.
For a Button, the two fields under it are **Action** and **Command**, which is everything a light
switch needs. The name fills itself in from the item's label, and you can overwrite it.

Anything about how the tile looks is in the **Appearance** group below, and anything that belongs
to the tile rather than the widget (its accent, its text size, which screen sizes show it) is in
**Tile**. On a phone those groups start folded; press one to open it.

**Save** keeps the changes, **Exit** throws them away. Ctrl+Z undoes.

Back on the finished dashboard, press and hold any tile to open a bigger view of that item, with
its history and a control that matches what the widget does.

## 4. Check it on a phone

Open the same address on your phone, or just narrow the browser window. Below 840px the grid
stops being a grid: tiles stack into one column, in the order they read across the desktop
layout, sized to fit the screen.

That is usually right, and when it is not:

- Drag tiles in edit mode on the narrow screen to set your own order. **Dashboard settings ›
  Phone layout › Reset stack order** puts it back to following the grid.
- **Hide on**, in a widget's **Tile** group, leaves that widget out on the sizes you choose. A
  wall-panel chart nobody wants on a phone belongs here.
- Between 840px and 1200px a tablet gets the desktop layout unless you make it a separate one.
  The **Desktop layout** button in the edit bar switches to **Tablet layout**; move things about
  there and that arrangement is what tablets get.

If you want neohab as an app icon rather than a browser tab, your server has to be on HTTPS.
That is a browser rule, not ours, and the README says what else changes when you switch.

## 5. Back it up

**Settings › Backup › Export configuration** writes one JSON file holding every dashboard, theme
and setting. Keep it somewhere that is not the openHAB box.

Importing the same file offers to merge it into what you have or to replace everything. A file
holding a single dashboard, widget or theme is always brought in as a copy, so nothing of yours
is overwritten by accident.

You do not need the backup to undo a mistake. **Settings › Version history** keeps the last
twenty-five restore points, shows what changed between any two of them field by field, and rolls
the whole configuration back.

## Where to go next

- **Settings › Appearance** switches theme, and [Theming neohab](theming.md) covers writing your
  own.
- **Settings › Migrate from HABPanel** brings HABPanel dashboards across and reports anything it
  could not map exactly.
- **Settings › Kiosk & wall panel** is for a screen on a wall: no chrome, no menu, and the screen
  kept awake.
- **Settings › Custom widgets** is where you write your own tile out of HTML when no built-in one
  fits.
