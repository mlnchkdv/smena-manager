import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadDestination, restartUploadDestination } from '../../src/shared/upload-destination.js';

test('upload destinations distinguish folders and retain the last known path after removal', () => {
  const project = {
    id: 'p',
    name: 'Project',
    fileFolders: [
      { id: 'a', name: 'Videos' },
      { id: 'b', name: 'Shoot', parentId: 'a' },
    ],
  };
  const a = { project: 'p', folderId: 'a', name: 'video.mp4' },
    b = { ...a, folderId: 'b' };
  assert.notEqual(uploadDestination(a, project).key, uploadDestination(b, project).key);
  assert.equal(uploadDestination(b, project).path, 'Project / Videos / Shoot');
  b.destinationPath = uploadDestination(b, project).path;
  project.fileFolders[1].archived = true;
  assert.deepEqual(uploadDestination(b, project), { path: b.destinationPath, missing: true, task: '', key: '["","p","b",""]' });
});
test('changing a destination requires a stopped original source and discards the bound provider session', () => {
  const project = { name: 'P', fileFolders: [{ id: 'b', name: 'B' }] };
  const job = { phase: 'failed', folderId: 'gone', project: 'p', accepted: 42, pct: 80, session: { ticket: 'old', uploaded: { id: 'provider-file' } } };
  assert.throws(() => restartUploadDestination(job, 'b', project), /SOURCE_REQUIRED/);
  job.file = { name: 'video.mp4' };
  job.running = true;
  assert.throws(() => restartUploadDestination(job, 'b', project), /SOURCE_REQUIRED/);
  job.running = false;
  assert.throws(() => restartUploadDestination(job, 'gone', project), /FOLDER_INVALID/);
  assert.equal(job.accepted, 42);
  restartUploadDestination(job, 'b', project);
  assert.equal(job.session, null);
  assert.equal(job.accepted, 0);
  assert.equal(job.phase, 'paused');
  assert.equal(job.destinationPath, 'P / B');
});
