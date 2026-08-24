# neohab e2e suites

Browser end-to-end tests for neohab. They drive a real browser (system Edge or Chrome via
`playwright-core`, no bundled browsers) against a **live openHAB server** with the neohab jar
deployed, so they exercise the same thing a user gets: the served bundle, the REST API, SSE, auth,
the works. There is no mock server.

## Setup

1. `npm install` in this directory (only `playwright-core`; it uses your installed Edge/Chrome).
2. Copy `target.example.json` to `target.local.json` (gitignored) and fill it in:
   - `baseUrl` is your openHAB server, for example `http://192.168.1.10:8080`.
   - `token` or `tokenFile` is an openHAB **admin API token** (`oh.` prefix; create one in Main UI
     under your profile). With `tokenFile`, the path is resolved relative to `target.local.json`,
     and the default name `token.local` is gitignored.
   - `items` names five existing items on that server (semantics below).
3. Deploy the jar you want to test (`/neohab/index.html` must serve it).

Environment overrides: `NEOHAB_E2E_BASE`, `NEOHAB_E2E_TOKEN`, `NEOHAB_E2E_TOKEN_FILE`,
`NEOHAB_E2E_TARGET`, `NEOHAB_E2E_USER`, `NEOHAB_E2E_PASSWORD`.

### Optional: a throwaway login

`e2e-signin` covers the full OAuth2/PKCE credential exchange (login form, code, token, admin
write, sign-out) when the target configuration names a **throwaway user** it may sign in and out
freely:

```json
"user": { "name": "e2e-throwaway", "password": "..." }
```

Create one in the karaf console with `openhab:users add e2e-throwaway <password> administrator`
and remove it with `openhab:users remove e2e-throwaway` when done. Without this the exchange
section self-skips, and everything up to the server's login form is still covered. Never point it
at a real account.

### Optional: a camera server

`e2e-camera` checks live video when the target configuration names a camera server reachable from
the machine running the suites:

```json
"camera": { "kind": "go2rtc", "server": "http://go2rtc.local:1984", "stream": "my_camera" }
```

`kind` is `go2rtc` or `frigate`. Nothing is ever written to that server; the suite only views the
stream. Without this block the live-video sections self-skip, and the rest still runs: chain
failure handling, off-screen policy, tap actions and the settings form.

Note that a stock go2rtc refuses cross-origin WebSocket upgrades, so the suite expects the chain
to land on the embedded player rather than native WebRTC. Set `api: {origin: "*"}` in
`go2rtc.yaml` to exercise the native WebRTC and MSE transports instead.

### Test items

Some suites send **real commands** to three of the items, so do not point these at anything you
would mind switching. A spare bulb or a set of dummy items is ideal. Every suite records each
item's initial state first and restores it in cleanup, even when checks fail.

| key | item type | used how |
|---|---|---|
| `dimmer` | Dimmer | commanded (percent values), restored |
| `color` | Color | commanded (HSB values), restored |
| `switch` | Switch | commanded (ON/OFF), restored |
| `temperature` | Number | **read only**. Should have persistence history so chart checks have data. e2e-ops also reads it as the reference a trend arrow compares against, and drives the dimmer clear of it so the direction is deterministic |
| `player` | Player | **display only**, never commanded |
| `formatted` | Number | **optional**, **read only**. Its state pattern should append a unit (for example `%.0f %%`); e2e-ember uses it to prove a formatted state splits into number + unit, and self-skips without it |
| `decimal` | Number | **optional**, **read only**. Its formatted state should carry exactly one decimal digit (for example `%.1f`); e2e-lcd uses it to prove the tenths digit splits into its own raised span, and self-skips without it |

## Running

- One suite: `node e2e-<name>.mjs`. It prints `PASS` or `FAIL` per check and a summary, and the
  exit code is non-zero on any failure.
- The battery: `npm run battery` (or `node run.mjs`) runs every safe-additive suite in sequence
  and summarizes. It prints the server, its openHAB version and the served bundle at both ends of
  the run, so a log always says what it was about.

### More than one server

neohab supports openHAB 4.x and 5.x, so the suites are meant to be run against both. Keep a
target file per server and pick one with `NEOHAB_E2E_TARGET`:

```
NEOHAB_E2E_TARGET=/path/to/target.oh5.json node run.mjs
```

Any `e2e/target.*.json` is gitignored except `target.example.json`. Deploy the **same jar** to
both servers first and check the bundle in the banner matches, or the two runs are not comparable.

A server's own state changes what the suites can see, and two differences matter enough to plan
for:

- **A fresh server has no `settings` component** (it appears the first time somebody changes a
  setting). Suites that snapshot it read it through `lib/components.mjs`, which answers `null`
  rather than throwing, and cleanup then removes the component instead of writing one back.
- **A fresh server has no persistence history**, so chart, gauge, timeline and aggregation checks
  have nothing to draw, and some of them need days of it: bars per day, an hour-of-day axis, a
  weekday axis and a heatmap all want data spread across the calendar. rrd4j refuses a value
  stamped in the past, so waiting is the only way to fill it. A **Modifiable** service (the
  in-memory one, say) accepts `PUT /rest/persistence/items/<item>?time=&state=`, which backfills
  weeks in seconds; make it the default so the suites read what you seeded. Mind how much it
  keeps: the in-memory service holds 512 entries per item, so resolution and window trade off
  against each other, and different checks want different ones.

## Safety model: read before running against a server you care about

The suites fall into two classes.

**Safe-additive** (everything `run.mjs` runs): they only ever create config components with
`nh-e2e-*` ids, delete exactly those ids in cleanup, snapshot and restore the `settings` component
verbatim when they touch it, and restore item states. They are designed to run against a server
with a real configuration on it without disturbing it. On a server that has no `settings`
component yet, a suite that needs one creates it and **deletes it again** in cleanup: leaving it
behind would be a change like any other.

