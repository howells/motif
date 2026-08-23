#!/bin/sh
#
# Regenerate every example image in docs/tools/examples/ through the real CLI.
#
# COST: roughly $1.70 for the full set. About $1.16 of that is priceable before
# the call - five generations at $0.15, plus the flat-priced tools. The rest is
# metered or per-megapixel (patina, topaz-restore, the preprocessors) and cannot
# be known until it runs. The dry-run pass below prints the priceable subtotal;
# treat it as a floor, never as the bill.
#
# This spends real credits. It refuses to run without --yes-spend-credits, and
# it always prices the whole set first.
#
#   sh docs/tools/regenerate.sh                       # dry run, prices only
#   sh docs/tools/regenerate.sh --yes-spend-credits   # actually spend
#
# Requires: motif on PATH, FAL_KEY set, jq.
#
# The checked-in images are resized to 1400px on the long edge for the web.
# This script writes what the CLI returns; resize afterwards if you are
# replacing the committed set.

set -eu

CONFIRM=""
case "${1:-}" in
  "") ;;
  --yes-spend-credits) CONFIRM=1 ;;
  *) echo "Unknown argument: $1 (expected --yes-spend-credits)" >&2; exit 2 ;;
esac

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUT="$DIR/examples"

command -v motif >/dev/null 2>&1 || { echo "motif is not on PATH" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is not on PATH" >&2; exit 1; }

mkdir -p "$OUT" "$OUT/segment" "$OUT/layers" "$OUT/pbr"

# -- Prompts for the five sources ------------------------------------------

P_APOTHECARY="editorial still life, three amber glass apothecary bottles of \
descending height and a white ceramic bowl on a travertine shelf, raking \
afternoon sunlight casting long shadows on a warm plaster wall, muted palette"

P_INTERIOR="a minimal interior, pale oak bench with a linen throw draped over \
one end, a pair of cream stoneware vases with dried branches, herringbone oak \
floor, soft plaster wall, a hard diagonal of sunlight"

P_LINEN="macro photograph of natural linen weave, soft folds running \
diagonally, undyed oatmeal colour, even daylight, visible warp and weft"

P_VESSEL="a ribbed cream stoneware vessel centred on a pale marble plinth, \
warm plaster background, single soft directional light, deep quiet shadow"

P_LABEL="a letterpress label on deckle-edged handmade paper reading \
'SALVAGE & CO' in an olive serif capital, with 'BOTANICAL EXTRACT No. 04' \
beneath, laid flat on a white plaster surface, overhead light"

# -- Every step, as a single list ------------------------------------------
#
# Each line is a full motif invocation minus the dry-run flag. Sources first,
# because everything downstream reads them off disk.

steps() {
  cat <<STEPS
motif "$P_APOTHECARY" -m banana -a 16:9 -r 2K --no-open -o $OUT/source-apothecary.jpg
motif "$P_INTERIOR" -m banana -a 16:9 -r 2K --no-open -o $OUT/source-interior.jpg
motif "$P_LABEL" -m banana -a 16:9 -r 2K --no-open -o $OUT/source-label.jpg
motif "$P_LINEN" -m banana -a 1:1 -r 2K --no-open -o $OUT/source-linen.jpg
motif "$P_VESSEL" -m banana -a 1:1 -r 2K --no-open -o $OUT/source-vessel.jpg
motif segment "the white ceramic bowl" $OUT/source-apothecary.jpg --no-open -o $OUT/segment/
motif erase "the small amber bottle on the right of the group" $OUT/source-apothecary.jpg --no-open -o $OUT/out-erased.jpg
motif tool run finegrain-eraser $OUT/source-apothecary.jpg --prompt "the small amber bottle on the right of the group" -o $OUT/out-erased-finegrain.jpg
motif tool run depth-anything $OUT/source-interior.jpg -o $OUT/out-depth.jpg
motif tool run lineart $OUT/source-vessel.jpg -o $OUT/out-lineart.jpg
motif tool run bria-rmbg $OUT/source-vessel.jpg -o $OUT/out-nobg.png
motif enhance --restore $OUT/source-vessel.jpg --no-open -o $OUT/verb-enhanced.jpg
motif tool run ideogram-layerize-text $OUT/source-label.jpg -o $OUT/layers/
motif tool run patina $OUT/source-linen.jpg -o $OUT/pbr/
STEPS
}

# -- Pass 1: price everything ----------------------------------------------
#
# Runs before any spend, every time, confirmed or not. Verbs validate that the
# source file exists even in a dry run, so a first run on an empty examples/
# directory will report the downstream steps as invalid until the five sources
# are on disk. That is expected; the priced subtotal still covers the sources.

echo "Pricing the full set (no API calls)..."
echo

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
steps > "$TMP"

TOTAL=0
METERED=0
COUNT=0

while IFS= read -r step; do
  [ -n "$step" ] || continue
  COUNT=$((COUNT + 1))
  json=$(eval "$step --dry-run --format json" 2>/dev/null || true)
  cost=$(printf '%s' "$json" | jq -r '.estimatedCost // "null"' 2>/dev/null || echo null)
  label=$(printf '%s' "$step" | cut -c1-72)
  if [ "$cost" = "null" ] || [ -z "$cost" ]; then
    METERED=$((METERED + 1))
    printf '  %-74s %s\n' "$label" "metered"
  else
    TOTAL=$(awk -v a="$TOTAL" -v b="$cost" 'BEGIN { printf "%.4f", a + b }')
    printf '  %-74s $%s\n' "$label" "$cost"
  fi
done < "$TMP"

echo
printf 'Priceable subtotal: $%s across %s steps\n' "$TOTAL" "$COUNT"
printf 'Metered or per-unit steps with no up-front price: %s\n' "$METERED"
echo 'Metered is not free. The full set has run at roughly $1.70.'
echo

if [ -z "$CONFIRM" ]; then
  echo 'Dry run only. Re-run with --yes-spend-credits to generate for real.'
  exit 0
fi

# -- Pass 2: spend ---------------------------------------------------------

echo 'Generating for real. Several steps are queued and take minutes.'
echo

while IFS= read -r step; do
  [ -n "$step" ] || continue
  printf '→ %s\n' "$(printf '%s' "$step" | cut -c1-96)"
  eval "$step --format json --fields saved,path,files,cost,estimatedCost" || {
    echo "  step failed, continuing" >&2
  }
done < "$TMP"

echo
echo "Done. Files are in $OUT"
echo 'Resize to 1400px on the long edge before committing.'
