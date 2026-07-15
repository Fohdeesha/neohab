# neohab

A modern dashboard UI for [openHAB](https://www.openhab.org/) — the spiritual successor to HABPanel.

neohab installs as a standard openHAB UI add-on and lets you build touch-friendly dashboards for
phones, tablets and desktops, configured entirely in the browser. No file editing, ever.

> **Status: alpha.** The core works end to end — dashboards, live controls, inline editing,
> theming, backup/restore, HABPanel import and custom widgets — but it is not yet packaged
> for the marketplace and things still move fast. Feedback welcome.

## Goals

- **Mobile-first** — dashboards are always viewable and dynamically sized, from phone to
  wall-mounted tablet to desktop. Phones and portrait tablets get a single-column stack whose
  order you can drag-to-reorder independently of the grid layout. On the grid a dashboard scales
  as one proportional unit: icons *and* text track the cell size (text down to a readable floor),
  and widget chrome slims itself down in tight cells, so labels stay readable instead of
  clipping. Stacked rows are full-width, so there they size their text to the room the row has
  rather than shrinking it to match a desktop.
- **Everything in the UI** — dashboards, widgets, themes and settings are all managed in the
  browser and stored on your openHAB server. Zero config files.
- **Inline editing** — arrange dashboards on the live grid itself: drag widgets to move or
  resize, delete them from a button on the widget, undo/redo anything, and save when you are
  ready. Dropping onto an occupied spot rejects by default; hold there for a moment and the
  widgets in the way step aside — swapping with a same-size neighbour, or shuffling down.
- **Import / export** — back up, restore and share complete dashboard configurations (or single
  dashboards and widgets) as JSON; restore by replacing everything or merging a backup into
  what you have.
- **Custom widgets** — build your own widgets from HTML templates with live item bindings, plus
  an optional sandboxed JavaScript widget API for power users.
- **First-class theming** — theme editor with live preview, light/dark switching, shareable
  theme files, and a custom CSS escape hatch.
- **HABPanel migration** — import your existing HABPanel panels (from a `habpanel-config.json`
  export or directly from your server) with best-effort widget mapping and a detailed report.

## Compatibility

Targets openHAB **4.x and 5.x**. Distributed as an add-on jar installable through the openHAB
community marketplace (planned) or manually via the addons folder.

## Tech

React + TypeScript + Vite frontend served by a thin OSGi add-on shell, talking to openHAB
exclusively through its public REST and SSE APIs.

## Icons

Nearly 10,000 icons are bundled in the add-on, so everything works fully offline — plus your
openHAB server's own icon sets and your own uploads:

- **Color** — [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (flat style, curated
  for dashboards; © Microsoft, MIT) and
  [icons8 flat-color-icons](https://github.com/icons8/flat-color-icons) (MIT)
- **Mono** — [Material Design Icons](https://pictogrammers.com/library/mdi/)
  (© Pictogrammers, [Apache License 2.0](https://github.com/Templarian/MaterialDesign/blob/master/LICENSE)),
  tinted by your theme or any color you pick per widget
- **Weather** — [Meteocons](https://github.com/basmilius/meteocons) animated weather icons
  (© Bas Milius, MIT)
- **openHAB** — the server's classic icon set (state-aware where the set provides variants)
- **Custom** — upload your own PNG, JPG, GIF, WebP, BMP or SVG straight from the icon picker;
  transparency and GIF animation survive, and uploads are stored in your openHAB config so
  backups and exports include them

Stateful widgets (switches, toggle buttons) can show a different icon — and a different mono
tint — for their active state. Icon sizes are authored against a desktop-width dashboard and
scale automatically with the actual cell size, so the same config looks right on any screen.

## License

[Eclipse Public License 2.0](LICENSE)

neohab is a community project and is not an official openHAB UI.
