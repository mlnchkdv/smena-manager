#!/usr/bin/env bash
set -euo pipefail
# Repair the current managed release with the same provisioning as CI.
[[ ${EUID} -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
cd /srv/smena-manager/current
export PATH=/opt/smena-node/bin:/usr/bin:/bin
node --input-type=module <<'NODE'
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { provisionCaptureRuntime } from './deploy/vps/capture-runtime.mjs';
const release = await fs.realpath('/srv/smena-manager/current');
await provisionCaptureRuntime(release, process.execPath, (program, args) => {
  const result = spawnSync(program, args, {
    stdio: 'inherit',
    env: { PATH: '/opt/smena-node/bin:/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8' },
  });
  if (result.error || result.status !== 0) throw new Error('Capture provisioning failed.');
});
NODE
echo 'Capture runtime verified. The managed application uses /var/cache/smena-capture by default; no environment edit is required.'
