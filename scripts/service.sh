#!/usr/bin/env bash
# Manage a macOS launchd agent that keeps the MCP server running.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.appstore-connect-mcp"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
RUNNER="$ROOT/scripts/run-server.sh"
LOG_DIR="$ROOT/logs"

uid="$(id -u)"
domain="gui/${uid}"

usage() {
  cat <<EOF
Usage: npm run service -- <command>

Commands:
  install   Build, write LaunchAgent plist, and start
  start     Load / start the service
  stop      Unload / stop the service
  restart   Stop then start
  status    Show whether it is running
  uninstall Stop and remove the LaunchAgent plist
EOF
}

ensure_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "launchd service helpers only work on macOS." >&2
    exit 1
  fi
}

write_plist() {
  mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
  chmod +x "$RUNNER"

  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUNNER}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/mcp.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/mcp.err.log</string>
</dict>
</plist>
EOF
  echo "Wrote ${PLIST}"
}

is_loaded() {
  launchctl print "${domain}/${LABEL}" >/dev/null 2>&1
}

cmd_install() {
  ensure_macos
  echo "Building…"
  (cd "$ROOT" && npm run build)
  write_plist
  cmd_start
  local port=3992
  if [[ -f "$ROOT/.env" ]]; then
    local from_env
    from_env="$(grep -E '^PORT=' "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"' || true)"
    if [[ -n "$from_env" ]]; then
      port="$from_env"
    fi
  fi
  echo "Installed. MCP URL: http://localhost:${port}/mcp"
}

cmd_start() {
  ensure_macos
  if [[ ! -f "$PLIST" ]]; then
    write_plist
  fi
  chmod +x "$RUNNER"
  if is_loaded; then
    launchctl kickstart -k "${domain}/${LABEL}"
    echo "Restarted ${LABEL}"
  else
    launchctl bootstrap "$domain" "$PLIST"
    echo "Started ${LABEL}"
  fi
}

cmd_stop() {
  ensure_macos
  if is_loaded; then
    launchctl bootout "${domain}/${LABEL}"
    echo "Stopped ${LABEL}"
  else
    echo "${LABEL} is not running"
  fi
}

cmd_restart() {
  cmd_stop || true
  cmd_start
}

cmd_status() {
  ensure_macos
  if is_loaded; then
    echo "${LABEL}: running"
    launchctl print "${domain}/${LABEL}" 2>/dev/null | grep -E 'state =|pid =|path =' || true
  else
    echo "${LABEL}: not running"
    exit 1
  fi
}

cmd_uninstall() {
  ensure_macos
  cmd_stop || true
  if [[ -f "$PLIST" ]]; then
    rm -f "$PLIST"
    echo "Removed ${PLIST}"
  else
    echo "No plist at ${PLIST}"
  fi
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    install) cmd_install ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    uninstall) cmd_uninstall ;;
    ""|-h|--help|help) usage ;;
    *)
      echo "Unknown command: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
