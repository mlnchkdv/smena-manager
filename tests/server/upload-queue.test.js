import test from 'node:test';
import assert from 'node:assert/strict';
import { createUploadQueue, uploadFingerprint, uploadFileKey } from '../../src/shared/upload-queue.js';
const tick = () => new Promise(resolve => setImmediate(resolve));

test('500-file queue keeps byte transfers bounded and returns all registrations', async () => {
  let running = 0,
    peak = 0;
  const queue = createUploadQueue({
    run: async job => {
      running++;
      peak = Math.max(peak, running);
      await tick();
      running--;
      return job.id;
    },
  });
  const result = await queue.add(Array.from({ length: 500 }, (_, i) => ({ id: String(i), bytes: 20 * 1024 ** 3 })));
  assert.equal(result.length, 500);
  assert.equal(peak, 2);
  assert.ok(queue.jobs.every(job => job.phase === 'done' && !job.file));
});
test('pausing queued work does not start it; resume completes it once', async () => {
  const calls = [];
  const queue = createUploadQueue({
    concurrency: 1,
    run: async job => {
      calls.push(job.id);
      return job.id;
    },
  });
  const batch = queue.add([
    { id: 'a', file: {} },
    { id: 'b', file: {} },
  ]);
  queue.pause(queue.jobs[0]);
  await tick();
  assert.deepEqual(calls, ['b']);
  queue.resume(queue.jobs[0]);
  assert.deepEqual(await batch, ['a', 'b']);
});
test('fast pause/resume cannot run the same File twice concurrently', async () => {
  let calls = 0,
    active = 0,
    peak = 0;
  const queue = createUploadQueue({
    run: async (job, signal) => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
      if (signal.aborted) throw new Error('paused');
      return job.id;
    },
  });
  const batch = queue.add([{ id: 'a', file: {} }]);
  await Promise.resolve();
  queue.pause(queue.jobs[0]);
  queue.resume(queue.jobs[0]);
  assert.deepEqual(await batch, ['a']);
  assert.equal(calls, 2);
  assert.equal(peak, 1);
});
test('failed work remains retryable and cancelling all jobs prevents queued starts', async () => {
  let fail = true;
  const queue = createUploadQueue({
    run: async job => {
      if (fail) throw new Error('offline');
      return job.id;
    },
  });
  assert.deepEqual(await queue.add([{ id: 'retry', file: {} }]), [null]);
  assert.equal(queue.jobs[0].phase, 'failed');
  fail = false;
  queue.resume(queue.jobs[0]);
  await tick();
  assert.equal(queue.jobs[0].phase, 'done');
  const cancelled = queue.add([
    { id: 'x', file: {} },
    { id: 'y', file: {} },
  ]);
  queue.jobs.filter(job => job.phase === 'queued').forEach(job => queue.cancel(job));
  assert.deepEqual(await cancelled, [null, null]);
  queue.clear();
  assert.equal(queue.jobs.length, 0);
});
test('restored metadata never uploads until original files are selected; queue cap is explicit', async () => {
  const queue = createUploadQueue({ limit: 2, run: () => assert.fail('no source file selected') });
  void queue.add([{ id: 'a' }, { id: 'b' }], { restored: true });
  await tick();
  assert.ok(queue.jobs.every(job => job.phase === 'needs-file'));
  assert.throws(() => queue.add([{ id: 'overflow' }]), /full/);
  queue.jobs.forEach(job => queue.cancel(job));
});
test('bulk controls notify once rather than redrawing a 500-file queue 500 times', async () => {
  let changes = 0;
  const queue = createUploadQueue({ changed: () => changes++, run: async () => null });
  void queue.add(
    Array.from({ length: 500 }, (_, i) => ({ id: i })),
    { restored: true },
  );
  changes = 0;
  queue.batch(() => queue.jobs.forEach(job => queue.cancel(job)));
  assert.equal(changes, 1);
});
test('source re-selection identity and sampled fingerprint detect changed files without reading whole videos', async () => {
  const a = new File(['original text'], 'source.txt', { lastModified: 42 });
  const b = new File(['changed text!'], 'source.txt', { lastModified: 42 });
  assert.equal(uploadFileKey(a), uploadFileKey(b));
  assert.notEqual(await uploadFingerprint(a), await uploadFingerprint(b));
  let read = 0;
  const huge = {
    size: 20 * 1024 ** 3,
    slice: (start, end = huge.size) => {
      read += end - start;
      return new Blob([new Uint8Array(end - start)]);
    },
  };
  await uploadFingerprint(huge);
  assert.equal(read, 128 * 1024);
});
