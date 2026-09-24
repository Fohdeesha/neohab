# Theming neohab

Themes are made in the browser, under **Settings › Appearance**, and stored on your openHAB
server. You never edit a file, and a theme travels with your backups.

This page is for going past the colour pickers.

## Make one

1. **Settings › Appearance › New theme**. You get the colours of whatever theme is on screen. Not
   its stylesheet: a structural theme's CSS has colours written into it that would fight the tokens
   you are about to change.
2. Change them. The screen updates as you type. Nothing is stored until **Save theme**.
3. **Dark scheme** tells the browser which way round the page is, so scrollbars and native form
   controls come out matching your background.
4. Saving does not switch anyone else over. Tick **Use on all devices** for that, or pick it under
   **Theme on this device** to use it only here.
5. **Export** with the ⭳ on its card to hand the file to someone.
   **Settings › Backup › Import configuration** is how one comes back, always as a copy, so a
   shared theme cannot land on top of yours.

Built-ins have no ⭳ and no ✎. To change one, make a new theme from it.

## If a theme breaks the app

A theme applies to everything, including the Settings screen you would use to undo it, and it is
cached locally, so reloading reapplies it. Add **`?theme=none`** to the address:

```
http://your-server:8080/neohab/index.html?theme=none
```

That gives you neohab Dark for one page load. It works before or inside the `#`, ignores the shared
theme, this device's override and the cache, and saves nothing. From there, edit or delete the
offending theme normally. A built-in's id works too (`?theme=light`) if you want to look at one
without adopting it, and anything neohab does not recognise falls back to neohab Dark.

## Tokens

A theme is a set of design tokens, applied as CSS custom properties named `--nh-<token>`. Widgets
and chrome only ever read tokens, so changing one restyles everything that uses it.

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
| `good` | Something going right: a value tile's trend badge, a healthy battery, a live indicator |
| `bad` | Something wrong: an error line in the log, a flat battery, a save that failed |
| `accent-ink` | Text drawn **on** the accent: filled tiles, chips, badges |

Leave `accent-ink` unset and neohab measures your accent and picks white or near-black, whichever
can be read on it. Set it only to override that. The ink on `brand` gets the same treatment and has
no token of its own.

### Chart palette

`chart-1` … `chart-8` colour chart series and timeline states that have no colour of their own.
Unset, you get a built-in palette checked for colour-blind separation. Pin only `chart-1` and the
rest of that palette stays intact.

### Instruments

`face-hi`, `face-lo`, `band-light` and `band-shade` do nothing until a theme sets them, so gauge
faces stay flat. `rim-hi` and `rim-lo` fall back to `border`: the rim is there, just unshaded.

| Token | Effect |
|---|---|
| `rim-hi` / `rim-lo` | Shades a gauge's outer rim, lit at one end |
| `face-hi` / `face-lo` | A glow inside the gauge face |
| `band-light` / `band-shade` | 0 to 1. Bright film at the tip of a solid-arc band, sunk film at its start |

## Readability

The editor scores each pair of colours that actually meets on screen. 4.5:1 is the guideline for
normal text, 3:1 for large. It is a warning rather than a limit, but red numbers mean the theme is
genuinely hard to read.

Only a hex or an `rgb()` value can be measured. A `color-mix()`, an `hsl()`, a `var()` reference or
a named colour is reported as **not measurable** rather than guessed at.

## A theme's own stylesheet

Tokens cannot change fonts or the **shape** of a widget. For that a theme can carry a stylesheet,
applied with it and removed when you switch away: **Settings › Appearance › edit a theme ›
Custom CSS**. It previews as you type, like everything else.

This is real CSS with no sandbox, stored in your openHAB configuration like the rest of your
setup. Treat a theme file from someone else the way you would treat any other code from them.

The editor checks your stylesheet against the rules below as you write it, and lists anything it
finds under the box. It is advice, not a refusal: the CSS is applied either way.

