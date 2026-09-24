# Getting started with neohab

Five quick steps - from an empty screen to a dashboard on your phone with a backup of it saved.
Nothing here needs a text editor or a restart

## 1. Open it and sign in

Go to **http://your-server:8080/neohab/** (or whatever address you reach openHAB on). It's also
on the openHAB start page, beside Main UI.

On a stock openHAB anyone can look at a dashboard without signing in, but making one needs an
administrator. Press **Sign in**, and openHAB's own sign-in page takes it from there. Your
password is never typed into neohab and never stored by it; what comes back is a token this
browser keeps.

If the screen says the server needs you to sign in before it will show anything, then your openHAB has
its implicit user role turned off.

## 2. Your first dashboard

The welcome screen offers four methods:

- **Create your first dashboard** gives you an empty one to fill.
- **Generate from my items** reads the items you already have, groups them by room or by what they
  are, and builds a dashboard you can then edit. On a house that already has semantic tags it's
  usually the faster start.
-  **Import from HABPanel** does what it says - automatically builds matching dashboards from your HABPanel install.
-  **Restore a backup** allows you to import a neohab backup.

Once you have a dashboard one way or another, click the ✎ button in the top bar. That's edit mode,
and it's where everything else in this page happens

## 3. Put something on it

In edit mode:

1. Press **+** to open the palette and pick a widget, or type in its search box
2. It lands on the grid. Drag it about, drag a corner to resize, etc
3. Tap it to open its settings

The first field is the **openHAB Item**. Start typing part of an item's name and pick it from the list.
For a Button, the two fields under it are **Action** and **Command**, which is everything a light
switch needs. **Name** is what the tile says, and a widget that starts without one takes the item's
label when you bind it.

Anything about how the tile looks is in the **Appearance** group below, and anything that belongs
to the tile rather than the widget (its accent, its text size, which screen sizes show it) is in
**Tile**. On a phone those groups start folded; press one to open it.

**Save** keeps the changes, **Exit** throws them away. Ctrl+Z undoes.

Back on the finished dashboard, press and hold any tile to open a bigger view of that item, with
its history and a control that matches what the widget does.

## 4. Check it on a phone

Open the same address on your phone, or just narrow the browser window. Below 840px (the
default) the grid stops being a grid: tiles stack into one column, in the order they read across
the desktop layout, sized to fit the screen - small devices / displays never cut off your widgets.

That automatic behavior is usually right, but when it's not:

- Drag tiles in edit mode on the narrow screen to set your own order/layout for that screen size. **Dashboard settings ›
  Phone layout › Reset stack order** puts it back to following the regular full size page layout.
- **Hide on**, in a widget's **Tile** group, leaves that widget out on the sizes you choose. A
  wall-panel chart nobody wants on a phone for example.
- Between 840px and 1200px (again the defaults) a tablet gets the desktop layout unless you make
  it a separate one. The **Desktop layout** button in the edit bar switches to **Tablet layout**;
  move things about there and that arrangement is what tablets get
- Both widths are settings: **Stack widgets below** and **Use the tablet layout below**, in
  **Settings › Appearance**. They are measured across the dashboard area, so an open sidebar
  counts against them.

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
- **Settings › Controls** is where you turn off live dragging. By default a slider, colour picker
  or dial commands the device as you drag it, a few times a second; turn it off if your devices,
  rules or persistence would rather get one command when you let go. Any widget can also decide
  for itself under "Send while dragging" in its settings.
- **Settings › Migrate from HABPanel** brings HABPanel dashboards across and reports anything it
  could not map exactly.
- **Settings › Kiosk & wall panel** is for a screen on a wall: no chrome, no menu, and the screen
  kept awake.
- **Settings › Custom widgets** is where you write your own tile out of HTML when no built-in one
  fits. Five examples ship with it, and starting from one is usually quicker than a blank page.
