#!/bin/sh
# ⚠️ THE SEEDING STEP EXISTS SO A FRESH DISK IS NOT AN EMPTY SITE.
# site/cache holds the pre-warmed reference readings. They are baked into the image and copied onto
# the mounted disk so a brand new deploy can answer for the reference wallets without spending a
# single API call.
#
# ⚠️ IT GATES ON A COMPLETION MARKER, NOT ON THE DIRECTORY BEING EMPTY. Gating on empty looks right
# and fails quietly: a container killed part way through the copy leaves a disk that is no longer
# empty, so the next boot decides there is nothing to do and the wallets that had not been copied yet
# are never seeded at all. Measured here at ~4,000 of 5,001 files when a boot was cut short.
#
# ⚠️ cp -n, SO A RESUMED SEED CAN NEVER OVERWRITE A LIVE READING. Filling the gaps is safe; copying
# a month-old baked reading over a fresh one is not.
#
# ⚠️ THE SEED PATH IS DERIVED, NOT TYPED. Hardcoding /app made this branch unreachable outside the
# container, so the test meant to prove it worked could never enter it.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
SEED="$DIR/site/cache"
MARK="$MIRROR_CACHE_DIR/.seeded"

mkdir -p "$MIRROR_LISTS_DIR" "$MIRROR_CACHE_DIR"

if [ -d "$SEED" ] && [ ! -f "$MARK" ]; then
  echo "seeding the pre-warmed cache from $SEED"
  cp -n "$SEED"/*.json "$MIRROR_CACHE_DIR"/ 2>/dev/null || true
  touch "$MARK"                       # written LAST, so an interrupted copy is retried next boot
  echo "seeded, disk now holds $(ls -1 "$MIRROR_CACHE_DIR"/*.json 2>/dev/null | wc -l) readings"
else
  echo "already seeded, disk holds $(ls -1 "$MIRROR_CACHE_DIR"/*.json 2>/dev/null | wc -l) readings"
fi

# a hook for checking the seeding without starting the server; the server is the normal path
[ -n "$MIRROR_SEED_ONLY" ] && exit 0

exec node "$DIR/site/server_v2.cjs"
