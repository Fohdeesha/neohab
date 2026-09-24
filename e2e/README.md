# neohab e2e suites

Browser end-to-end tests for neohab. They drive a real browser (your system Chrome, or Edge if you
have no Chrome, via `playwright-core`, no bundled browsers) against a **live openHAB server** with the neohab jar
deployed, so they exercise the same thing a user gets: the served bundle, the REST API, SSE, auth,
the works. There is no mock server.

## Setup

1. `npm install` in this directory (only `playwright-core`; it uses your installed Chrome or Edge.
   Chrome is tried first: on Windows, Edge writes a permanent jump-list file per launch, so a
   battery leaves 63 of them in your profile and Chrome leaves none).
2. Copy `target.example.json` to a `target.<name>.json` of your own (any `e2e/target.*.json` but
   the example is gitignored) and fill it in:
   - `baseUrl` is your openHAB server, for example `http://192.168.1.10:8080`.
   - `token` or `tokenFile` is an openHAB **admin API token** (`oh.` prefix; create one in Main UI
     under your profile). With `tokenFile`, the path is resolved relative to the target file,
     and the default name `token.local` is gitignored.
   - `items` names five existing items on that server (semantics below).
   - `production` is `true` for a server somebody relies on, and `false` (or left out) for a test
     server. See [A production target](#a-production-target).
3. Deploy the jar you want to test (`/neohab/index.html` must serve it).
4. Name the target file in `NEOHAB_E2E_TARGET` on **every** command. There is no default: a suite,
   the runner or a tool started without it stops before it reaches any server.

Environment overrides: `NEOHAB_E2E_BASE`, `NEOHAB_E2E_TOKEN`, `NEOHAB_E2E_TOKEN_FILE`,
`NEOHAB_E2E_USER`, `NEOHAB_E2E_PASSWORD`. They change what a target file says; they never stand in
for one.

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

### Optional: a plain-http address for the mixed-content checks

`e2e-https` needs a plain `http://` address to prove a camera, frame or image on one is refused by
the browser and explained by the widget. It defaults to your own `baseUrl` with the scheme swapped,
which never has to answer, since mixed content is refused before a connection is opened. Override it
only if you want a real one:

```json
"plainHttp": "http://openhab.local:8080"
```

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

- One suite: `NEOHAB_E2E_TARGET=./target.test.json node e2e-<name>.mjs`. It prints `PASS` or
  `FAIL` per check and a summary, and the exit code is non-zero on any failure.
- The battery: `NEOHAB_E2E_TARGET=./target.test.json node run.mjs` (or `npm run battery` with the
  variable set) runs every safe-additive suite in sequence and summarizes. It prints the server,
  its openHAB version and the served bundle at both ends of the run, so a log always says what it
  was about. Name suites after `run.mjs` to run only those.
- `node run.mjs --list` prints the two suite lists and does nothing else: it loads no target and
  contacts no server. Importing `run.mjs` does nothing either; only running it as the entry point
  starts a battery.
- **Stopping a run.** Ctrl-C (or a SIGTERM) closes the browser and lets the suite go on into its
  own cleanup, which is what takes its components and items off the server; the runner starts no
  further suites and prints the summary of what did run. A second Ctrl-C a few seconds later exits
  at once, cleanup or not, and a suite whose cleanup is still going two minutes after the first one
  exits by itself. Closing the output (`| head`, a closed terminal) is treated the same way as the
  first Ctrl-C, so peeking at the start of a run no longer kills a suite halfway through seeding.
- Each suite gets 30 minutes (`NEOHAB_E2E_SUITE_TIMEOUT_MIN` changes it). One that runs over is
  asked to stop and clean up, and killed if it has not finished a few minutes later.
- A suite that had nothing it was allowed to do on the target (see below) exits with code 3, and
  the battery summary lists it as `SKIP` rather than as a pass or a failure.
- **One at a time is deliberate.** Running suites concurrently was tried on 2026-09-06 and taken
  out again: most of them read the whole namespace to work out what they created or to check they
  cleaned up, so a second suite's components land in the middle of that. `e2e-generate` found
  another suite's dashboards inside 90 seconds of the first attempt. Making it safe needs each
  suite to say for itself that it can share a server, and to be shown doing it, rather than the
  runner guessing from the source.

### More than one server

neohab runs on openHAB 3.1 through 5.x, so the suites are meant to be run against more than one
line. Keep a target file per server and pick one with `NEOHAB_E2E_TARGET`:

```
NEOHAB_E2E_TARGET=/path/to/target.oh5.json node run.mjs
```

Any `e2e/target.*.json` is gitignored except `target.example.json`. Deploy the **same jar** to
both servers first and check the bundle in the banner matches, or the two runs are not comparable.

**Some suites cannot pass on an older server, and that is the server rather than a regression.**
On openHAB below 4.1 `e2e-log` fails almost entirely, because that openHAB registers no log
websocket; below 4.0, `e2e-floorplan` loses its two signed-out preset checks and `e2e-generate`
its console-error check, since `/rest/tags` does not exist there. Measured on 3.4.5 (56 of 60
suites) and 4.0.0 (57 of 60); 4.1 and up should be clean.

A server's own state changes what the suites can see, and two differences matter enough to plan
for:

- **A fresh server has no `settings` component** (it appears the first time somebody changes a
  setting). Suites read it through `lib/components.mjs`, which answers `null` for a 404 and for
  nothing else: any other failed or unreadable answer throws, because code that restores settings
  deletes the component when it was `null` to begin with.
- **A fresh server has no persistence history**, so chart, gauge, timeline and aggregation checks
  have nothing to draw, and some of them need days of it: bars per day, an hour-of-day axis, a
  weekday axis and a heatmap all want data spread across the calendar. rrd4j refuses a value
  stamped in the past, so waiting is the only way to fill it. A **Modifiable** service (the
  in-memory one, say) accepts `PUT /rest/persistence/items/<item>?time=&state=`, which backfills
  weeks in seconds; make it the default so the suites read what you seeded. Mind how much it
  keeps: the in-memory service holds 512 entries per item, so resolution and window trade off
  against each other, and different checks want different ones.

### Over HTTPS

A target whose `baseUrl` starts with `https:` runs the same suites over TLS. Nothing else changes
in a target file, and openHAB already listens on 8443:

```
NEOHAB_E2E_TARGET=/path/to/target.oh5-https.json node run.mjs
```

`lib/target.mjs` notices the scheme and answers with the two things a self-signed certificate
needs: `--ignore-certificate-errors` for the browser (`LAUNCH_ARGS`, applied by every suite
through `lib/browser.mjs`) and `NODE_TLS_REJECT_UNAUTHORIZED=0` for the fetches the harness itself
makes. The browser flag rather than a per-context `ignoreHTTPSErrors`, deliberately: the flag
makes the origin a **secure context**, so the service worker registers, the wake lock is offered
and `crypto.subtle` exists, which is the whole point of running over TLS. A context option would
load the page and leave all three untestable.

Worth knowing before you read the results:

- **`e2e-https` is the suite about TLS itself** and self-skips on an http target, so it is inert
  in an ordinary run. It covers the secure-context capabilities, the item-state stream over TLS,
  the PKCE challenge on the SubtleCrypto path (the http suites exercise the bundled fallback
  instead), the service worker and its precache, and mixed content.
- **Drop the `camera` block from an HTTPS target.** The usual fixture is a plain-HTTP go2rtc, and
  an https page may not load it at all, so the camera suite's live-video sections would fail on
  mixed content rather than on a defect. Without the block they self-skip, and `e2e-https` asserts
  the mixed-content behaviour on purpose.

### A production target

`"production": true` in a target file marks a server somebody relies on (anything but `false` or
leaving the key out counts, so a typo errs on the safe side). Against such a target:

- `run.mjs` refuses to start if a wipe-cycle suite is named on its command line, each wipe-cycle
  suite refuses to run, and `tools/config-wipe.mjs` and `tools/config-restore.mjs` refuse too.
- Nothing creates managed items. A suite that is built on items of its own from start to finish
  (`e2e-battery`, `e2e-button`, `e2e-colorpower`, `e2e-fade`, `e2e-livedrag`, `e2e-log`,
  `e2e-slider`, `e2e-stepper`, `e2e-thermostat`, `e2e-value`) exits with code 3 and a
  `SKIP (production target)` line, and the battery summary shows it as `SKIP`. A suite where only
  some sections need one (`e2e-audit2`, `e2e-floorplan`, `e2e-launch`, `e2e-textscale`) skips those
  sections and prints the same line for each, so a skip is never silent. Those checks are covered
  on a test server, not on production.

## Safety model: read before running against a server you care about

The suites fall into two classes.

**Safe-additive** (everything `run.mjs` runs): they only ever create config components with
`nh-e2e-*` ids, delete exactly those ids in cleanup (after deleting any a killed earlier run left
behind, before seeding), and restore item states. They are designed to run against a server with a
real configuration on it without disturbing it.

Two things every panel on a server shares are kept out of the server altogether, by
`lib/sandbox.mjs`:

- **Version history.** Every save through the app takes a restore point first, and restore points
  are pruned to a retention limit, so a battery's own used to push a person's out for good.
  `lib/browser.mjs` answers every write to `neohab:history` and `neohab:historydata` inside the
  browser, in every context of every suite; reads still reach the server. `e2e-history`, whose
  subject is the history, is the one suite that turns this off.
- **The `settings` component**, which every real wall panel obeys the moment it changes: a theme,
  a control item the panels follow, a speech item they read aloud. A suite that needs a setting
  (`e2e-kiosk`, `e2e-voiceaudio`, `e2e-breakpoints`, `e2e-lock`, `e2e-sidebar`, `e2e-templates`,
  `e2e-livedrag`) or that makes the app save one (`e2e-corners`, `e2e-themecss`, `e2e-ember`,
  `e2e-backgrounds`, `e2e-timeclock`) gets it from `sharedSettings()`: the browser is shown the
  server's settings with the suite's patch on top, whatever the app saves is kept in the browser,
  and cleanup checks the server's copy is exactly what it was.

The same helper records every component the app creates through it, so cleanup can delete exactly
those and nothing somebody else saved in the meantime; `guardExisting()` goes further and answers an
app delete of anything that was on the server before the run in the browser, so the server keeps it.

`e2e-generate.mjs` exercises "one dashboard per group", where the generator names the dashboards
after the groups it found, so their ids are not `nh-e2e-*`. It deletes exactly the uids the app
was seen creating. An existing dashboard of the same name is never overwritten, because the
generator de-duplicates the id (`kitchen` becomes `kitchen-2`), which is one of the things that
suite checks.

Four more deliberate exceptions, each for the same reason: the feature under test decides the id,
so the suite cannot invent one.

- `e2e-gallery.mjs` adds the bundled example widgets, which land under the catalogue's own ids
  (`widgetdef:gallery-*`). It deletes only the ones the app created during the run, and checks
  that every gallery widget already on the server comes out of the run unchanged. When the
  example it adds, edits and renders is one the server already has, that part is skipped and says
  so, because every step of it would act on somebody's own copy.
- `e2e-partial.mjs` imports partial exports, which can create a numbered copy
  (`dashboard:nh-e2e-pdash-2`). It deletes its own prefixes. The restore points its imports take
  stay in the browser, and it checks the server's version history is exactly as it found it.
- `e2e-proxyauth.mjs` signs in to an imaginary reverse proxy. Nothing is redirected, requests are
  only inspected, so the server sees ordinary reads with an extra header it ignores.
- `e2e-floorplan.mjs` is the one suite that writes outside the UI-component namespaces, because
  lighting presets are stored as openHAB **scenes**. It creates the rules
  `nh-scene-nh-e2e-evening` and `nh-bridge-nh-scene-nh-e2e-evening` in the rule registry and one
  managed test item, `nh_e2e_proxy` (a plain Switch bound to nothing). All three are deleted by
  exact uid in cleanup, and the suite additionally diffs the server's full rule-uid list against a
  pre-run capture so a stray cannot survive unnoticed. It never touches file-provided rules or
  items, which cannot be written through the REST API at all. On a production target it creates no
  items: the wall-switch bridge, and the sections that drive its own Color item `nh_e2e_glow`, are
  skipped with a `SKIP` line. It still creates its scene rules there.

`e2e-launch.mjs` drives the screens people meet when something is wrong: a configuration that
cannot be read, a server that shows nothing without an account, a save the server refuses, an
upgrade under an open tab, a widget bound to an item the server does not have, an image whose
address does not answer, and the notice that explains why live values stopped. Every one of those
is produced by answering the app's own requests locally, so the server is never reconfigured and
nothing is written by a refused save. It creates `dashboard:nh-e2e-launch` and its `-empty`,
`-ghost` and `-img` siblings and deletes all four by exact uid; it commands nothing. Where the
server has no labelled Dimmer or Number it creates one for the naming check, `nh_e2e_launch_number`,
and deletes it again; on a production target it skips that check instead.

Two of those sections are worth knowing about before editing them. The live-updates one fakes a
server with openHAB's implicit user role off, and it does that by refusing only the requests that
carry **no** `Authorization` header - refusing everything would reproduce being signed out, which
is a different state with no dashboard in it, and a check written that way passes whether the app
asks the right question or not. The missing-item one seeds a real dashboard with a name no server
has, and also checks the converse: a server that will not list its items must never be used to
call an item missing.

`e2e-fade.mjs` replays what a DMX strip reports while it fades - the sequences were taken from a
real server's `events.log` - onto two managed items it creates itself (`nh_e2e_fadecol`,
`nh_e2e_fadedim`, both bound to nothing), so no device is driven and the timing belongs to the
suite. It clicks nothing, commands are intercepted, and the count of them is one of its checks.
Both items are deleted by name in cleanup, and it never touches file-provided items.

