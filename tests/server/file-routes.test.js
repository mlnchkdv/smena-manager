import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { app } from '../../src/server/app.js';
import { createSession, getAccessProfiles } from '../../src/server/auth.js';
import { resetStorageProvider } from '../../src/server/storage/index.js';
import { getWorkspaceDatabase, replaceWorkspaceDatabase, resetWorkspaceStore } from '../../src/server/workspace-store.js';

test('authenticated editors can upload and range-download a workspace file', async t => {
  const directory = path.join(process.cwd(), '.data', 'tests', `file-routes-${process.pid}`);
  await fs.promises.rm(directory, { recursive: true, force: true });
  process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
  process.env.UPLOADS_PATH = path.join(directory, 'uploads');
  process.env.SESSION_SECRET = 'file-route-session-secret-that-is-long-enough';
  process.env.ACCESS_IDS_JSON = JSON.stringify([
    { id: 'm1', name: 'Editor', email: 'editor@example.test', role: 'editor', accessId: 'editor-file-access-id-value', active: true },
  ]);
  delete process.env.VERCEL;
  resetStorageProvider();
  resetWorkspaceStore();
  t.after(async () => {
    resetStorageProvider();
    resetWorkspaceStore();
    delete process.env.DATABASE_PATH;
    delete process.env.UPLOADS_PATH;
    delete process.env.SESSION_SECRET;
    delete process.env.ACCESS_IDS_JSON;
    await fs.promises.rm(directory, { recursive: true, force: true });
  });

  const initial = await getWorkspaceDatabase();
  const prepared = await replaceWorkspaceDatabase(
    {
      ...initial,
      ws: { name: 'Команда' },
      me: 'm1',
      members: [{ id: 'm1', name: 'Editor', email: 'editor@example.test' }],
      projects: [{ id: 'p1', name: 'Проект', members: ['m1'] }],
      tasks: [],
      files: [],
    },
    0,
  );
  const token = createSession(getAccessProfiles()[0]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const form = new FormData();
  form.append('file', new Blob(['0123456789'], { type: 'text/plain' }), 'notes.txt');
  form.append('revision', String(prepared.revision));
  form.append('project', 'p1');
  const uploadedResponse = await fetch(`${origin}/api/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  assert.equal(uploadedResponse.status, 201);
  const uploaded = await uploadedResponse.json();
  assert.equal(uploaded.file.name, 'notes.txt');
  assert.equal(uploaded.file.bytes, 10);
  assert.equal(uploaded.data.revision, 2);
  assert.ok(uploaded.file.storageFileId);

  const contentResponse = await fetch(`${origin}/api/files/${uploaded.file.id}/content`, {
    headers: { Authorization: `Bearer ${token}`, Range: 'bytes=2-5' },
  });
  assert.equal(contentResponse.status, 206);
  assert.equal(contentResponse.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await contentResponse.text(), '2345');

  const deletedResponse = await fetch(`${origin}/api/files/${uploaded.file.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: uploaded.data.revision }),
  });
  assert.equal(deletedResponse.status, 200);
  const deleted = await deletedResponse.json();
  assert.equal(deleted.data.revision, 3);
  assert.equal(deleted.data.files.length, 0);

  const missingResponse = await fetch(`${origin}/api/files/${uploaded.file.id}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(missingResponse.status, 404);
});
