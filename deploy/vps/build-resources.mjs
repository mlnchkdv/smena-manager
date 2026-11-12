import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export async function assertBuildDisk(directory, statfs = fs.statfs) {
  const disk = await statfs(directory);
  const free = Number(disk.bavail) * Number(disk.bsize),
    total = Number(disk.blocks) * Number(disk.bsize);
  const required = Math.max(8 * 1024 ** 3, Math.ceil(total * 0.1));
  if (!Number.isFinite(free) || !Number.isFinite(total) || total <= 0 || free < required)
    throw Error('Insufficient build disk space. Keep at least 8 GiB and 10% free; review retained releases.');
  return { free, required };
}
export function buildInvocation(stage, program, args, env) {
  if (!path.isAbsolute(stage) || !path.isAbsolute(program) || !/^[a-zA-Z0-9/_.-]+$/.test(stage + program)) throw Error('Unsafe build path.');
  if (Object.keys(env).some(key => !['PATH', 'LANG', 'HOME', 'NODE_OPTIONS', 'VERCEL_GIT_COMMIT_SHA'].includes(key)))
    throw Error('Build environment must not contain production credentials.');
  return [
    '--quiet',
    '--wait',
    '--pipe',
    '--collect',
    '--unit=smena-build-' + randomUUID(),
    '--property=User=smena-build',
    '--property=Group=smena-build',
    '--property=WorkingDirectory=' + stage,
    '--property=MemoryHigh=2500M',
    '--property=MemoryMax=3G',
    '--property=MemorySwapMax=512M',
    '--property=CPUQuota=300%',
    '--property=TasksMax=256',
    '--property=RuntimeMaxSec=2700',
    '--property=KillMode=control-group',
    '--property=NoNewPrivileges=true',
    '--property=PrivateTmp=true',
    '--property=ProtectHome=true',
    '--property=ProtectSystem=strict',
    '--property=ReadWritePaths=' + stage + ' /var/lib/smena-build',
    ...Object.entries(env).map(([key, value]) => '--setenv=' + key + '=' + value),
    '--',
    program,
    ...args,
  ];
}
