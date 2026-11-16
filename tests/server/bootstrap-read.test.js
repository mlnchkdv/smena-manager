import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapRead, bootstrapCopy } from '../../src/shared/bootstrap-read.js';

test('bootstrap timeout aborts its read and ignores a late result without retrying', async () => {
  let fire,
    resolve,
    signal,
    calls = 0,
    cleared = false;
  const result = bootstrapRead(
    s => {
      calls++;
      signal = s;
      return new Promise(done => {
        resolve = done;
      });
    },
    {
      setTimer: fn => {
        fire = fn;
        return 7;
      },
      clearTimer: id => {
        assert.equal(id, 7);
        cleared = true;
      },
    },
  );
  await Promise.resolve();
  fire();
  await assert.rejects(result, { code: 'BOOTSTRAP_READ_TIMEOUT' });
  assert.equal(signal.aborted, true);
  resolve('late');
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(cleared, true);
});
test('successful and rejected reads clear their deadline and preserve the original error', async () => {
  let clears = 0;
  const options = { setTimer: () => 1, clearTimer: () => clears++ };
  assert.equal(await bootstrapRead(async () => 'ready', options), 'ready');
  const error = Object.assign(new Error('account changed'), { staleSession: true });
  await assert.rejects(
    bootstrapRead(async () => {
      throw error;
    }, options),
    cause => cause === error,
  );
  assert.equal(clears, 2);
});
test('bootstrap messages distinguish sign-in, workspace and local drafts in both languages', () => {
  for (const language of ['en', 'ru']) {
    const messages = ['config', 'session', 'directory', 'workspace', 'drafts'].map(stage => bootstrapCopy(stage, language));
    assert.equal(new Set(messages).size, 5);
    assert.ok(messages.every(Boolean));
  }
});
