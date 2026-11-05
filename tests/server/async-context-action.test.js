import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsyncContextAction } from '../../src/shared/async-context-action.js';
test('lazy actions coalesce repeated activation, discard stale contexts and recover after a failed chunk', async () => {
  let context = 'a',
    resolve,
    opened = 0,
    errors = 0,
    fail = false;
  const states = [];
  const action = createAsyncContextAction({
    context: () => context,
    load: () =>
      fail
        ? Promise.reject(Error('chunk failed'))
        : new Promise(done => {
            resolve = done;
          }),
    apply: () => {
      opened++;
    },
    pending: value => states.push(value),
    failed: () => {
      errors++;
    },
  });
  const first = action();
  await action();
  context = 'b';
  resolve({});
  await first;
  assert.equal(opened, 0);
  fail = true;
  await action();
  assert.equal(errors, 1);
  fail = false;
  const retry = action();
  resolve({});
  await retry;
  assert.equal(opened, 1);
  assert.deepEqual(states, [true, false, true, false, true, false]);
});