`e2e-button.mjs` drives the button widget in both its styles and the migration that folded the old
switch widget into it, against two managed items it creates itself (`nh_e2e_btn`, a Dimmer, and
`nh_e2e_btnstr`, a String, both bound to nothing), so its commands are real and reach no device. It
seeds three dashboards: one in the shipped shape, one written the way a neohab from before the
merge would have, with `type: 'switch'`, no version field and the switch's own
`onCommand`/`offCommand`, and one carrying a tile per style and finish. That third one is read
rather than pressed: everything about a finish is measured from the browser's own computed styles,
so a class that resolves to no rule fails, and the contrast of a caption on a face the accent has
flooded is a number rather than a judgement. The shipped seed puts the same Dimmer on two tiles **in the same style**,
differing only by "Count any value above 0 as on", because that setting is what decides whether a
tile reads as on and the style must be shown to decide nothing. It saves through the app once,
because the migration has to be proved to reach the server and not only the screen; the restore
point that save takes stays in the browser like every other suite's. Every dashboard and item it
creates is deleted by name in cleanup.

`e2e-audit2.mjs`, `e2e-editor.mjs` and `e2e-widgets.mjs` deliberately keep seeding `type: 'switch'`
dashboards, so the battery drives the migration end to end rather than only where it is tested on
purpose. Do not "modernise" those seeds.

