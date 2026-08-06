# Theming neohab

Everything in neohab is themed from one place: a set of **design tokens** applied as CSS custom
properties. Widgets and chrome only ever read tokens, so changing one restyles everything that
uses it — no per-widget colour settings to hunt down.

You never need to edit a file. Themes are made in **Settings → Appearance → New theme**, stored on
your openHAB server, and travel with your backups. This document is for when you want to go past
the colour pickers.

---

## The quick version

1. Settings → Appearance → **New theme**. You get a copy of the current theme's colours.
2. Change colours. The screen updates as you type; nothing is saved until you press **Save theme**.
3. Saving does **not** switch everyone over. Tick *Use on all devices* if you want that, or pick
   the theme under *Theme on this device* to use it just here.
4. **Export** it (⭳ on the theme card) to share it — the file carries everything it needs.

---

## Tokens

Every token is optional. One you leave alone keeps neohab's own value, so a theme can be four
colours or all twenty-six.

### Core

The palette every theme has.

| Token | What it paints |
|---|---|
| `bg` | The page itself, and the top bar |
| `surface` | The face of a widget tile, a sheet, a Home tile |
| `surface-2` | A step above the surface: buttons, dropdowns, slider tracks |
| `border` | Every hairline: tile edges, field outlines, separators |
| `text` | Readings, labels and controls — the main ink |
| `text-dim` | Widget names, captions, hints and units |
| `primary` | The accent: active controls, gauges, the tile-accent setting |
| `brand` | neohab's own colour: the wordmark, primary buttons, editor handles |
| `radius` | Corner rounding. `0px` gives square corners |
| `shadow` | The drop shadow under a tile. `none` makes the design flat |

### Semantic

