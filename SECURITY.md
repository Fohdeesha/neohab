# Security

## Reporting a vulnerability

Please report security problems **privately**, not as a public issue.

Use GitHub's private vulnerability reporting: go to the
[Security tab](https://github.com/Fohdeesha/neohab/security) and choose **Report a vulnerability**.
That opens a private thread visible only to the maintainers.

This is a spare-time community project, so please allow a few days for a first reply. Tell me what
you found, how to reproduce it, and what an attacker gets out of it — a working proof of concept is
worth more than a scanner result. I will confirm the report, agree a fix and a disclosure timeline
with you, and credit you in the release notes unless you would rather I did not.

## What is supported

Fixes go into the next release from `main`. Only the **latest release** is supported: there are no
maintenance branches, and the add-on is a single jar you replace in `addons/`.

## What neohab is, in security terms

neohab is a browser UI. It has no server-side logic of its own beyond serving static files: every
read and write goes to openHAB's own REST API, and **openHAB enforces authorisation, not neohab**.
Anything the UI hides from a non-administrator is a convenience, not a boundary — the server
refuses the write regardless.

That shapes what is and is not a vulnerability here.

**In scope**

- Escaping the Tier‑1 template sandbox: reaching globals, `Function`, prototypes or the host page
  from a widget template's expressions.
- Escaping the Tier‑2 JavaScript widget iframe: reaching the app's DOM, its session, `localStorage`
  or the openHAB token from inside the sandbox.
- Stored configuration that becomes executable — a URL, template or stylesheet from a backup,
  a shared export or a hand edit that runs script in the app's origin.
- Leaking the openHAB token or proxy credentials anywhere they should not go: a log, a URL, a
  request to another origin, an export file, a diagnostics report.
- Any way for a **non-administrator** to change stored configuration that openHAB would otherwise
  refuse.

**Not in scope**

- An administrator doing something dangerous on purpose. Custom widgets, theme stylesheets and
  frame/camera URLs are code an administrator writes and stores deliberately; they run with the
  privileges of the person viewing them, by design. This is the same trust model HABPanel has.
- The UI showing or hiding a control based on role. That is cosmetic — see above.
- Anything that requires an attacker to already have your openHAB credentials or admin token.
- openHAB itself: report those to the
  [openHAB project](https://github.com/openhab/openhab-core/security).
- Running neohab on plain HTTP over a hostile network. Put openHAB behind TLS if that is a concern.

## Practical notes

- Editing always requires an openHAB administrator sign-in. Viewing follows whatever your server
  already allows.
- Tokens are held in the browser (`localStorage`) for the device that signed in. Reverse-proxy
  credentials are kept in memory only and are never written to the device.
- The diagnostics report on the About screen deliberately contains no addresses, credentials or
  item names, so it is safe to paste into a public issue.