`e2e-audit2.mjs` also creates four managed Switch items named `constructor`, `toString`,
`hasOwnProperty` and `__proto__` (openHAB accepts all four), bound to nothing, and deletes them by
name in cleanup. They used to be names nobody had, which was fine until a widget bound to an item
the server does not have started saying so instead of rendering: the section would have gone on
passing while testing nothing at all. Real items are what make the lookup tables actually get a
`constructor` to look up. On a production target that section is skipped, since it cannot have
them.

`e2e-stepper.mjs` drives the stepper widget - six looks, five finishes, a number and a list -
against five managed items it creates itself (`nh_e2e_stepnum`, `nh_e2e_steplist`,
`nh_e2e_stepfan`, `nh_e2e_stepnull`, `nh_e2e_stepmany`, all bound to nothing), so its commands
are real and reach no device. It enters edit mode once to inspect the settings panel and leaves
without saving. The dashboard and all five items are deleted by name in cleanup.

`e2e-battery.mjs` drives the battery widget - eight styles, the input scale, the level colours,
the charging bolt and the shapes where a caption or a number runs out of room - against four
managed items it creates itself (`nh_e2e_batt`, `nh_e2e_battchg`, `nh_e2e_battmv`,
`nh_e2e_battnull`, bound to nothing). Every state is set over REST and the widget commands
nothing, which is one of its checks. The dashboard and the items are deleted by name in cleanup.