| Token | What it paints |
|---|---|
| `good` | A reading that moved the way you want (the stat tile's trend arrow) |
| `bad` | A reading that moved the wrong way |
| `accent-ink` | Text drawn **on** the accent — filled tiles, chips, badges |

`accent-ink` is chosen for you: neohab measures your accent and picks white or near-black,
whichever can actually be read on it. Set it only if you want to override that.

### Chart palette

`chart-1` … `chart-8` colour the chart series and timeline states that have no colour of their
own. Leave them unset and you get a built-in palette that has been checked for colour-blind
separation; pin only `chart-1` and the rest of that palette stays intact.

### Instruments

For gauges, and all off by default so gauges stay flat unless a theme lights them.

| Token | Effect |
|---|---|
| `rim-hi` / `rim-lo` | Shades the outer rim of a gauge, lit at one end |
| `face-hi` / `face-lo` | A glow inside the gauge face |
| `band-light` / `band-shade` | 0–1. Bright film at the tip of a solid-arc band, sunk film at its start |

---

## Readability

The editor shows the contrast ratio for each pair of colours that actually meets on screen, and
which WCAG bar it clears. 4.5:1 is the guideline for normal text and 3:1 for large text. It is a
warning, not a limit — but if the numbers go red, the theme is genuinely hard to read.

A colour written as `color-mix(...)` or a `var()` reference cannot be measured, and is reported as
*not measurable* rather than guessed at.

---

## Going further: a theme's own stylesheet

Tokens cannot change fonts or the *shape* of a widget. For that, a theme can carry a stylesheet,
applied with it and removed when you switch away. Settings → Appearance → edit a theme → **Custom
CSS**.

This is real CSS with no sandbox, and it is stored in your openHAB configuration like the rest of
your setup. Treat a theme file from someone else the way you would treat any other code from them.

### The class names

Stable, and the ones worth knowing:

| Class | What it is |
|---|---|
| `.nh-widget` | One widget's card. `.nh-widget--bare` is one that asked for no card (label, clock) |
| `.nh-widget__label` | The widget's name row. `.nh-widget__labelmain` is the icon+name group inside it |
| `.nh-widget__body` | Everything below the name row |
| `.nh-tile` | A Home-screen dashboard tile. `.nh-tile--new` is the "+ New dashboard" one |
| `.nh-dash__bar` | The top bar |
| `.nh-side` | The dashboard sidebar |
| `.nh-button`, `.nh-selection__btn`, `.nh-roller__btn`, `.nh-player__btn` | Controls. Each has an `--active` modifier |
| `.nh-switch__track`, `.nh-switch__thumb` | The switch. `.nh-switch--on` marks the on state |
| `.nh-value__text`, `.nh-value__unit` | A reading and its unit, set separately |
| `.nh-stat__value`, `.nh-stat__caption`, `.nh-stat__badge` | The stat tile |
| `.nh-clock__time`, `.nh-clock__date` | The clock |
| `.nh-chart__chip`, `.nh-chart__legend` | Chart chrome |
| `.nh-gauge__*`, `.nh-dial__*` | Gauge and dial internals |
| `.nh-compass__*` | The compass face |
| `.nh-group` | The frame drawn around a panel group |
| `.nh-acc-filled`, `.nh-acc-tinted`, `.nh-acc-outlined` | On the **cell**, from the per-widget Tile accent setting |

Two variables are set per cell rather than globally, and a theme can read both:

- `--nh-cellaccent` — that tile's own Accent colour, if it has one.
- `--nh-labelalign` — the tile's Name alignment. A theme may set a **default** for it on
  `.nh-gcell, .nh-cell`; a widget that made its own choice still wins, because that arrives as an
  inline style.

### Five rules that are not obvious

These are the ones that have actually gone wrong. The test suite checks all of them for every
built-in theme, and it is worth knowing why.

**1. Your stylesheet loads after neohab's.** So a rule of equal specificity beats the base one.
That is what makes theming work at all — but it also means a careless selector overrides more than
you meant.

**2. Gate your padding.** neohab sheds padding in short and narrow cells so text stays readable:

```css
@container (max-height: 104px) { … }   /* base app: shed padding */
@container (max-width: 120px)  { … }
```

An ungated `.nh-widget__body { padding: … }` in your theme wins over those and reintroduces the
clipping they prevent. Gate yours on the complementary range:

```css
@container (min-height: 105px) and (min-width: 121px) {
  .nh-widget__body { padding: 8px 10px 10px; }
}
```

**3. Re-declare the `--active` modifiers.** `.nh-button` and `.nh-button--active` have the same
specificity, so if your sheet styles the base class it flattens the active state too. Style both.

**4. Never set `fill` or `stroke` on these.** Their paint is an *attribute* the widget computes —
a per-instance gradient, a severity colour, a live tint — and a stylesheet declaration beats an
attribute:

```
.nh-gauge__rim   .nh-gauge__band       .nh-gauge__bandlight  .nh-gauge__bandshade
.nh-gauge__ledlit .nh-gauge__blklit    .nh-gauge__claybody   .nh-gauge__tklit
.nh-compass__cardinal                  .nh-compass__value
```

Width, opacity, font and filter are all fine — just not the colour.

**5. `border-image` needs `radius: 0`.** A border gradient squares off rounded corners, so the two
cannot be combined. If you want a gradient bezel, set the `radius` token to `0px`.

### Two tiles that a blanket rule always breaks

If you style `.nh-widget, .nh-tile` as a group, put these back:

```css
.nh-widget--bare { /* undo your treatment: label and clock widgets asked for no card */ }
.nh-tile--new    { /* …and keep this one a dashed invitation, not a real dashboard */ }
```

---

## Worked example

A flat theme with square corners and a bright accent:

```css
/* Controls carry a hardcoded radius of their own, so the token alone will not square them. */
.nh-button,
.nh-iconbtn,
.nh-selection__btn,
.nh-switch__track,
.nh-switch__thumb {
  border-radius: 0;
}
/* The two range-track pseudo-elements must stay in separate rules: grouped, the whole rule is
   invalid in whichever engine does not know the other's prefix. */
.nh-color__track::-webkit-slider-runnable-track { border-radius: 0; }
.nh-color__track::-moz-range-track { border-radius: 0; }

/* Tighter insets, gated so the small-cell sheds still win where they are needed. */
@container (min-height: 105px) and (min-width: 121px) {
  .nh-widget__body { padding: 8px 10px 10px; }
}

/* Both halves of the control state. */
.nh-button { background: transparent; border: 1px solid var(--nh-border); }
.nh-button--active { background: var(--nh-primary); color: var(--nh-accent-ink); }
```

## Which built-in to copy

The editor offers to copy the active theme's stylesheet as a starting point. Be aware what you
get:

- **Swiss Sheet** is built entirely from tokens through `color-mix()` — one stylesheet serves both
  its dark and light variants. This is the one to copy.
- **Ember**, **LCD Console**, **Operations** and **Assembly** contain colours written directly into
  them, plus bundled fonts and (for Assembly) a bundled background image. They will *not* follow
  the tokens you change. Copy them to study, not to recolour.

## Where this lives in the source

| File | What it is |
|---|---|
| `web/src/themes/tokens.ts` | The token list. Adding one here makes it appear in the editor and in this table |
| `web/src/themes/themes.ts` | Applying a theme, the built-ins, the local cache |
| `web/src/themes/contrast.ts` | Contrast maths and the automatic ink choice |
| `web/src/themes/css/shared.ts` | The recurring idioms above, as reusable pieces |
| `web/src/themes/css/*.ts` | One stylesheet per built-in theme, loaded only when used |
| `web/src/themes/themes.test.ts` | The cross-theme checks that enforce the five rules |
