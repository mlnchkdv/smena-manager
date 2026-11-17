import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { Readable } from 'node:stream';
import express from 'express';
import { fetchPublicImage, pageMetadata } from '../../src/server/web-page-fetch.js';
import { createBookmarkThumbnailLoader } from '../../src/server/bookmark-thumbnails.js';
import { createBookmarkPageRouter } from '../../src/server/bookmark-page-routes.js';
import { requireAuth } from '../../src/server/auth.js';
import { requireWorkspace } from '../../src/server/workspace-directory.js';
import { memberSharingFixture } from '../fixtures/member-sharing.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase } from '../../src/server/workspace-store.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB3sAAAAASUVORK5CYII=', 'base64');
const resolve = async () => [{ address: '93.184.216.34', family: 4 }];
function transport(body, contentType = 'image/png', redirect) {
  return {
    get(_url, options, ready) {
      assert.equal(options.headers.Cookie, undefined);
      assert.equal(options.headers.Authorization, undefined);
      options.lookup('example.com', { all: true }, (_error, records) => assert.equal(records[0].address, '93.184.216.34'));
      queueMicrotask(() => {
        const response = Readable.from([body]);
        response.statusCode = redirect ? 302 : 200;
        response.headers = { 'content-type': contentType, ...(redirect ? { location: redirect } : {}) };
        ready(response);
      });
      return new EventEmitter();
    },
  };
}

test('thumbnail metadata resolves relative images but discards credential and data URLs', () => {
  assert.equal(pageMetadata('<meta property="og:image" content="../cover.png">', 'https://example.com/docs/start').imageUrl, 'https://example.com/cover.png');
  assert.equal(
    pageMetadata('<meta name="twitter:image" content="https://cdn.example.com/a.png?a=1&amp;b=2">', 'https://example.com').imageUrl,
    'https://cdn.example.com/a.png?a=1&b=2',
  );
  for (const value of ['data:image/svg+xml,evil', 'javascript:alert(1)', 'https://user:secret@example.com/image'])
    assert.equal(pageMetadata(`<meta property="og:image" content="${value}">`, 'https://example.com').imageUrl, '');
});

test('image proxy bounds bytes, requires matching raster bytes and validates redirected addresses', async () => {
  const image = await fetchPublicImage('https://example.com/cover', { resolve, transport: transport(png) });
  assert.deepEqual(image.body, png);
  for (const [body, type] of [
    [Buffer.from('<svg onload="alert(1)"></svg>'), 'image/svg+xml'],
    [Buffer.from('<html>bad</html>'), 'image/png'],
    [png, 'image/jpeg'],
  ])
    await assert.rejects(fetchPublicImage('https://example.com/a', { resolve, transport: transport(body, type) }));
  await assert.rejects(fetchPublicImage('https://example.com/big', { resolve, transport: transport(Buffer.alloc(2 * 1024 * 1024 + 1)) }), {
    code: 'PAGE_TOO_LARGE',
  });
  await assert.rejects(
    fetchPublicImage('https://example.com/redirect', {
      resolve: async host => [{ address: host === 'example.com' ? '93.184.216.34' : '127.0.0.1', family: 4 }],
      transport: transport(png, 'image/png', 'http://127.0.0.1/private'),
    }),
    { code: 'PAGE_BLOCKED_ADDRESS' },
  );
});

test('thumbnail requests coalesce, cache failures and do not use arbitrary stored preview URLs', async () => {
  let pages = 0,
    images = 0,
    clock = 0;
  const load = createBookmarkThumbnailLoader({
    now: () => clock,
    fetchPage: async url => {
      pages++;
      return { html: '<meta property="og:image" content="/cover.png">', url };
    },
    fetchImage: async url => {
      images++;
      assert.equal(url, 'https://example.com/cover.png');
      return { body: png, contentType: 'image/png' };
    },
  });
  const bookmark = { url: 'https://example.com/', preview_image: 'http://127.0.0.1/private' };
  assert.equal((await Promise.all([load(bookmark), load(bookmark)]))[0].contentType, 'image/png');
  await load(bookmark);
  assert.equal(pages, 1);
  assert.equal(images, 1);
  clock = 3600001;
  await load(bookmark);
  assert.equal(pages, 2);
  let failures = 0;
  const fail = createBookmarkThumbnailLoader({
    fetchPage: async () => {
      failures++;
      throw new Error('Unavailable');
    },
  });
  assert.equal(await fail(bookmark), null);
  assert.equal(await fail(bookmark), null);
  assert.equal(failures, 1);
});

test('thumbnail endpoint requires authentication, workspace membership and the current account', async () => {
  const fixture = await memberSharingFixture();
  const current = await getWorkspaceDatabase();
  await mutateWorkspaceDatabase(
    data => {
      data.links = [{ id: 'public-source', url: 'https://example.com/' }];
      return data;
    },
    current.revision,
    { role: 'admin' },
  );
  let loads = 0;
  const app = express();
  app.use(
    requireAuth,
    requireWorkspace,
    createBookmarkPageRouter({
      loadThumbnail: async () => {
        loads++;
        return { body: png, contentType: 'image/png' };
      },
    }),
  );
  app.use((error, _request, response, next) => {
    void next;
    response.status(error.statusCode || 500).json({ code: error.code });
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const call = (url, auth = true) => fetch(origin + url, { headers: auth ? { Authorization: 'Bearer ' + fixture.sessions[1] } : {} });
  try {
    assert.equal((await call('/public-source/image', false)).status, 401);
    assert.equal((await call('/public-source/image?account=owner-profile')).status, 409);
    assert.equal((await call('/public-source/image?workspace=00000000-0000-4000-8000-000000000000')).status, 403);
    const result = await call('/public-source/image?account=member-profile&workspace=default');
    assert.equal(result.status, 200, await result.clone().text());
    assert.equal(result.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), png);
    assert.equal((await call('/missing/image')).status, 404);
    assert.equal(loads, 1);
  } finally {
    await new Promise(done => server.close(done));
    await fixture.cleanup();
  }
});
