import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteSearchSource } from '../../src/shared/remote-search-source.js';
test('superseded searches abort in-flight work and late responses cannot publish results', async () => {
  const callbacks = [],
    pending = [],
    notices = [];
  const source = remoteSearchSource(
    (options, signal) => new Promise(resolve => pending.push({ options, signal, resolve })),
    () => notices.push('changed'),
    { schedule: run => (callbacks.push(run), callbacks.length - 1), cancel: () => {} },
  );
  const first = source.query('accountA:q1', '0', { q: 'q1' });
  const oldRun = callbacks[0]();
  const second = source.query('accountA:q2', '0', { q: 'q2' });
  assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve({ private: 'old' });
  await oldRun;
  assert.equal(first.data, undefined);
  assert.equal(notices.length, 0);
  const newRun = callbacks[1]();
  pending[1].resolve({ total: 1 });
  await newRun;
  assert.deepEqual(second.data, { total: 1 });
  assert.equal(notices.length, 1);
  assert.equal(source.query('accountA:q2', '0', {}), second);
  source.clear();
  assert.equal(pending[1].signal.aborted, true);
});
test('only eight current-scope pages are cached and clearing cancels scheduled work', () => {
  const stopped = [];
  const source = remoteSearchSource(
    () => {},
    () => {},
    { schedule: run => run, cancel: run => stopped.push(run) },
  );
  const first = source.query('scope', '0', {});
  for (let i = 1; i < 12; i++) source.query('scope', String(i), {});
  assert.equal(first.controller.signal.aborted, true);
  source.clear();
  assert.equal(stopped.length, 12);
});
