# Contributing to neohab

Thanks for looking. This is a short guide to getting the project running and knowing what is
expected of a change.

## What it is

neohab is an openHAB UI add-on: a Java shell about seventy lines long that registers a tile and
serves static files, wrapped around a React + TypeScript app. Nearly all the work is in `web/`.

```
pom.xml, bnd.bnd, src/main/…   the openHAB add-on shell (Java, rarely changes)
web/                           the app
  src/api/                     openHAB REST, auth, the live-state stream
  src/model/                   pure data model and layout maths (no React)
  src/store/                   application state (zustand)
  src/components/              shared UI, the grids
  src/widgets/                 one folder per widget
  src/editor/                  edit-mode panels and forms
  src/settings/                one file per section of the Settings screen
  src/themes/                  the theming contract and the built-in themes
docs/                          documentation
e2e/                           browser end-to-end suites, run against a real openHAB
```

## Getting it running

You need Node 20.19+ or 22.12+, which is what Vite 7 requires. The Maven build downloads its own
Node 24 regardless. For the add-on jar you also need a JDK 21.

```bash
cd web
npm install
cp .env.example .env.local     # point OPENHAB_URL at a real openHAB
npm run dev
```

The dev server proxies `/rest`, `/auth`, `/icon` and `/static` to that server, so the frontend runs
against your real items with no Java build at all. Reading works anonymously. Editing needs an
administrator sign-in in the app.

To build the installable add-on:

```bash
./mvnw -B -ntp clean install      # -> target/org.openhab.ui.neohab-<version>.jar
```

The Maven build downloads its own pinned Node into `.tools/` and runs the frontend build itself,
so it needs nothing installed beyond a JDK.

## Before you open a pull request

```bash
cd web
npm run check      # typecheck + lint + unit tests
```

That is what CI runs. All three must pass.

- **`npm run typecheck`** runs TypeScript in strict mode with no unused locals.
- **`npm run lint`** runs ESLint. Watch `react-hooks/exhaustive-deps` in particular: if you
  suppress it, say why in a comment on the line above.
- **`npm test`** runs the unit suite (vitest). Use `npm run test:watch` while you work.

## Tests

**Unit tests** live beside the module they cover, as `*.test.ts`, and run in Node with no DOM.
Everything that can be pure is: the layout maths, the gauge model, chart aggregation, the partial
export planner, the configuration diff, the template evaluator, the theming contract. If you are
adding logic, put it in a pure module and test it there. It is faster to write and far faster to
run than driving a browser.

**End-to-end suites** live in `e2e/` and drive a real browser against a real openHAB server. CI
does not run them, because they need a server. See [`e2e/README.md`](e2e/README.md) for how to
point them at yours. They are the right tool for anything that only exists in a browser: layout,
gestures, live updates, theming as rendered.

A note on both: a check that has never failed proves nothing. When you fix a bug, make sure the
test you add fails against the code before your fix.

## Adding a widget

One folder under `src/widgets/`, exporting a single `WidgetDefinition`:

```ts
export const myWidget: WidgetDefinition<MyConfig> = {
  type: 'mywidget',            // stored in configuration - stable, do not rename
  name: 'My widget',
  description: 'Shown in the palette',
  defaultSize: { w: 3, h: 2 },
  defaultConfig: () => ({ item: '' }),
  settings: [                  // the editor form builds itself from this
    { key: 'item', type: 'item', label: 'openHAB Item' },
  ],
  itemKeys: (c) => [c.item],   // which items to track live
  Component: MyWidget,
}
```

Register it in `src/widgets/index.ts`. That is the whole contract. The grid, the editor, the
settings panel, copy and paste, exports and the per-widget universal settings all come for free.

Three things to know:

- **Stored configuration is untrusted.** A backup, a shared export or a hand edit is written
  verbatim, so guard every value you do arithmetic on at the point you read it, not at the point
  it was entered. Use `Array.isArray` before `.map`, not `?? []`. The second one still throws on
  an object, and this runs during render.
- **A widget that throws is contained** (see `components/WidgetBoundary.tsx`), so a bad
  configuration costs one tile rather than the whole app. That is a safety net, not permission to
  skip the guard above. A tile reading "could not be shown" is still a broken widget.
- **Widget strings go through `t()`.** Empty states and messages included. An untranslated string
  is the only English left on screen in another language.

## Theming

See [`docs/theming.md`](docs/theming.md). If you are adding a theme, the cross-theme tests in
`web/src/themes/themes.test.ts` will tell you if you have hit one of the traps.

## Style

Match the file you are editing. Beyond that:

- Comments explain **why**, not what. The codebase is full of them because most of the non-obvious
  code here is non-obvious for a reason worth writing down.
- Write like a person, not like a generator. Plain words, varied sentence length, no em dashes
  (a plain `-` is fine), no filler adjectives. That applies to docs, comments, commit messages and
  UI strings alike.
- Smallest change that does the job. No speculative abstraction.
- Prefer a boring dependency, or none.
