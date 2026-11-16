import test from 'node:test';
import assert from 'node:assert/strict';
import { registerLazyActions } from '../../src/shared/lazy-actions.js';
test('lazy actions fence account/workspace/dialog changes and preserve newer feature handlers', async () => {
  const tables = { A: {} };
  let resolve,
    owner = 'one',
    modal = null,
    calls = 0;
  registerLazyActions(
    tables,
    { A: ['edit', 'copy'] },
    { load: () => new Promise(r => (resolve = r)), identity: () => owner, dialog: () => modal, onError: () => assert.fail('Unexpected error') },
  );
  const action = tables.A.edit();
  owner = 'two';
  resolve({ handlers: { A: { edit: () => ++calls, copy: () => ++calls } } });
  await action;
  assert.equal(calls, 0);
  tables.A.copy = () => 42;
  assert.equal(await tables.A.edit(), 1);
  assert.equal(tables.A.copy(), 42);
  const next = { A: {} };
  let finish;
  registerLazyActions(next, { A: ['open'] }, { load: () => new Promise(r => (finish = r)), identity: () => owner, dialog: () => modal, onError: () => {} });
  const pending = next.A.open();
  modal = {};
  finish({ handlers: { A: { open: () => ++calls } } });
  await pending;
  assert.equal(calls, 1);
});
test('a failed lazy action exposes recovery and does not poison the loader promise', async () => {
  const tables = { A: {} };
  let attempts = 0,
    errors = 0;
  registerLazyActions(
    tables,
    { A: ['run'] },
    {
      load: async () => {
        if (++attempts === 1) throw Error('offline');
        return { handlers: { A: { run: () => 9 } } };
      },
      identity: () => 1,
      dialog: () => null,
      onError: () => ++errors,
    },
  );
  await tables.A.run();
  assert.equal(errors, 1);
  assert.equal(await tables.A.run(), 9);
  assert.equal(attempts, 2);
});
