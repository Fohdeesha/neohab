#!/usr/bin/env bash
# What the add-on jar has to contain before it is worth shipping. Run by CI and by the release
# workflow, so the two cannot drift apart.
#
# The version floors matter more than they look: bnd turns each one into a hard OSGi resolution
# constraint, so getting one wrong locks the bundle out of a whole openHAB line with no symptom
# in the app at all. The only evidence is one WARN in the server log.
#
# The content checks exist because a jar that lost files still builds and installs: one that was
# missing six files from web/public served no favicon, no start page tile and no Assembly backdrop,
# and nothing said so.
set -euo pipefail
# sort and comm have to agree on the order
export LC_ALL=C

jar="${1:?usage: check-jar.sh <path to jar>}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0

note() { printf '  %s %s\n' "$1" "$2"; }
bad() { note 'FAIL' "$1"; fail=1; }

# every file committed under web/public, which Vite copies into the jar as it is
public_files=(
  apple-touch-icon.png
  backgrounds/assembly-hall.jpg
  favicon.ico
  favicon.svg
  gallery/gallery-bigvalue.json
  gallery/gallery-compare.json
  gallery/gallery-grouptoggle.json
  gallery/gallery-progress.json
  gallery/gallery-taglist.json
  gallery/index.json
  jswidget.html
  logo-light.svg
  logo.svg
  probe.js
  pwa-192.png
  pwa-512.png
  pwa-maskable-512.png
  tile.png
)

# what web/scripts/stage-assets.mjs and the PWA plugin write under a fixed name
built_files=(
  fonts/dseg-LICENSE.txt
  fonts/dseg14.woff2
  fonts/dseg7.woff2
  fonts/montserrat-LICENSE.txt
  fonts/montserrat.woff2
  fonts/poppins-400.woff2
  fonts/poppins-500.woff2
  fonts/poppins-600.woff2
  fonts/poppins-LICENSE.txt
  icons/mdi/LICENSE
  icons/fluent/ATTRIBUTION.txt
  icons/fc/ATTRIBUTION.txt
  icons/meteo/ATTRIBUTION.txt
  manifest.json
  sw.js
)

# icon set and the fewest icons it may hold. 1.37.0 had 7447, 1586, 329 and 447
icon_floors=(mdi:7000 fluent:1500 fc:300 meteo:400)

# 41 entries on 1.37.0. Losing a file drops it quietly, since the list is built from what exists
precache_floor=40

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
unzip -l "$jar" > "$work/listing"
awk 'NR > 3 && $4 != "" { print $4 }' "$work/listing" > "$work/names"
# manifest lines wrap at 72 characters with a leading space, so unfold before matching
unzip -p "$jar" META-INF/MANIFEST.MF | tr -d '\r' | sed -e ':a' -e 'N' -e '$!ba' -e 's/\n //g' > "$work/manifest"

has() { grep -qxF "$1" "$work/names"; }

need() {
  if has "$1"; then
    note 'ok' "$1"
  else
    bad "$1 is missing"
  fi
}

need web/index.html
need OH-INF/addon/addon.xml
need META-INF/LICENSE
need META-INF/NOTICE

# a list is only a guard while it matches the tree, so a newly committed file has to join it
if [ -d "$root/web/public" ]; then
  printf '%s\n' "${public_files[@]}" | sort > "$work/public-declared"
  ( cd "$root/web/public" && find . -type f ! -path './icons/*' ! -path './fonts/*' ! -path './docs/*' | sed 's|^\./||' | sort ) > "$work/public-tree"
  comm -13 "$work/public-declared" "$work/public-tree" > "$work/public-unlisted"
  while IFS= read -r f; do
    bad "web/public/$f is not in public_files in tools/check-jar.sh"
  done < "$work/public-unlisted"
fi

check_files() {
  local label="$1" missing=0 f
  shift
  for f in "$@"; do
    if ! has "web/$f"; then
      bad "web/$f is missing"
      missing=1
    fi
  done
  [ "$missing" -ne 0 ] || note 'ok' "$# $label"
}

check_files 'files committed under web/public' "${public_files[@]}"
check_files 'staged fonts, icon licences and PWA files' "${built_files[@]}"