One place your selectors cannot reach is inside a template widget, which renders in a shadow root.
The `--nh-*` tokens do inherit through it, and a template can read the values too: `theme.primary`,
and `theme['text-dim']` for the keys with a hyphen in them. So style those widgets from the
template's own side.

### Class names

The frame every widget draws:

| Class | What it is |
|---|---|
| `.nh-widget` | One widget's card |
| `.nh-widget--bare` | It asked for no card (a label, a clock set to show none) |
| `.nh-widget--headed` | It drew a name row, which costs about 1.05em plus 8px. A height threshold needs a value for each case |
| `.nh-widget__label` | The name row. `__labelmain` is the icon and name together, `__labeltext` the name alone, `__aside` whatever is parked on the right |
| `.nh-widget__body` | Everything below the name row |
| `.nh-labelbottom` | On the cell: this widget's name row sits under the body |

Chrome:

| Class | What it is |
|---|---|
| `.nh-tile` | A Home-screen dashboard tile. `.nh-tile--new` is the "+ New dashboard" one |
| `.nh-dash__bar` | The top bar |
| `.nh-side` | The dashboard sidebar |
| `.nh-sheet`, `.nh-detail` | A settings sheet, and the panel a long press opens on a tile |
| `.nh-group` | The frame around a panel group |
| `.nh-iconbtn`, `.nh-chip` | The round icon buttons in a bar, and the pills (chart ranges, log filters, floor-plan presets). `.nh-chip--on` is the picked one |
| `.nh-acc-filled`, `.nh-acc-tinted`, `.nh-acc-outlined` | On the **cell**, from the per-widget Tile accent setting |

Controls:

| Class | What it is |
|---|---|
| `.nh-button--plain` | The button's plain finish, and the one to restyle: the seven others (solid, glass, glow, edge, outline, sheen, bare) fill the tile and keep their own look in every theme on purpose. `.nh-button` carries only layout, `--card` is the card style, `--active` the on state |
| `.nh-switch__track`, `.nh-switch__thumb` | The sliding toggle, which is the button in its switch style. `.nh-switch--on` marks the on state, `.nh-switch__state` is the ON/OFF caption |
| `.nh-slider`, `.nh-slider__input`, `.nh-slider__value` | The plain range control, and the one to restyle: the slider widget's plain style, and what a long press or a floor-plan light puts in front of you |
| `.nh-fader__*` | The slider's four other styles (gradient, wedge, inset rail, bubble), which keep their own look. `__read` is the reading, `__bound` the ends of an inset scale, `__track` and `__fill` the two painted layers |
| `.nh-step--plain .nh-step__box`, `.nh-step__ctl`, `.nh-step__split` | The stepper's plain finish, and the one to restyle; its four others (glass, glow, solid, sheen) keep their own look. Square it with `--st-radius` on `.nh-step`, since the `radius` token does not reach inside |
| `.nh-selection__btn`, `.nh-roller__btn`, `.nh-player__btn` | Selection, rollershutter and player buttons, each with an `--active` modifier |
| `.nh-color__swatch`, `.nh-color__track`, `.nh-color__pbtn` | The colour picker: the swatch, its three channel sliders, and the on/off pair drawn on the swatch |
| `.nh-thermo`, `.nh-thermo__btn`, `.nh-thermo__mbtn` | The thermostat. Its root carries `--th-heat`, `--th-cool` and `--th-mid`, the colours its face and temperature ramp draw in; `.nh-thermo--heat`, `--cool` and `--neutral` say which is in force |

Readings and instruments:

