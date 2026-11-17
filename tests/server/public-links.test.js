import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { app } from '../../src/server/app.js';
import { createTrackedSession, getAccessProfiles } from '../../src/server/auth.js';
import { createEmptyDatabase, getWorkspaceDatabase, mutateWorkspaceDatabase, resetWorkspaceStore } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { PublicLinksRegistry } from '../../src/server/public-links-registry.js';

test('anonymous links expose only explicit targets, stream ranges, enforce live subtree access, revoke and expire', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-public-links-'));
  const saved = Object.fromEntries(
    ['DATABASE_PATH', 'UPLOADS_PATH', 'SESSION_SECRET', 'ACCESS_IDS_JSON', 'SMENA_PUBLIC_LINKS_ENABLED'].map(key => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    DATABASE_PATH: path.join(directory, 'workspace.json'),
    UPLOADS_PATH: path.join(directory, 'uploads'),
    SESSION_SECRET: 'test-public-links-secret-more-than-32-characters',
    SMENA_PUBLIC_LINKS_ENABLED: 'true',
    ACCESS_IDS_JSON: JSON.stringify([
      { id: 'owner', email: 'owner@example.test', name: 'Owner', role: 'admin', accessId: 'owner-public-link-test', active: true },
      { id: 'editor', email: 'editor@example.test', name: 'Editor', role: 'editor', accessId: 'editor-public-link-test', active: true },
      { id: 'viewer', email: 'viewer@example.test', name: 'Viewer', role: 'viewer', accessId: 'viewer-public-link-test', active: true },
    ]),
  });
  resetStorageProvider();
  resetWorkspaceStore();
  const data = {
    ...createEmptyDatabase(),
    me: 'owner',
    ws: { name: 'Test', url: 'test' },
    members: [
      { id: 'owner', email: 'owner@example.test', role: 'Owner', status: 'active', name: 'Owner' },
      { id: 'editor-member', email: 'editor@example.test', role: 'Member', status: 'active', name: 'Editor' },
      { id: 'viewer', email: 'viewer@example.test', role: 'Guest', status: 'active', name: 'Viewer' },
    ],
    projects: [
      {
        id: 'p1',
        name: 'Project',
        members: ['owner'],
        fileFolders: [
          { id: 'root', name: 'Shared files' },
          { id: 'child', name: 'Child', parentId: 'root' },
          { id: 'private', name: 'Private folder' },
        ],
      },
      { id: 'p2', name: 'Private project', access: 'private', members: ['owner'] },
    ],
    knowledgeFolders: [
      { id: 'notes', name: 'Shared notes' },
      { id: 'nested', name: 'Nested', parentId: 'notes' },
      { id: 'other', name: 'Private notes' },
    ],
    knowledgeNotes: [
      {
        id: 'note',
        title: 'Hello / Привет',
        folderId: 'notes',
        formatted_markdown:
          '# Hello\n\nText / Текст\n\n<script>alert(1)</script><img src="https://tracker.example/a" onerror="alert(2)"><a href="javascript:alert(3)">bad</a>\n\n[external](https://example.test)',
        history: [{ formatted_markdown: 'private old version' }],
        assets: { 'private.png': 'private-file' },
      },
      { id: 'nested-note', title: 'Nested note', folderId: 'nested', formatted_markdown: 'nested text' },
      { id: 'private-note', title: 'Secret title', folderId: 'other', formatted_markdown: 'private text' },
      ...Array.from({ length: 55 }, (_, i) => ({
        id: `page-${i}`,
        title: `Page ${String(i).padStart(2, '0')}`,
        folderId: 'notes',
        formatted_markdown: 'synthetic',
      })),
    ],
    files: [
      { id: 'file', name: 'hello.txt', project: 'p1', folderId: 'child', storageName: 'hello.txt', mimeType: 'text/plain', bytes: 16 },
      { id: 'private-file', name: 'secret.txt', project: 'p1', folderId: 'private', storageName: 'secret.txt', mimeType: 'text/plain', bytes: 6 },
    ],
  };
  await getStorageProvider().uploadFile('hello.txt', Buffer.from('0123456789abcdef'));
  await getStorageProvider().uploadFile('secret.txt', Buffer.from('secret'));
  await getStorageProvider().saveDatabase(data);
  const sessions = await Promise.all(getAccessProfiles().map(profile => createTrackedSession(profile, { get: () => '' }, 'access_id')));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const manage = (method, suffix = '', body, session = sessions[0]) =>
    fetch(origin + '/api/public-links' + suffix, {
      method,
      headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json', 'X-Smena-Workspace': 'default' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const create = async (kind, targetId, projectId = null, session) => {
    const response = await manage('POST', '', { kind, targetId, projectId, expiresInDays: 7, locale: 'ru' }, session);
    assert.equal(response.status, 201, await response.clone().text());
    return response.json();
  };
  const change = async operation => {
    const baseline = await getWorkspaceDatabase();
    await mutateWorkspaceDatabase(value => {
      operation(value);
      return value;
    }, baseline.revision);
  };
  try {
    assert.equal((await fetch(origin + '/api/public-links')).status, 401);
    const viewerDenied = await manage('POST', '', { kind: 'note', targetId: 'note' }, sessions[2]);
    assert.equal(viewerDenied.status, 403, await viewerDenied.text());
    assert.equal((await manage('POST', '', { kind: 'file', targetId: 'file', projectId: 'p2' }, sessions[1])).status, 404);
    const note = await create('note', 'note');
    const publicPage = await fetch(origin + note.path);
    assert.equal(publicPage.status, 200);
    assert.equal(publicPage.headers.get('access-control-allow-origin'), '*');
    assert.match(publicPage.headers.get('content-security-policy'), /script|default-src 'none'/);
    const html = await publicPage.text();
    assert.match(html, /lang="ru"/);
    assert.match(html, /Hello/);
    assert.ok(!/<script|<img|onerror=|href="javascript:/i.test(html));
    assert.ok(!html.includes('private old version') && !html.includes('private-file'));
    const raw = await fetch(origin + note.path + '&format=markdown');
    assert.match(raw.headers.get('content-type'), /text\/plain/);
    assert.match(await raw.text(), /Текст/);
    const structured = await (await fetch(origin + note.path + '&format=json')).json();
    assert.deepEqual(Object.keys(structured).sort(), ['content_markdown', 'id', 'title']);
    assert.equal((await fetch(origin + note.path.replace(/\.[\w-]{43}/, '.' + 'x'.repeat(43)))).status, 404);
    assert.equal((await fetch(origin + note.path.replace('?lang=ru', '/note/private-note'))).status, 404);
    const file = await create('file', 'file', 'p1');
    const range = await fetch(origin + file.path, { headers: { Range: 'bytes=3-8' } });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), '345678');
    assert.equal(range.headers.get('content-range'), 'bytes 3-8/16');
    const head = await fetch(origin + file.path, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '16');
    assert.equal(await head.text(), '');
    assert.equal((await fetch(origin + file.path, { headers: { Range: 'bytes=99-' } })).status, 416);
    const folder = await create('file-folder', 'root', 'p1');
    const base = folder.path.split('?')[0];
    assert.equal((await fetch(origin + base + '/file/file')).status, 200);
    assert.equal((await fetch(origin + base + '/file/private-file')).status, 404);
    assert.equal((await fetch(origin + base + '/note/note')).status, 404);
    assert.equal((await fetch(origin + base + '?folder=private')).status, 404);
    const listing = await (await fetch(origin + base + '?format=json&folder=child')).json();
    assert.deepEqual(
      listing.items.map(row => row.id),
      ['file'],
    );
    assert.ok(!JSON.stringify(listing).includes('storageName'));
    const notes = await create('note-folder', 'notes', null, sessions[1]);
    const notesBase = notes.path.split('?')[0];
    const first = await (await fetch(origin + notesBase + '?format=json')).json();
    assert.equal(first.items.length, 50);
    assert.equal(first.nextOffset, 50);
    const second = await (await fetch(origin + notesBase + '?format=json&offset=50')).json();
    assert.equal(second.items.length, 7);
    assert.equal(second.nextOffset, null);
    assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, 57);
    assert.ok(!JSON.stringify(first).includes('Secret title'));
    assert.equal((await fetch(origin + notesBase + '/note/nested-note?format=markdown')).status, 200);
    assert.equal((await fetch(origin + notesBase + '/note/private-note')).status, 404);
    assert.equal((await fetch(origin + notesBase + '?folder=other')).status, 404);
    await change(value => {
      value.files.find(row => row.id === 'file').folderId = 'private';
      value.knowledgeNotes.find(row => row.id === 'nested-note').folderId = 'other';
    });
    assert.equal((await fetch(origin + base + '/file/file')).status, 404);
    assert.equal((await fetch(origin + notesBase + '/note/nested-note')).status, 404);
    assert.equal((await fetch(origin + file.path)).status, 200);
    await change(value => {
      Object.assign(
        value.files.find(row => row.id === 'file'),
        { project: 'p2', folderId: null },
      );
    });
    assert.equal((await fetch(origin + file.path)).status, 404);
    assert.equal((await manage('DELETE', '/' + notes.id, null, sessions[2])).status, 404);
    assert.equal((await manage('DELETE', '/' + notes.id, null, sessions[1])).status, 200);
    assert.equal((await fetch(origin + notes.path)).status, 404);
    const ownLinks = await (await manage('GET', '?kind=note&targetId=note')).json();
    assert.equal(ownLinks.links[0].path, note.path);
    const privateRegistry = await fs.readFile(path.join(directory, 'smena-manager-public-links.json'), 'utf8');
    assert.ok(!privateRegistry.includes(note.path.split('/').at(-1).split('?')[0]));
    await manage('DELETE', '/' + note.id);
    assert.equal((await fetch(origin + note.path)).status, 404);
    await change(value => {
      value.knowledgeNotes[0].title = 'Restored content';
    });
    assert.equal((await fetch(origin + note.path)).status, 404);
    let now = Date.now();
    const registry = new PublicLinksRegistry({ provider: () => getStorageProvider(), now: () => now });
    const expiring = await registry.create(
      'default',
      { kind: 'note', targetId: 'note', projectId: null },
      { id: 'owner' },
      { id: 'owner' },
      { expiresInDays: 1 },
    );
    now += 86400001;
    await assert.rejects(registry.verify(expiring.path.split('/').at(-1).split('?')[0]), { statusCode: 404 });
    const memberLink = await create('note', 'note', null, sessions[1]);
    await change(value => {
      value.members.find(row => row.id === 'editor-member').status = 'deactivated';
    });
    assert.equal((await fetch(origin + memberLink.path)).status, 404);
    process.env.SMENA_PUBLIC_LINKS_ENABLED = 'false';
    assert.equal((await fetch(origin + expiring.path)).status, 503);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    resetStorageProvider();
    resetWorkspaceStore();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('smena-public-links-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
