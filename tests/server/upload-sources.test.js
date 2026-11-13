import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverUploadSource } from '../../src/shared/upload-sources.js';
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