| Class | What it is |
|---|---|
| `.nh-stat__value`, `.nh-stat__frac`, `.nh-stat__unit`, `.nh-stat__caption`, `.nh-stat__badge` | The reading, its tenths, its unit, the small line under it and the trend marker beside it. All eight of the value widget's styles draw through these, so one rule reaches every one. `.nh-stat` is the stat style's own column, with `--center` and `--right` for its alignment |
| `.nh-value__text`, `.nh-value__unit` | A reading and its unit in the value widget's plain style, set separately |
| `.nh-read`, `.nh-read__main` | The root of the six styles added after plain and stat, with `.nh-read--spark` through `--hero` saying which is drawn. `__plot`, `__line` and `__area` are the sparkline, `__track` and `__fill` the bar, `__disc` the split's icon circle, `__pill` the pill. Size the reading itself on `.nh-stat__value` above, not here |
| `.nh-gauge__*`, `.nh-dial__*` | Gauge and dial internals |
| `.nh-compass__*` | The compass face |
| `.nh-battery`, `.nh-battery__num`, `.nh-battery__cap` | The battery, its number and its charging caption. The root carries the level colours `--bt-good`, `--bt-mid` (the one amber the tokens do not have) and `--bt-low`, plus `--bt-accent`; `--glow` through `--meter` say which of the eight styles is drawn, `[data-level]` which level is in force. Its glyphs are painted inline from `--bt-color`, so recolour through the variables, not the SVG classes |
| `.nh-clock__time`, `.nh-clock__date` | The clock |
| `.nh-chart__chip`, `.nh-chart__legend` | Chart chrome |
| `.nh-tl__row`, `.nh-tl__name`, `.nh-tl__track`, `.nh-tl__band`, `.nh-tl__axis` | The timeline: one row per item, its label, the strip, one state's band, and the clock underneath |
| `.nh-weather`, `.nh-weather__temp`, `.nh-weather__cond`, `.nh-weather__details` | The weather panel. `--hero`, `--compact` and `--striplook` say which layout is drawn, `__strip` and `__col` are the forecast columns |
| `.nh-log`, `.nh-log__line`, `.nh-log__level` | The log console. The root carries `--lg-warn` and `--lg-error` (error follows `bad` unless you set it); `__line--warn` and `--error` mark the lines, `__time`, `__logger` and `__msg` are the columns, `__jump` the pill back to the newest line |
| `.nh-fplan__img`, `.nh-fplan__glow`, `.nh-fplan__marker`, `.nh-fplan__bar` | The floor plan: the plan image (`__img--blueprint` or `--ink`), a light's pool of colour, its dot, the preset bar. `--nh-glow-blend` on the root is the blend mode the plan style picked, and it is the only reason a lit room shows at all, so leave it be |
| `.nh-camera`, `.nh-image`, `.nh-frame`, `.nh-template` | The camera, image, iframe and template hosts. Each has its own status or placeholder child |

When a widget cannot show anything:

| Class | What it is |
|---|---|
| `.nh-widget--notice` | The centred message state, inside the normal frame |
| `.nh-widget__errtitle` | Its headline, usually the name of an item the server does not have |
| `.nh-widget__errtext` | The technical line, monospaced and clipped to one line |
| `.nh-widget__errhint` | The explanation, shown only in a cell with room for it |
| `.nh-widget__unset` | A widget nobody has picked an item for yet |

### Variables set per cell

These live on each grid cell rather than on the root, and a theme can read all of them:

- `--nh-cellfont` is that cell's computed font size, with the dashboard, device and per-widget text
  scales already folded in. Use it for anything that must not shrink twice: a control that moves
  into the name row inherits 0.8em there, and an `em` on top of that is unreadable.
- `--nh-cellaccent` is that tile's own Accent colour, if it has one. `--nh-accent-ink` is
  recalculated on the cell to match it.
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

**2. Style both halves of a control state.** `.nh-button--plain` and `.nh-button--plain.nh-button--active`
have the same specificity, so styling the base flattens the active state. The same goes for
`.nh-selection__btn--active`, `.nh-chip--on`, the dashed `.nh-chip--action` and the listening
`.nh-iconbtn--live`. Style both. The editor says so as you type.

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
.nh-widget--bare { /* a widget that asked for no card */ }
.nh-tile--new    { /* keep this a dashed invitation, not a real dashboard */ }
```

If panelling the bare widgets is deliberate, put `nh-theme-allow: bare-panelled` in a comment and
the check stands down.

**6. Only reference bundled assets.** A `url()` must point at `fonts/`, `backgrounds/` or
`icons/`, or be a `data:` URI. Anything else will not load on a server with no route to the
internet, which is most of them. What is in `fonts/`, each with its licence beside it:
`poppins-400.woff2`, `poppins-500.woff2` and `poppins-600.woff2`, one `@font-face` each;
`montserrat.woff2`, which is variable and wants `format('woff2-variations')` over a `100 900`
range; and `dseg7.woff2` and `dseg14.woff2`, the seven- and fourteen-segment LCD faces. Declaring a
static file as `woff2-variations` gets you no font at all, so match the file.

### Worked example

A flat theme with square corners and an outlined button:

```css
/* Several controls carry a hardcoded radius, so the token alone will not square them. A finish the
   user picked takes the tile's own radius, so the token is enough for those. */
