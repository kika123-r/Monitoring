#!/usr/bin/env bash
# Runs the full daily collection: scrapes all 8 working insurers across all
# 4 property profiles, rebuilds data/results/*.csv fresh, appends today's
# rows onto the growing master ledgers (data/master/*.xlsx), and rebuilds
# the visualization workbook (data/dashboard/Prehlad_cien_poistovne.xlsx).
# UNIQA is collected via a broker comparison widget (scripts/collect-uniqa.js)
# since its own calculator blocks direct automated access (see
# insurers/uniqa/capture/BLOCKED.md).
# Does NOT commit/push - the caller does that after reviewing the summary.
set -uo pipefail
cd /home/user/Monitoring

export COLLECTION_DATE="${COLLECTION_DATE:-$(date +%Y-%m-%d)}"
echo "=== Daily insurance price collection: $COLLECTION_DATE ==="

PROFILES=(byt-bratislava byt-kosice dom-male-dvorniky dom-vlckovce)
declare -A INSURER_NAMES=(
  [allianz]="Allianz"
  [colonnade]="Colonnade"
  [csob]="ČSOB Poisťovňa"
  [generali]="Generali"
  [komunalna]="KOMUNÁLNA poisťovňa"
  [kooperativa]="Kooperativa (Bezstarostný domov)"
  [union]="Union"
  [wustenrot]="Wüstenrot (W dobrom domov)"
  [uniqa]="UNIQA"
)

rm -f data/results/*.csv

declare -a OK=()
declare -a FAILED=()

for insurer in "${!INSURER_NAMES[@]}"; do
  for profile in "${PROFILES[@]}"; do
    echo "--- $insurer / $profile ---"
    success=0
    for attempt in 1 2; do
      if node "scripts/collect-${insurer}.js" "$profile"; then
        success=1
        break
      fi
      echo "  attempt $attempt failed, retrying in 10s..."
      sleep 10
    done
    if [ "$success" = "1" ]; then
      if node scripts/build-csv.js "$insurer" "$profile" "${INSURER_NAMES[$insurer]}"; then
        OK+=("$insurer/$profile")
      else
        FAILED+=("$insurer/$profile (build-csv failed)")
      fi
    else
      FAILED+=("$insurer/$profile (collector failed after retry)")
    fi
    sleep 5
  done
done

echo ""
echo "=== Collection done: ${#OK[@]} ok, ${#FAILED[@]} failed ==="
for f in "${FAILED[@]:-}"; do [ -n "$f" ] && echo "  FAILED: $f"; done

echo ""
echo "=== Appending to master ledgers ==="
python3.13 scripts/append-daily.py "${PROFILES[@]}"

echo ""
echo "=== Rebuilding dashboard ==="
python3.13 scripts/build-dashboard.py

echo ""
echo "=== Done ==="