One deliberate exception: `e2e-generate.mjs` exercises "one dashboard per group", where the
generator names the dashboards after the groups it found, so their ids are not `nh-e2e-*`. It
records the namespace immediately before creating and deletes exactly the uids that appeared. An
existing dashboard of the same name is never overwritten, because the generator de-duplicates the
id (`kitchen` becomes `kitchen-2`), which is one of the things that suite checks.

Four more deliberate exceptions, each for the same reason: the feature under test decides the id,
so the suite cannot invent one.

- `e2e-gallery.mjs` installs gallery widgets, which land under the catalogue's own ids
  (`widgetdef:gallery-*`). It deletes exactly that prefix, before and after.
- `e2e-partial.mjs` imports partial exports, which can create a numbered copy
  (`dashboard:nh-e2e-pdash-2`). It deletes its own prefixes, and because importing legitimately
  writes a restore point it also snapshots and restores the two version-history namespaces.
- `e2e-proxyauth.mjs` signs in to an imaginary reverse proxy. Nothing is redirected, requests are
  only inspected, so the server sees ordinary reads with an extra header it ignores.
- `e2e-floorplan.mjs` is the one suite that writes outside the UI-component namespaces, because
  lighting presets are stored as openHAB **scenes**. It creates the rules
  `nh-scene-nh-e2e-evening` and `nh-bridge-nh-scene-nh-e2e-evening` in the rule registry and one
  managed test item, `nh_e2e_proxy` (a plain Switch bound to nothing). All three are deleted by
  exact uid in cleanup, and the suite additionally diffs the server's full rule-uid list against a
  pre-run capture so a stray cannot survive unnoticed. It never touches file-provided rules or
  items, which cannot be written through the REST API at all. Its last section saves through the
  app, so unlike most safe-additive suites it does mint version-history restore points.

`e2e-fade.mjs` replays what a DMX strip reports while it fades - the sequences were taken from a
real server's `events.log` - onto two managed items it creates itself (`nh_e2e_fadecol`,
`nh_e2e_fadedim`, both bound to nothing), so no device is driven and the timing belongs to the
suite. It clicks nothing, commands are intercepted, and the count of them is one of its checks.
Both items are deleted by name in cleanup, and it never touches file-provided items.

`e2e-panels.mjs` adds one of **every** widget the palette offers and measures its settings panel:
nothing pushed outside the panel, no editable box too narrow to use, no select showing a blank
row, no sideways scrolling. The widget list comes from the palette, so a widget added later is
covered without editing the suite. It saves nothing (the draft is discarded on Exit) and binds no
items.

`e2e-weather.mjs` answers every Open-Meteo request from `fixtures/` via route interception, so the
battery never waits on a third-party service and the readings it asserts come from the same file
the routes serve. The one item it binds (`items.temperature`) is only ever read.

`e2e-clocktime.mjs` **injects** the server's clock rather than measuring it. A clock set to the
server reads the `Date` header off a `HEAD /rest/`, and on a well-run pair of machines the two
clocks agree, so there would be nothing to see: the suite fulfils that one request with a `Date`
of its own choosing and then asserts the tile and the sheet against the offset it chose. Only HEAD
is intercepted, because the app reads the same path with GET for the server's version and locale.
Each section opens its own page, since the measured offset is cached per device and one section
would otherwise decide the next one's answer. Every widget it seeds is a clock, so it commands
nothing and binds no items.

**Console errors and somebody else's data.** A real openHAB carries the user's own configuration,
which routinely points at iconsets renamed years ago and hosts that no longer answer. A suite that
fails on those 404s cannot be run against a live server, so `isAppResource()` in `lib/target.mjs`
keeps only failures under the add-on's own path or the REST API. Suites record the URL alongside
the message, because "Failed to load resource" on its own is a failure nobody can act on.

**Wipe-cycle** (`e2e.mjs`, `e2e-editor.mjs`, `e2e-widgets.mjs`, `e2e-settings.mjs`,
`e2e-importer.mjs`, `e2e-history.mjs`): these test the empty-server flows (onboarding, first
import, full backup restore, the first restore point) and their cleanup **deletes every neohab
namespace**. Each one carries a guard that aborts before touching anything if the namespaces are
not empty, so they cannot eat a live configuration by accident. The intended way to run them is:

```
node tools/config-snapshot.mjs snapshot.json          # save the live configuration
node tools/config-wipe.mjs --yes --snapshot snapshot.json   # empty the namespaces
node e2e-history.mjs && node e2e.mjs && ...           # history FIRST, then the rest
node tools/config-restore.mjs snapshot.json           # put it back (verifies content)
```

**Run `e2e-history.mjs` first.** The other five guard `neohab:config` only, but this one guards
all three namespaces, and each suite that saves configuration leaves restore points behind. By the
time it runs last the history is no longer empty and it aborts. Its guard is right to be the
strict one: it is the suite whose subject is that data.

The tools cover all three namespaces neohab owns: `neohab:config`, plus `neohab:history` (the
version-history index) and `neohab:historydata` (its snapshots and shared images). Restore points
are a user's data too, so a wipe that dropped them could not be undone.

Note that every suite that saves configuration through the app also leaves restore points behind,
since that is what the history is for. They are pruned to the retention limit like any other, and
a wipe-cycle run starts from an empty history for the suite that goes first. The restore points a
full battery accumulates are test artifacts, so clear both history namespaces before restoring if
the configuration they describe is about to be replaced anyway.

Never take the snapshot while a suite is running. You would capture its temporary components and
restore them as if they were yours.