.nh-button--plain,
.nh-iconbtn,
.nh-selection__btn,
.nh-roller__btn,
.nh-player__btn,
.nh-chart__chip,
.nh-color__swatch,
.nh-switch__track,
.nh-switch__thumb,
.nh-log__jump {
  border-radius: 0;
}
/* The stepper builds its own corners from a variable of its own. */
.nh-step { --st-radius: 0; }
/* The two range-track pseudo-elements must stay in separate rules: grouped, the whole rule is
   invalid in whichever engine does not know the other's prefix. */
.nh-color__track::-webkit-slider-runnable-track { border-radius: 0; }
.nh-color__track::-moz-range-track { border-radius: 0; }

/* Tighter insets, gated so the small-cell sheds still win where they are needed. */
@container (min-height: 105px) and (min-width: 121px) {
  .nh-widget__body { padding: 8px 10px 10px; }
}

/* Both halves of the control state, for every control that has one. Touching the base of one of
   these and not its --active is what rule 2 is about, and the editor will say so. */
.nh-button--plain { background: transparent; border: 1px solid var(--nh-border); }
.nh-button--plain.nh-button--active { background: var(--nh-cellaccent, var(--nh-primary)); color: var(--nh-accent-ink); }
.nh-selection__btn { background: transparent; border: 1px solid var(--nh-border); }
.nh-selection__btn--active { background: var(--nh-cellaccent, var(--nh-primary)); color: var(--nh-accent-ink); }
```

### Which built-in to copy

The editor offers to copy the stylesheet of the theme you are looking at. Know what you get:

- **Swiss Sheet** and **Ember** are written almost entirely in `color-mix()` off the tokens, and
  neither bundles a font. That is how one Swiss stylesheet serves both its dark and light variants.
  Copy either of these if you want a starting point that follows the colours you then change.
- **LCD Console**, **Operations** and **Assembly** have colours written into them, bundle a font,
  and in Assembly's case a background image. They will **not** follow the tokens you change. Copy
  them to study, not to recolour.

## Coming from HABPanel

All seven of HABPanel's themes have a port here: Default (as **Aqua**), Material, Material dark,
Pale blue, Translucent, Madras and Orange Tree. An import picks the matching one automatically.
They are ports, not clones: where a colour fell below a readable contrast ratio it was moved the
smallest distance that fixes it.

HABPanel's `additional_stylesheet_url` is **not** imported. Its selectors are HABPanel's, which
neohab does not have. Paste what you want to keep into a theme's Custom CSS and translate the
selectors using the tables above.

## Where this lives in the source

| File | What it is |
|---|---|
| `web/src/themes/tokens.ts` | The token contract. Adding one here puts it in the editor and in this page's tables |
| `web/src/themes/themes.ts` | Applying a theme, the built-ins, the local cache |
| `web/src/themes/active.ts` | Which theme is in effect: the URL override, then this device's, then the shared one |
| `web/src/themes/urlTheme.ts` | The `?theme=` escape hatch, read once at load |
| `web/src/themes/cssRules.ts` | The six rules, checked in the editor and in the tests |
| `web/src/themes/contrast.ts` | Contrast maths and the automatic ink choice |
| `web/src/themes/css/shared.ts` | The recurring idioms above, as reusable pieces |
| `web/src/themes/css/*.ts` | One stylesheet per built-in, loaded only when used |
