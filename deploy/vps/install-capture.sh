#!/usr/bin/env bash
set -euo pipefail
# Explicit provisioning, never an application-startup download.
[[ ${EUID} -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
cd /srv/smena-manager/current
export PATH=/opt/smena-node/bin:/usr/bin:/bin
export PLAYWRIGHT_BROWSERS_PATH=/var/cache/smena-capture
node node_modules/playwright/cli.js install-deps chromium
install -d -o smena -g smena -m 0700 "$PLAYWRIGHT_BROWSERS_PATH"
runuser -u smena -- env PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" node node_modules/playwright/cli.js install chromium
echo 'Add PLAYWRIGHT_BROWSERS_PATH=/var/cache/smena-capture to the protected server env, then restart the application.'