`e2e-slider.mjs` drives the slider widget - five styles, both orientations - against one managed
Dimmer it creates itself (`nh_e2e_slide`, bound to nothing), so its commands are real and reach no
device. Its geometry section is why the item is its own: the four painted styles draw a fill under
the browser's own range input, and proving the two agree means moving the value to both ends of
the scale and pressing at measured positions. It enters edit mode once to inspect the settings
panel and leaves without saving. The dashboard and the item are deleted by name in cleanup.

`e2e-livedrag.mjs` proves that a slider, colour picker or dial commands the device AS it is dragged:
the first change past the 3px gate goes out at once, a long drag is throttled to one command per
200ms with one request in flight, and the released value always goes last. It drags by hand, a few
pixels every 40ms, because Playwright's own stepped move is over in milliseconds and could never see
a throttle. It also holds every invariant the hold gesture had: a still press, a wobble under 3px and
a press the sheet has already taken all send nothing. Three managed items it creates itself
(`nh_e2e_ldim`, `nh_e2e_ldim2`, `nh_e2e_lcol`, bound to nothing) take the commands, one section
injects a 400 to prove a refusal stops the drag, and one shows a fresh browser context the shared
setting turned off, without writing it to the server. The dashboard and the items are deleted by
name in cleanup.

`e2e-thermostat.mjs` drives the thermostat widget - four looks, the setpoint's buttons and its
ring, the mode, fan and aux buttons, and the status item - against nine managed items it creates
itself (`nh_e2e_thcur`, `nh_e2e_thset`, `nh_e2e_thmode`, `nh_e2e_thfan`, `nh_e2e_thaux`,
`nh_e2e_thstat`, `nh_e2e_thcurc`, `nh_e2e_thsetc`, `nh_e2e_thnull`, all bound to nothing), so its
commands are real and reach no device. It enters edit mode once to inspect the settings panel and
leaves without saving. The dashboard and all nine items are deleted by name in cleanup.

