#!/usr/bin/env bash
# Wrapper used by launchd so nvm / Homebrew Node still resolve.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
fi

if [[ -x /opt/homebrew/bin/node ]]; then
  export PATH="/opt/homebrew/bin:$PATH"
elif [[ -x /usr/local/bin/node ]]; then
  export PATH="/usr/local/bin:$PATH"
fi

if [[ ! -f "$ROOT/dist/index.js" ]]; then
  echo "dist/index.js missing — run: npm run build" >&2
  exit 1
fi

exec node "$ROOT/dist/index.js"
