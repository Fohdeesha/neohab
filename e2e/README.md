# neohab e2e suites

Browser end-to-end tests for neohab. They drive a real browser (system Edge or Chrome via
`playwright-core` — no bundled browsers) against a **live openHAB server** with the neohab jar
deployed, so they exercise the same thing a user gets: the served bundle, the REST API, SSE,
auth, the works. There is no mock server.

## Setup

1. `npm install` in this directory (only `playwright-core`; it uses your installed
   Edge/Chrome).
2. Copy `target.example.json` to `target.local.json` (gitignored) and fill it in:
   - `baseUrl` — your openHAB server, e.g. `http://192.168.1.10:8080`.
   - `token` or `tokenFile` — an openHAB **admin API token** (`oh.` prefix; create one in
     Main UI under your profile). With `tokenFile`, the path is resolved relative to
     `target.local.json`; the default name `token.local` is gitignored.
   - `items` — five existing items on that server (semantics below).
3. Deploy the jar you want to test (`/neohab/index.html` must serve it).

Environment overrides: `NEOHAB_E2E_BASE`, `NEOHAB_E2E_TOKEN`, `NEOHAB_E2E_TOKEN_FILE`,
`NEOHAB_E2E_TARGET`, `NEOHAB_E2E_USER`, `NEOHAB_E2E_PASSWORD`.

### Optional: a throwaway login

`e2e-signin` covers the full OAuth2/PKCE credential exchange (login form → code → token →
admin write → sign-out) when the target configuration names a **throwaway user** it may sign
in and out freely:

```json
"user": { "name": "e2e-throwaway", "password": "..." }
```

Create one in the karaf console with `openhab:users add e2e-throwaway <password>
administrator` and remove it with `openhab:users remove e2e-throwaway` when done. Without
this the exchange section self-skips; everything up to the server's login form is still
covered. Never point it at a real account.

### Optional: a camera server

`e2e-camera` checks live video when the target configuration names a camera server reachable
from the machine running the suites:

```json
"camera": { "kind": "go2rtc", "server": "http://go2rtc.local:1984", "stream": "my_camera" }
```

`kind` is `go2rtc` or `frigate`. Nothing is ever written to that server — the suite only views
the stream. Without this block the live-video sections self-skip and the rest (chain failure
handling, off-screen policy, tap actions, settings form) still runs.

Note that a stock go2rtc refuses cross-origin WebSocket upgrades, so the suite expects the
chain to land on the embedded player rather than native WebRTC. Set `api: {origin: "*"}` in
`go2rtc.yaml` to exercise the native WebRTC and MSE transports instead.

### Test items

Some suites send **real commands** to three of the items, so do not point these at anything
you would mind switching (a spare bulb or a set of dummy items is ideal). Every suite records
each item's initial state first and restores it in cleanup, even when checks fail.

| key | item type | used how |
|---|---|---|
| `dimmer` | Dimmer | commanded (percent values), restored |
| `color` | Color | commanded (HSB values), restored |
| `switch` | Switch | commanded (ON/OFF), restored |
| `temperature` | Number | **read only** — should have persistence history so chart checks have data; e2e-ops also reads it as the reference a trend arrow compares against, and drives the dimmer clear of it so the direction is deterministic |
| `player` | Player | **display only**, never commanded |
| `formatted` | Number | *optional*, **read only** — its state pattern should append a unit (e.g. `%.0f %%`); e2e-ember uses it to prove a formatted state splits into number + unit, and self-skips without it |
| `decimal` | Number | *optional*, **read only** — its formatted state should carry exactly one decimal digit (e.g. `%.1f`); e2e-lcd uses it to prove the tenths digit splits into its own raised span, and self-skips without it |

## Running

- One suite: `node e2e-<name>.mjs` — prints `PASS`/`FAIL` per check and a summary; exit code
  is non-zero on any failure.
- The battery: `npm run battery` (or `node run.mjs`) runs every *safe-additive* suite in
  sequence and summarizes.

