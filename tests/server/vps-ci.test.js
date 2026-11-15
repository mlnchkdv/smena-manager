import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCiCommand, checkedCiDeployment } from '../../deploy/vps/ci-policy.mjs';

const sha = 'a'.repeat(40);
test('CI SSH requests reject shells, substitutions, flags, abbreviated SHAs and extra arguments', () => {
  assert.deepEqual(parseCiCommand('status'), { action: 'status' });
  assert.deepEqual(parseCiCommand(`deploy ${sha}`), { action: 'deploy', sha });
  for (const value of [
    null,
    '',
    'bash',
    'sh -c id',
    'deploy main',
    'deploy ' + 'A'.repeat(40),
    `deploy ${sha};id`,
    `deploy ${sha}\n`,
    `deploy ${sha} extra`,
    `deploy $(id)`,
  ])
    assert.throws(() => parseCiCommand(value));
});
function fixture(options = {}) {
  const calls = [];
  return {
    calls,
    ops: {
      clean: async () => options.clean !== false,
      fetchMain: async () => calls.push('fetch'),
      mainCommit: async () => options.tip || sha,
      fastForwardAllowed: async () => options.fastForward !== false,
      fastForward: async () => calls.push('merge'),
      deploy: async () => {
        calls.push('deploy');
        if (options.fail) throw new Error('build/activation failed');
      },
      verify: async () => calls.push('verify'),
    },
  };
}
test('CI skips superseded commits and refuses dirty or rewritten history before switching releases', async () => {
  for (const options of [{ clean: false }, { fastForward: false }]) {
    const { ops, calls } = fixture(options);
    await assert.rejects(checkedCiDeployment(sha, ops));
    assert.equal(calls.includes('deploy'), false);
  }
  const { ops, calls } = fixture({ tip: 'b'.repeat(40) });
  assert.equal((await checkedCiDeployment(sha, ops)).status, 'superseded');
  assert.deepEqual(calls, ['fetch']);
});
test('CI confirms the exact requested release only after the existing transactional updater succeeds', async () => {
  const success = fixture();
  assert.deepEqual(await checkedCiDeployment(sha, success.ops), { status: 'deployed', commit: sha });
  assert.deepEqual(success.calls, ['fetch', 'merge', 'deploy', 'verify']);
  const failed = fixture({ fail: true });
  await assert.rejects(checkedCiDeployment(sha, failed.ops));
  assert.equal(failed.calls.includes('verify'), false);
});