`e2e-log.mjs` drives the log widget and its full-screen viewer against one managed Dimmer it
creates itself (`nh_e2e_logdim`, bound to nothing): its state changes and one command are what
openHAB logs as the events.log lines the checks look for. The openhab.log lines it looks for are
made the same way: a message the log socket cannot parse as a filter, which the server logs as a
WARN carrying the text verbatim, so each run leaves a few such warnings in the server's log, each
tagged with the run's own marker. What an anonymous socket gets differs between the two openHAB
lines, so the suite asks the server first and holds the tile to whichever answer it got. It
enters edit mode once to inspect the settings panel and leaves without saving. The dashboard and
the item are deleted by name in cleanup.

`e2e-colorpower.mjs` drives the colour widget's on and off buttons against one managed Color item
it creates itself (`nh_e2e_pwr`, bound to nothing), so its commands are real and reach openHAB but
no device is involved. That is the point of the suite rather than a convenience: the feature rests
on what openHAB's `ColorItem` does with OFF and ON, so the round trip has to be the server's own -
a lamp at 40% has to come back at 40%, where a plain ON would return it at 100%. Deleted by name in
cleanup, and it never touches a file-provided item.

`e2e-panels.mjs` adds one of **every** widget the palette offers and measures its settings panel:
nothing pushed outside the panel, no editable box too narrow to use, no select showing a blank
row, no sideways scrolling. The widget list comes from the palette, so a widget added later is
covered without editing the suite. It saves nothing (the draft is discarded on Exit) and binds no
items.

`e2e-runfit.mjs` adds one of **every** widget the palette offers, saves, and measures the result in
**run mode**, which is a different question from the settings panel above: does each widget render,
and does it keep everything it draws inside its own tile. The second half is the point. A grid cell
is `container-type: size`, which reads like it contains an absolutely positioned child and does not
- only a position, a transform or `contain: layout` does - so an `inset: 0` overlay under a static
chain is laid out against the viewport instead, invisible to the DOM and to every spill scan that
measures children against their parent, and sitting on top of the whole dashboard eating its clicks.
The editor cannot show it either, since its cells are absolutely positioned and so do contain it.
It saves once through the app, because the bug it exists for only appears on a saved dashboard
being viewed. The widget list comes from the palette, so a widget added
later is covered without editing the suite. It creates and deletes exactly
`dashboard:nh-e2e-runfit`, binds no items and intercepts commands.

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
namespace**. Each one refuses to run against a production target at all, and otherwise carries a
guard (`lib/guard.mjs`) that reads the namespaces with the token and aborts before touching
anything unless they are empty. The guard fails closed: a refused read, an error page or anything
that is not a list counts as "not empty". The intended way to run them, on a test server, is:

```
export NEOHAB_E2E_TARGET=./target.test.json
node tools/config-snapshot.mjs snapshot.json          # save the live configuration
node tools/config-wipe.mjs --yes --snapshot snapshot.json   # empty the namespaces
node e2e-history.mjs && node e2e.mjs && ...           # history FIRST, then the rest
node tools/config-restore.mjs snapshot.json           # put it back (verifies content)
```

**Run `e2e-history.mjs` first.** The other five guard `neohab:config` only, but this one guards
all three namespaces. The other suites keep their restore points in the browser now, so a wipe
cycle only finds history left over from something else, but the guard is right to be the strict
one: it is the suite whose subject is that data.

The tools cover all three namespaces neohab owns: `neohab:config`, plus `neohab:history` (the
version-history index) and `neohab:historydata` (its snapshots and shared images). Restore points
are a user's data too, so a wipe that dropped them could not be undone.

`config-wipe.mjs` and `config-restore.mjs` refuse a production target. `config-snapshot.mjs` only
reads, so it runs anywhere, and a snapshot of a production server is how to keep a copy of it.
Putting a production server back from one is deliberately not something the restore tool does
without the flag being taken out of its target file first.

Never take the snapshot while a suite is running. You would capture its temporary components and
restore them as if they were yours.
