#!/usr/bin/env bash
# Finish the content pipeline end to end: verify → fix cards → regenerate thin
# concepts → verify them → finalize. Safe to re-run (every step skips done work).
set -uo pipefail
cd "$(dirname "$0")/../.."
C="pnpm -s content"
REPORT=content/.pipeline/finalize-report.txt

$C verify --direct --concurrency 10
$C fix-cards --concurrency 10
$C finalize

# Concepts with < 2 valid questions: regenerate once, then verify again.
thin=$(grep -oE "regenerar \(pnpm content gen --concepts [a-z0-9-]+\)" "$REPORT" | sed -E 's/.*--concepts ([a-z0-9-]+)\)/\1/' | paste -sd, -)
if [[ -n "$thin" ]]; then
  echo "Regenerando: $thin"
  for id in ${thin//,/ }; do rm -f content/.pipeline/verify/"$id".*.json; done
  $C gen --direct --concurrency 10 --concepts "$thin"
  $C verify --direct --concurrency 10 --concepts "$thin"
  $C fix-cards --concurrency 10 --concepts "$thin"
  $C finalize
fi
$C status
