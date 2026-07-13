# neohab

A modern dashboard UI for [openHAB](https://www.openhab.org/) — the spiritual successor to HABPanel.

neohab installs as a standard openHAB UI add-on and lets you build touch-friendly dashboards for
phones, tablets and desktops, configured entirely in the browser. No file editing, ever.

> **Status: alpha.** The core works end to end — dashboards, live controls, inline editing,
> theming, backup/restore, HABPanel import and custom widgets — but it is not yet packaged
> for the marketplace and things still move fast. Feedback welcome.

## Goals

- **Mobile-first** — dashboards are always viewable and dynamically sized, from phone to
  wall-mounted tablet to desktop. Phones get a single-column stack whose order you can
  drag-to-reorder independently of the grid layout.
- **Everything in the UI** — dashboards, widgets, themes and settings are all managed in the
  browser and stored on your openHAB server. Zero config files.
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

Widget icons come from two sources: your openHAB server's icon sets (state-aware — a light
icon follows its item's state) and the bundled
[Material Design Icons](https://pictogrammers.com/library/mdi/) library
(© Pictogrammers, [Apache License 2.0](https://github.com/Templarian/MaterialDesign/blob/master/LICENSE)),
so everything works fully offline.

## License

[Eclipse Public License 2.0](LICENSE)

neohab is a community project and is not an official openHAB UI.