docs=()
for md in "$root"/docs/*.md; do
  [ -e "$md" ] || continue
  name=$(basename "$md" .md)
  docs+=("docs/$name.html")
done
if [ "${#docs[@]}" -eq 0 ]; then
  bad "no docs/*.md found beside tools/, so the docs pages cannot be checked"
else
  check_files 'docs pages' "${docs[@]}"
fi

# every icon the search index offers has to be there to draw
for pair in "${icon_floors[@]}"; do
  set_name=${pair%%:*}
  floor=${pair#*:}
  grep -E "^web/icons/$set_name/[^/]+\.svg\$" "$work/names" | sed -e "s|^web/icons/$set_name/||" -e 's/\.svg$//' | sort -u > "$work/svg-$set_name" || true
  count=$(wc -l < "$work/svg-$set_name")
  if [ "$count" -lt "$floor" ]; then
    bad "web/icons/$set_name holds $count icons, fewer than $floor"
    continue
  fi
  if ! has "web/icons/$set_name-index.json"; then
    bad "web/icons/$set_name-index.json is missing"
    continue
  fi
  unzip -p "$jar" "web/icons/$set_name-index.json" > "$work/index-$set_name.json"
  grep -oE '"[^"]*"' "$work/index-$set_name.json" | sed -e 's/^"//' -e 's/"$//' -e 's/|.*//' | sort -u > "$work/indexed-$set_name" || true
  indexed=$(wc -l < "$work/indexed-$set_name")
  comm -23 "$work/indexed-$set_name" "$work/svg-$set_name" > "$work/unbacked-$set_name"
  unbacked=$(wc -l < "$work/unbacked-$set_name")
  if [ "$indexed" -lt "$floor" ]; then
    bad "web/icons/$set_name-index.json offers $indexed icons, fewer than $floor"
  elif [ "$unbacked" -ne 0 ]; then
    bad "web/icons/$set_name-index.json offers $unbacked icons with no svg, such as $(head -3 "$work/unbacked-$set_name" | tr '\n' ' ')"
  else
    note 'ok' "web/icons/$set_name: $count icons, all $indexed in its index present"
  fi
done

if has web/index.html; then
  unzip -p "$jar" web/index.html > "$work/index.html"
  grep -oE '(src|href)="\./[^"]+"' "$work/index.html" | sed -e 's/^[a-z]*="\.\///' -e 's/"$//' | sort -u > "$work/index-refs" || true
  if ! grep -qE '^assets/index-[^/]+\.js$' "$work/index-refs"; then
    bad 'web/index.html names no assets/index-*.js bundle'
  fi
  refs=()
  while IFS= read -r r; do refs+=("$r"); done < "$work/index-refs"
  [ "${#refs[@]}" -eq 0 ] || check_files 'files web/index.html loads' "${refs[@]}"
fi

if has web/sw.js; then
  unzip -p "$jar" web/sw.js > "$work/sw.js"
  grep -oE 'url:"[^"]+"' "$work/sw.js" | sed -e 's/^url:"//' -e 's/"$//' > "$work/precache" || true
  # the manifest icons are listed twice, once from the glob and once from the manifest
  entries=$(wc -l < "$work/precache")
  if [ "$entries" -lt "$precache_floor" ]; then
    bad "web/sw.js precaches $entries entries, fewer than $precache_floor"
  fi
  grep -oE 'define\(\["\./workbox-[0-9a-f]+"' "$work/sw.js" | sed -e 's/^define(\["\.\///' -e 's/"$/.js/' >> "$work/precache" || true
  precached=()
  while IFS= read -r p; do precached+=("$p"); done < <(sort -u "$work/precache")
  [ "${#precached[@]}" -eq 0 ] || check_files "files the service worker precaches or imports ($entries entries)" "${precached[@]}"
fi

# a workbox module that ships has to be named in NOTICE, and vite.config.ts decides which ship
if has META-INF/NOTICE; then
  unzip -p "$jar" META-INF/NOTICE > "$work/NOTICE"
  # unzip exits 11 when one of the patterns matches nothing; the check below still sees the rest
  unzip -p "$jar" 'web/*.js' 'web/assets/*.js' > "$work/scripts.js" || true
  grep -oE 'workbox:[a-z-]+:' "$work/scripts.js" | sed -e 's/^workbox:/workbox-/' -e 's/:$//' | sort -u > "$work/workbox" || true
  if [ ! -s "$work/workbox" ]; then
    bad 'no workbox code in the jar'"'"'s scripts, so the service worker did not build'
  fi
  while IFS= read -r w; do
    if grep -qF "$w" "$work/NOTICE"; then
      note 'ok' "$w is named in NOTICE"
    else
      bad "$w ships in the jar but NOTICE does not name it"
    fi
  done < "$work/workbox"
fi

# build bookkeeping, not content
grep -E '\.stamp$' "$work/names" > "$work/stamps" || true
if [ -s "$work/stamps" ]; then
  bad "build stamps are in the jar: $(tr '\n' ' ' < "$work/stamps")"
else
  note 'ok' 'no build stamps'
fi

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
