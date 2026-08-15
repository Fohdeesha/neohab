# Theming neohab

Themes are made in the browser, under **Settings › Appearance**, and stored on your openHAB
server. You never edit a file, and a theme travels with your backups.

This page is for going past the colour pickers.

## Make one

1. **Settings › Appearance › New theme**. You get a copy of the colours you are looking at.
2. Change them. The screen updates as you type. Nothing is stored until **Save theme**.
3. Saving does not switch anyone else over. Tick **Use on all devices** for that, or pick it
   under **Theme on this device** to use it only here.
4. **Export** it with the ⭳ on its card to share it. The file carries everything it needs.

## Tokens

A theme is a set of design tokens, applied as CSS custom properties named `--nh-<token>`.
Widgets and chrome only ever read tokens, so changing one restyles everything that uses it.

Every token is optional. One you leave alone keeps neohab's own value, so a theme can be four
colours or all 27.

### Core

| Token | What it paints |
|---|---|
| `bg` | The page, and the top bar |
| `surface` | A widget tile, a sheet, a Home tile |
| `surface-2` | A step above that: buttons, dropdowns, slider tracks |
| `border` | Every hairline: tile edges, field outlines, separators |
| `text` | The main ink: readings, labels and controls |
| `text-dim` | Widget names, captions, hints and units |
| `primary` | The accent: active controls, gauges, the tile-accent setting |
| `brand` | neohab's own colour: the wordmark, primary buttons, editor handles |
| `radius` | Corner rounding. `0px` gives square corners |
| `shadow` | The drop shadow under a tile. `none` makes the design flat |

### Semantic

