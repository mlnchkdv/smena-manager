import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverUploadSource, uploadSourceActions } from '../../src/shared/upload-sources.js';
import { fullUploadFingerprint } from '../../src/shared/upload-journal.js';

test('granted source handles recover after reload and verify contents rather than trusting the filename', async () => {
  const original = new File(['original'], 'large.mp4', { lastModified: 10 });
  let source = new File(['original'], 'large.mp4', { lastModified: 20 });
  const job = {
    name: original.name,
    bytes: original.size,
    lastModified: 10,
    fingerprint: await fullUploadFingerprint(original),
    sourceHandle: { kind: 'file', queryPermission: async () => 'granted', getFile: async () => source },
  };
  assert.equal((await recoverUploadSource(job)).file, source);
  source = new File(['modified'], 'large.mp4', { lastModified: 10 });
  assert.equal(await recoverUploadSource(job), null);
  assert.equal(await recoverUploadSource(job, { current: () => false }), null);
});

test('reload never prompts for disk permission; explicit access can recover and revocation remains safe', async () => {
  let prompts = 0,
    reads = 0;
  const source = new File(['x'], 'video.mp4', { lastModified: 1 });
  const job = {
    name: source.name,
    bytes: 1,
    lastModified: 1,
    sourceHandle: {
      kind: 'file',
      queryPermission: async () => 'prompt',
      requestPermission: async () => {
        prompts++;
        return 'granted';
      },
      getFile: async () => {
        reads++;
        return source;
      },
    },
  };
  assert.equal(await recoverUploadSource(job), null);
  assert.equal(prompts, 0);
  assert.equal(reads, 0);
  assert.ok(await recoverUploadSource(job, { requestAccess: true }));
  assert.equal(prompts, 1);
  job.sourceHandle.getFile = async () => {
    throw Error('disk removed');
  };
  assert.equal(await recoverUploadSource(job, { requestAccess: true }), null);
});

test('source recovery distinguishes permission, changed contents and unavailable originals without prompting on startup', async () => {
  const original = new File(['abc'], 'video.mp4', { lastModified: 1 });
  const statuses = [];
  let permission = 'prompt',
    source = original,
    missing = false,
    prompts = 0;
  const job = {
    name: original.name,
    bytes: original.size,
    lastModified: 1,
    fingerprint: await fullUploadFingerprint(original),
    sourceHandle: {
      kind: 'file',
      queryPermission: async () => permission,
      requestPermission: async () => {
        prompts++;
        return 'granted';
      },
      getFile: async () => {
        if (missing) throw new DOMException('Removed', 'NotFoundError');
        return source;
      },
    },
  };
  const recover = () => recoverUploadSource(job, { onStatus: value => statuses.push(value) });
  assert.equal(await recover(), null);
  assert.equal(statuses.pop(), 'permission');
  permission = 'denied';
  assert.equal(await recover(), null);
  assert.equal(statuses.pop(), 'denied');
  permission = 'granted';
  assert.ok(await recover());
  assert.deepEqual(statuses.splice(0), ['checking', 'ready']);
  source = new File(['xyz'], original.name, { lastModified: 1 });
  assert.equal(await recover(), null);
  assert.deepEqual(statuses.splice(0), ['checking', 'changed']);
  missing = true;
  assert.equal(await recover(), null);
  assert.equal(statuses.pop(), 'unavailable');
  assert.equal(prompts, 0);
  const controller = new AbortController();
  controller.abort();
  assert.equal(await recoverUploadSource(job, { signal: controller.signal, onStatus: value => statuses.push(value) }), null);
  assert.deepEqual(statuses, []);
});

test('recovery controls do not ask for reselection while checking or while browser access can recover a handle', () => {
  const handle = { kind: 'file' };
  const job = { phase: 'needs-file', sourceHandle: handle, sourceRecovery: 'permission' };
  assert.deepEqual(uploadSourceActions([{ ...job, sourceChecking: true }]), { access: false, reselect: false });
  assert.deepEqual(uploadSourceActions([job]), { access: true, reselect: false });
  assert.deepEqual(uploadSourceActions([{ ...job, sourceRecovery: 'denied' }]), { access: true, reselect: true });
  for (const sourceRecovery of ['changed', 'unavailable'])
    assert.deepEqual(uploadSourceActions([{ ...job, sourceRecovery }]), { access: false, reselect: true });
  assert.deepEqual(uploadSourceActions([{ phase: 'needs-file' }, { ...job, sourceChecking: true }]), { access: false, reselect: true });
  for (const phase of ['paused', 'uploading', 'done', 'cancelled'])
    assert.deepEqual(uploadSourceActions([{ ...job, phase }]), { access: false, reselect: false });
});
