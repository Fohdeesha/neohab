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
| `temperature` | Number | **read only** — should have persistence history so chart checks have data |
| `player` | Player | **display only**, never commanded |

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

**Wipe-cycle** (`e2e.mjs`, `e2e-editor.mjs`, `e2e-widgets.mjs`, `e2e-settings.mjs`,
`e2e-importer.mjs`): these test the empty-server flows (onboarding, first import, full
backup restore) and their cleanup **deletes the entire `neohab:config` namespace**. Each one
carries a guard that aborts before touching anything if the namespace is not empty, so they
cannot eat a live configuration by accident — but the intended way to run them is:

```
node tools/config-snapshot.mjs snapshot.json   # save the live configuration
node tools/config-wipe.mjs --yes               # empty the namespace
node e2e.mjs && node e2e-editor.mjs && ...     # run the wipe-cycle suites
node tools/config-restore.mjs snapshot.json    # put the configuration back (verifies content)
```

Never take the snapshot while a suite is running — you would capture its temporary
components and restore them as if they were yours.
