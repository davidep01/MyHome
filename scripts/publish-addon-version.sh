#!/bin/sh
set -eu
[ "${GITHUB_ACTIONS:-}" = true ] || { echo "Questo script è riservato al checkout CI." >&2; exit 1; }
release_version=${1:?versione richiesta}
node -e 'if (!/^2\.2\.[0-9]+$/.test(process.argv[1])) process.exit(1)' "$release_version"
for attempt in 1 2 3 4 5; do
  git fetch origin main
  # No force/reset: unexpected local edits cause checkout to fail safely.
  git checkout --detach refs/remotes/origin/main
  if node --input-type=module - "$release_version" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs'
const file = 'ha-addon/config.yaml'
const text = readFileSync(file, 'utf8')
const match = /^version:\s*["']?(\d+)\.(\d+)\.(\d+)["']?\s*$/m.exec(text)
if (!match) throw new Error('Versione manifest non valida')
const desired = process.argv[2].split('.').map(Number)
const current = match.slice(1).map(Number)
const compare = current.findIndex((number, index) => number !== desired[index])
if (compare === -1 || current[compare] > desired[compare]) process.exit(10)
writeFileSync(file, text.replace(/^version:.*$/m, `version: "${process.argv[2]}"`))
NODE
  then
    git add ha-addon/config.yaml
    git commit -m "chore: release $release_version [skip ci]"
    if git push origin HEAD:main; then
      [ -z "${GITHUB_OUTPUT:-}" ] || echo "applied=true" >> "$GITHUB_OUTPUT"
      exit 0
    fi
  else
    result=$?
    if [ "$result" = 10 ]; then
      [ -z "${GITHUB_OUTPUT:-}" ] || echo "applied=false" >> "$GITHUB_OUTPUT"
      exit 0
    fi
    exit "$result"
  fi
  # Another commit advanced main; refetch and reapply only our manifest edit.
  sleep 1
done
echo "Manifest non pubblicato dopo cinque tentativi; latest non viene modificato." >&2
exit 1
