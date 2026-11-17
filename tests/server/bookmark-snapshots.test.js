import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { memberSharingFixture } from '../fixtures/member-sharing.js';
import { createBookmarkPageRouter } from '../../src/server/bookmark-page-routes.js';
import { requireAuth } from '../../src/server/auth.js';
import { requireWorkspace } from '../../src/server/workspace-directory.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase } from '../../src/server/workspace-store.js';
import { getStorageProvider } from '../../src/server/storage/index.js';
import { readBookmarkSnapshot } from '../../src/server/bookmark-snapshots.js';
import { writeRecoveryBundle } from '../../src/server/recovery-bundle.js';

test('member captures immutable page versions; reads survive source disappearance, reload and recovery export', async () => {
  const fixture = await memberSharingFixture();
  // Drive's optimized metadata path correctly refuses new physical references.
  // Archive writes must register their blob through the canonical catalog path.
  const provider = getStorageProvider();
  provider.loadDatabaseMetadata = async () => {
    throw Object.assign(new Error('New physical references need a catalog write.'), { code: 'METADATA_WRITE_FORBIDDEN', statusCode: 403 });
  };
  provider.saveDatabaseMetadata = async () => {
    throw new Error('A page archive is not a metadata-only patch.');
  };
  let requests = 0,
    unavailable = false;
  const qa = express();
  qa.use(express.json());
  qa.use(requireAuth);
  qa.use(requireWorkspace);
  qa.use(
    '/pages',
    createBookmarkPageRouter({
      fetchAsset: async () => {
        throw new Error('Unavailable synthetic resource');
      },
      fetchPage: async url => {
        requests++;
        if (unavailable) throw new Error('Source removed');
        return {
          url,
          html: `<title>Version ${requests}</title><article><h1>Version ${requests}</h1><p>Saved text</p></article><script>alert(1)</script><img src="https://tracker.example"><nav>Navigation</nav>`,
        };
      },
    }),
  );
  qa.use((error, _request, response, next) => {
    void next; // Express recognizes error handlers by their four-argument signature.
    response.status(error.statusCode || 500).json({ code: error.code });
  });
  const server = qa.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const call = (route, method = 'GET', actor = 1) =>
    fetch(origin + '/pages' + route, { method, headers: actor == null ? {} : { Authorization: 'Bearer ' + fixture.sessions[actor] } });
  try {
    const current = await getWorkspaceDatabase();
    await mutateWorkspaceDatabase(
      data => {
        data.links = [{ id: 'page', title: 'Test page', url: 'https://example.com' }];
        return data;
      },
      current.revision,
      { role: 'admin' },
    );
    assert.equal((await call('/page/snapshots', 'POST', null)).status, 401);
    assert.equal((await call('/missing/snapshots', 'POST')).status, 404);
    const firstResponse = await call('/page/snapshots', 'POST');
    assert.equal(firstResponse.status, 201, await firstResponse.clone().text());
    const first = await firstResponse.json();
    assert.doesNotMatch(first.page.html, /script|tracker|Navigation|onclick/);
    const secondResponse = await call('/page/snapshots', 'POST');
    assert.equal(secondResponse.status, 201, await secondResponse.clone().text());
    const second = await secondResponse.json();
    assert.notEqual(first.snapshot.id, second.snapshot.id);
    unavailable = true;
    assert.equal((await call('/page/preview', 'POST')).status, 422);
    const beforeRead = requests;
    const saved = await call('/page/snapshots/' + first.snapshot.id);
    assert.equal(saved.status, 200);
    assert.match((await saved.json()).html, /Version 1/);
    assert.equal(requests, beforeRead, 'opening the old copy does not contact the source');
    const document = await call('/page/snapshots/' + first.snapshot.id + '/document');
    assert.equal(document.status, 200);
    assert.match(document.headers.get('content-security-policy'), /sandbox; default-src 'none'/);
    assert.match(await document.text(), /Version 1/);
    assert.equal(requests, beforeRead, 'opening archived HTML does not contact the source');
    assert.equal((await call('/page/snapshots/' + first.snapshot.id + '/document', 'GET', null)).status, 401);
    const download = await call('/page/snapshots/' + first.snapshot.id + '/document?download=1');
    assert.match(download.headers.get('content-disposition'), /attachment; filename="smena-page-/);
    const database = await getWorkspaceDatabase();
    assert.equal(database.links[0].pageSnapshots.length, 2);
    assert.equal(database._fileRegistry['id:' + first.snapshot.storageFileId].storageName, first.snapshot.storageName);
    await assert.rejects(readBookmarkSnapshot(getStorageProvider(), 'another-workspace', database.links[0], first.snapshot.id), {
      code: 'PAGE_SNAPSHOT_UNAVAILABLE',
    });
    const output = new PassThrough();
    const chunks = [];
    output.on('data', chunk => chunks.push(chunk));
    await writeRecoveryBundle(database, getStorageProvider(), output);
    const bundle = JSON.parse(Buffer.concat(chunks).toString());
    assert.ok(bundle.assets.some(asset => asset.key === 'id:' + first.snapshot.storageFileId));
    assert.match(Buffer.from(bundle.assets.find(asset => asset.key === 'id:' + first.snapshot.storageFileId).base64, 'base64').toString(), /Version 1/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fixture.cleanup();
  }
});
