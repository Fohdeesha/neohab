#!/usr/bin/env bash
# What the add-on jar has to contain before it is worth shipping. Run by CI and by the release
# workflow, so the two cannot drift apart.
#
# The version floors matter more than they look: bnd turns each one into a hard OSGi resolution
# constraint, so getting one wrong locks the bundle out of a whole openHAB line with no symptom
# in the app at all. The only evidence is one WARN in the server log.
set -euo pipefail

jar="${1:?usage: check-jar.sh <path to jar>}"
fail=0

note() { printf '  %s %s\n' "$1" "$2"; }
bad() { note 'FAIL' "$1"; fail=1; }

[ -f "$jar" ] || { echo "no such jar: $jar" >&2; exit 1; }

bytes=$(wc -c < "$jar")
if [ "$bytes" -lt 1000000 ]; then
  # nothing below can read a jar this small, so stop here rather than failing on unzip
  bad "the jar is only $bytes bytes, so the frontend did not pack"
  echo "$(basename "$jar") is not shippable" >&2
  exit 1
fi
note 'ok' "$bytes bytes"

# Everything below greps a FILE, never a pipe. `grep -q` stops reading at the first match, which
# SIGPIPEs the writer, and under `pipefail` that reads as "not found" - so an entry near the top
# of a 10,000-line listing reports missing while one near the bottom reports fine.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
unzip -l "$jar" > "$work/entries"
# manifest lines wrap at 72 characters with a leading space, so unfold before matching
unzip -p "$jar" META-INF/MANIFEST.MF | tr -d '\r' | sed -e ':a' -e 'N' -e '$!ba' -e 's/\n //g' > "$work/manifest"

for entry in web/index.html OH-INF/addon/addon.xml; do
  if grep -q " $entry\$" "$work/entries"; then
    note 'ok' "$entry"
  else
    bad "$entry is missing"
  fi
done

check() {
  if grep -qF "$2" "$work/manifest"; then
    note 'ok' "$1"
  else
    bad "$1 ($2 not in the manifest)"
  fi
}

check 'bundle symbolic name' 'Bundle-SymbolicName: org.openhab.ui.neohab'
check 'openHAB floor is 3.1' 'org.openhab.core.ui.tiles;version="[3.1,6)"'
check 'Java floor is 11' '(osgi.ee=JavaSE)(version=11)'
check 'DS extender floor is 1.4' '(osgi.extender=osgi.component)(version>=1.4.0)'
check 'the servlet API stays optional' 'javax.servlet;version="[3.1,5)";resolution:=optional'
# a pinned servlet contract would override the widened imports above
if grep -qF 'osgi.contract=JavaServlet' "$work/manifest"; then
  bad 'the manifest pins a JavaServlet contract, which no other openHAB line will resolve'
else
  note 'ok' 'no pinned servlet contract'
fi

if [ "$fail" -ne 0 ]; then
  echo "$(basename "$jar") is not shippable" >&2
  exit 1
fi
echo "$(basename "$jar") looks shippable"