| Token | What it paints |
|---|---|
| `good` | A reading that moved the way you want (a stat tile's trend arrow) |
| `bad` | A reading that moved the wrong way |
| `accent-ink` | Text drawn **on** the accent: filled tiles, chips, badges |

Leave `accent-ink` unset and neohab measures your accent and picks white or near-black,
whichever can be read on it. Set it only to override that.

### Chart palette

`chart-1` … `chart-8` colour chart series and timeline states that have no colour of their own.
Unset, you get a built-in palette checked for colour-blind separation. Pin only `chart-1` and the
rest of that palette stays intact.

### Instruments

All off by default, so gauges stay flat unless a theme lights them.

| Token | Effect |
|---|---|
| `rim-hi` / `rim-lo` | Shades a gauge's outer rim, lit at one end |
| `face-hi` / `face-lo` | A glow inside the gauge face |
| `band-light` / `band-shade` | 0 to 1. Bright film at the tip of a solid-arc band, sunk film at its start |

## Readability

The editor reports the contrast ratio for each pair of colours that actually meets on screen.
4.5:1 is the guideline for normal text, 3:1 for large. It is a warning rather than a limit, but
red numbers mean the theme is genuinely hard to read.

A colour written as `color-mix(...)`, or as a `var()` reference, cannot be measured. It is
reported as **not measurable** rather than guessed at.

## A theme's own stylesheet

Tokens cannot change fonts or the **shape** of a widget. For that a theme can carry a stylesheet,
applied with it and removed when you switch away: **Settings › Appearance › edit a theme ›
Custom CSS**. It previews as you type, like everything else.

This is real CSS with no sandbox, stored in your openHAB configuration like the rest of your
setup. Treat a theme file from someone else the way you would treat any other code from them.

The editor checks your stylesheet against the rules below as you write it, and lists anything it
finds under the box. It is advice, not a refusal: the CSS is applied either way.

### If a theme breaks the app

A theme applies to everything, including the Settings screen you would use to undo it, and it is
cached locally, so reloading reapplies it. Add **`?theme=none`** to the address to load with the
default theme instead:

```
http://your-server:8080/neohab/index.html?theme=none
```

It works before or inside the `#`, ignores the shared theme, this device's override and the cache,
and is **not** saved. It lasts for that page load only. From there, edit or delete the offending
theme normally. A built-in's id works too (`?theme=light`) if you want to look at one without
adopting it.

### Class names

| Class | What it is |
|---|---|
| `.nh-widget` | One widget's card. `.nh-widget--bare` asked for no card (label, clock) |
| `.nh-widget__label` | The name row. `.nh-widget__labelmain` is the icon+name group inside it |
| `.nh-widget__body` | Everything below the name row |
| `.nh-tile` | A Home-screen dashboard tile. `.nh-tile--new` is the "+ New dashboard" one |
| `.nh-dash__bar` | The top bar |
| `.nh-side` | The dashboard sidebar |
| `.nh-button`, `.nh-selection__btn`, `.nh-roller__btn`, `.nh-player__btn` | Controls, each with an `--active` modifier |
| `.nh-switch__track`, `.nh-switch__thumb` | The switch. `.nh-switch--on` marks the on state |
| `.nh-value__text`, `.nh-value__unit` | A reading and its unit, set separately |
| `.nh-stat__value`, `.nh-stat__caption`, `.nh-stat__badge` | The stat tile |
| `.nh-clock__time`, `.nh-clock__date` | The clock |
| `.nh-chart__chip`, `.nh-chart__legend` | Chart chrome |
| `.nh-gauge__*`, `.nh-dial__*` | Gauge and dial internals |
| `.nh-compass__*` | The compass face |
| `.nh-group` | The frame around a panel group |
| `.nh-acc-filled`, `.nh-acc-tinted`, `.nh-acc-outlined` | On the **cell**, from the per-widget Tile accent setting |

Two variables are set per cell rather than globally, and a theme can read both:

- `--nh-cellaccent` is that tile's own Accent colour, if it has one.
- `--nh-labelalign` is the tile's Name alignment. A theme may set a **default** on
  `.nh-gcell, .nh-cell`; a widget that made its own choice still wins, because that arrives as an
  inline style.

### Six rules that are not obvious

Your stylesheet loads **after** neohab's, so a rule of equal specificity beats the base one. That
is what makes theming work, and it is why these six exist. The editor checks all of them, and so
does the test suite for every built-in theme.

**1. Gate your padding.** neohab sheds padding in short and narrow cells so text stays readable.
An ungated `.nh-widget__body { padding: … }` wins over those sheds and puts the clipping back.
Gate yours on the complementary range:

```css
@container (min-height: 105px) and (min-width: 121px) {
  .nh-widget__body { padding: 8px 10px 10px; }
}
```

**2. Style both halves of a control state.** `.nh-button` and `.nh-button--active` have the same
specificity, so styling the base flattens the active state. Style both.

**3. Never set `fill` or `stroke` on these.** Their paint is an **attribute** the widget computes,
such as a per-instance gradient, a severity colour or a live tint, and a stylesheet declaration
beats an attribute:

```
.nh-gauge__rim    .nh-gauge__band     .nh-gauge__bandlight  .nh-gauge__bandshade
.nh-gauge__ledlit .nh-gauge__blklit   .nh-gauge__claybody   .nh-gauge__tklit
.nh-compass__cardinal                 .nh-compass__value
```

Width, opacity, font and filter are all fine. Just not the colour.

**4. `border-image` needs `radius: 0`.** A border gradient squares off rounded corners, so the two
cannot be combined. Set the `radius` token to `0px` if you want a gradient bezel.

**5. Put back the two tiles a blanket rule breaks.** If you style `.nh-widget, .nh-tile` as a
group, restore these:

```css
.nh-widget--bare { /* label and clock widgets asked for no card */ }
.nh-tile--new    { /* keep this a dashed invitation, not a real dashboard */ }
```

If panelling the bare widgets is deliberate, put `nh-theme-allow: bare-panelled` in a comment and
the check stands down.

**6. Only reference bundled assets.** A `url()` must point at `fonts/`, `backgrounds/` or
`icons/`, or be a `data:` URI. Anything else will not load on a server with no route to the
internet, which is most of them.

### Worked example

A flat theme with square corners and an outlined button:

```css
/* Several controls carry a hardcoded radius, so the token alone will not square them. */
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

### Which built-in to copy

The editor offers to copy the stylesheet of the theme you are looking at. Know what you get:

- **Swiss Sheet** is built entirely from tokens through `color-mix()`, which is how one stylesheet
  serves both its dark and light variants. This is the one to copy.
- **Ember**, **LCD Console**, **Operations** and **Assembly** contain colours written directly
  into them, plus bundled fonts and, for Assembly, a background image. They will **not** follow
  the tokens you change. Copy them to study, not to recolour.

## Coming from HABPanel

All seven of HABPanel's themes have a port here: Default (as **Aqua**), Material, Material dark,
Pale blue, Translucent, Madras and Orange Tree. An import picks the matching one automatically.
They are ports, not clones: where a colour fell below a readable contrast ratio it was moved the
smallest distance that fixes it.

HABPanel's `additional_stylesheet_url` is **not** imported. Its selectors are HABPanel's, which
neohab does not have. Paste what you want to keep into a theme's Custom CSS and translate the
selectors using the table above.

## Where this lives in the source

| File | What it is |
|---|---|
| `web/src/themes/tokens.ts` | The token contract. Adding one here puts it in the editor and in this page's tables |
| `web/src/themes/themes.ts` | Applying a theme, the built-ins, the local cache |
| `web/src/themes/cssRules.ts` | The six rules, checked in the editor and in the tests |
| `web/src/themes/contrast.ts` | Contrast maths and the automatic ink choice |
| `web/src/themes/css/shared.ts` | The recurring idioms above, as reusable pieces |
| `web/src/themes/css/*.ts` | One stylesheet per built-in, loaded only when used |
