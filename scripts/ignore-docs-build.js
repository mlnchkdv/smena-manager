import { execFileSync } from 'node:child_process';

// Vercel: 0 skips publication, 1 builds. Compare the last successful deployment,
// not HEAD^, so a skipped/failed intervening commit cannot hide runtime changes.
let skip = false;
try {
  const base = process.env.VERCEL_GIT_PREVIOUS_SHA;
  const head = process.env.VERCEL_GIT_COMMIT_SHA;
  if (/^[a-f0-9]{40}$/i.test(base || '') && /^[a-f0-9]{40}$/i.test(head || '') && base !== head) {
    const paths = execFileSync('git', ['diff', '--name-only', '-z', base, head, '--'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0')
      .filter(Boolean);
    skip = paths.length > 0 && paths.every(path => path.startsWith('docs/') || /^[^/]+\.md$/i.test(path));
  }
} catch {
  // Unknown/shallow history must build. Manual same-commit redeploys also build.
}
console.log(skip ? 'Documentation only: keep the current app deployment.' : 'Application or unverified changes: build normally.');
process.exitCode = skip ? 0 : 1;
