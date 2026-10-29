import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/actions/actions.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('A.confirmOk ='), source.indexOf('IN.confirmText ='));
function fixture(modal) {
  const S = { ui: { modals: [modal], confirmText: 'Team' } };
  const context = { A: {}, S, render() {}, t: value => value };
  vm.runInNewContext(handler, context);
  return { S, run: context.A.confirmOk };
}

test('confirmed async operation stays visible, locks duplicate runs and releases before navigation', async () => {
  let finish;
  let calls = 0;
  const modal = {
    awaitRun: true,
    typeName: 'Team',
    beforeRun: () => true,
    run: () => {
      calls++;
      return new Promise(resolve => {
        finish = resolve;
      });
    },
  };
  const f = fixture(modal);
  modal.onSuccess = value => {
    assert.equal(value, '/next');
    assert.equal(f.S.ui.atomicOperation, false);
    assert.equal(f.S.ui.modals.length, 0);
  };
  const pending = f.run();
  assert.equal(modal.busy, true);
  assert.equal(f.S.ui.atomicOperation, true);
  assert.equal(f.S.ui.modals.length, 1);
  await f.run();
  assert.equal(calls, 1);
  finish('/next');
  await pending;
  assert.equal(modal.busy, false);
});

test('failure preserves confirmation and exposes a safe retry', async () => {
  const modal = {
    awaitRun: true,
    failureMessage: 'Try again',
    run: async () => {
      throw new Error('private server detail');
    },
  };
  const f = fixture(modal);
  await f.run();
  assert.equal(modal.error, 'Try again');
  assert.equal(modal.busy, false);
  assert.equal(f.S.ui.atomicOperation, false);
  assert.equal(f.S.ui.modals[0], modal);
  modal.run = async () => {};
  await f.run();
  assert.equal(f.S.ui.modals.length, 0);
});

test('unclean state or incorrect typed name prevents starting', async () => {
  let calls = 0;
  const modal = { awaitRun: true, typeName: 'Other', run: () => calls++ };
  const f = fixture(modal);
  await f.run();
  modal.typeName = 'Team';
  modal.beforeRun = () => false;
  await f.run();
  assert.equal(calls, 0);
  assert.equal(f.S.ui.atomicOperation, undefined);
});