## Safety model — read before running against a server you care about

The suites fall into two classes:

**Safe-additive** (everything `run.mjs` runs): they only ever create config components with
`nh-e2e-*` ids, delete exactly those ids in cleanup, snapshot and restore the `settings`
component verbatim when they touch it, and restore item states. They are designed to run
against a server with a real configuration on it without disturbing it.

One deliberate exception: `e2e-generate.mjs` exercises "one dashboard per group", where the
generator names the dashboards after the groups it found, so their ids are not `nh-e2e-*`. It
records the namespace immediately before creating and deletes exactly the uids that appeared.
An existing dashboard of the same name is never overwritten — the generator de-duplicates the
id (`kitchen` -> `kitchen-2`), which is one of the things that suite checks.

Three more deliberate exceptions, each for the same reason — the feature under test decides the
id, so the suite cannot invent one:

- `e2e-gallery.mjs` installs gallery widgets, which land under the catalogue's own ids
  (`widgetdef:gallery-*`). It deletes exactly that prefix, before and after.
- `e2e-partial.mjs` imports partial exports, which can create a numbered copy
  (`dashboard:nh-e2e-pdash-2`); it deletes its own prefixes, and because importing legitimately
  writes a restore point it also snapshots and restores the two version-history namespaces.
- `e2e-proxyauth.mjs` signs in to an imaginary reverse proxy. Nothing is redirected — requests
  are only inspected — so the server sees ordinary reads with an extra header it ignores.
- `e2e-floorplan.mjs` is the one suite that writes OUTSIDE the UI-component namespaces, because
  lighting presets are stored as openHAB **scenes**: it creates the rules
  `nh-scene-nh-e2e-evening` and `nh-bridge-nh-scene-nh-e2e-evening` in the rule registry and one
  managed test item, `nh_e2e_proxy` (a plain Switch bound to nothing). All three are deleted by
  exact uid in cleanup, and the suite additionally diffs the server's full rule-uid list against
  a pre-run capture so a stray cannot survive unnoticed. It never touches file-provided rules or
  items — those cannot be written through the REST API at all.

**Wipe-cycle** (`e2e.mjs`, `e2e-editor.mjs`, `e2e-widgets.mjs`, `e2e-settings.mjs`,
`e2e-importer.mjs`, `e2e-history.mjs`): these test the empty-server flows (onboarding, first
import, full backup restore, the first restore point) and their cleanup **deletes every neohab
namespace**. Each one carries a guard that aborts before touching anything if the namespaces are
not empty, so they cannot eat a live configuration by accident — but the intended way to run them
is:

```
node tools/config-snapshot.mjs snapshot.json          # save the live configuration
node tools/config-wipe.mjs --yes --snapshot snapshot.json   # empty the namespaces
node e2e-history.mjs && node e2e.mjs && ...           # history FIRST, then the rest
node tools/config-restore.mjs snapshot.json           # put it back (verifies content)
```

**Run `e2e-history.mjs` first.** The other five guard `neohab:config` only, but this one guards
all three namespaces — and each suite that saves configuration leaves restore points behind, so
by the time it runs last the history is no longer empty and it aborts. Its guard is right to be
the strict one: it is the suite whose subject is that data.

The tools cover all three namespaces neohab owns — `neohab:config`, plus `neohab:history` (the
version-history index) and `neohab:historydata` (its snapshots and shared images). Restore points
are a user's data too, so a wipe that dropped them could not be undone.

Note that every suite that saves configuration through the app now also leaves restore points
behind, since that is what the history is for. They are pruned to the retention limit like any
other, and a wipe-cycle run starts from an empty history — for the suite that goes first. The
restore points a full battery accumulates are test artifacts, so clear both history namespaces
before restoring if the configuration they describe is about to be replaced anyway.

Never take the snapshot while a suite is running — you would capture its temporary
components and restore them as if they were yours.
