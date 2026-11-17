import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { fetchPublicPage, publicPageAddress, pageUrl, pageMetadata } from '../../src/server/web-page-fetch.js';
import { applyBookmarkMetadata, normalizedPageUrl } from '../../src/shared/bookmark-metadata.js';

test('page capture rejects local, private, mapped, reserved addresses and credential URLs', async () => {
  for (const ip of [
    '0.0.0.0',
    '127.0.0.1',
    '10.1.2.3',
    '100.100.100.200',
    '169.254.169.254',
    '172.20.0.1',
    '192.168.1.1',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2002:7f00:1::',
  ])
    assert.equal(publicPageAddress(ip), false, ip);
  for (const ip of ['93.184.216.34', '2606:4700:4700::1111']) assert.equal(publicPageAddress(ip), true);
  for (const url of ['file:///tmp/secret', 'http://user:pass@example.com', 'https://example.com:3001']) assert.throws(() => pageUrl(url));
  await assert.rejects(fetchPublicPage('https://example.com', { resolve: async () => [{ address: '127.0.0.1', family: 4 }] }), {
    code: 'PAGE_BLOCKED_ADDRESS',
  });
});

test('page fetch pins the validated address and validates every redirect before connecting', async () => {
  const connected = [];
  const transport = {
    get(url, options, ready) {
      connected.push(url.href);
      options.lookup(url.hostname, { all: true }, (_error, addresses) => assert.equal(addresses[0].address, '93.184.216.34'));
      assert.equal(options.headers['Accept-Encoding'], 'identity');
      assert.equal(options.headers.Cookie, undefined);
      queueMicrotask(() => {
        const response = Readable.from([]);
        response.statusCode = 302;
        response.headers = { location: 'http://127.0.0.1/admin' };
        ready(response);
      });
      return new EventEmitter();
    },
  };
  await assert.rejects(
    fetchPublicPage('https://example.com', {
      transport,
      resolve: async host => [{ address: host === 'example.com' ? '93.184.216.34' : '127.0.0.1', family: 4 }],
    }),
    { code: 'PAGE_BLOCKED_ADDRESS' },
  );
  assert.equal(connected.length, 1);
});

test('metadata handles Open Graph, Cyrillic and entities without active markup', () => {
  const page = pageMetadata(
    '<title>Fallback</title><meta property="og:title" content="Команда &amp; Team"><meta name="description" content="Research &amp; notes"><meta property="og:site_name" content="Smena">',
    'https://example.com/',
  );
  assert.equal(page.title, 'Команда & Team');
  assert.equal(page.description, 'Research & notes');
  assert.equal(page.siteName, 'Smena');
  assert.equal(pageMetadata('<title>Title &amp; more</title>', 'https://example.com/').title, 'Title & more');
});

test('autofill does not overwrite manual edits, populated drafts or stale URLs', () => {
  const baseline = { title: '', description: '' };
  const draft = { title: 'Manually typed while waiting', description: '' };
  assert.deepEqual(applyBookmarkMetadata(draft, { title: 'Remote title', description: 'Remote description' }, baseline), ['description']);
  assert.equal(draft.title, 'Manually typed while waiting');
  const existing = { title: 'Saved', description: 'Saved description' };
  assert.deepEqual(applyBookmarkMetadata(existing, { title: 'New', description: 'New' }, existing), []);
  assert.equal(normalizedPageUrl('example.com/path'), 'https://example.com/path');
  assert.equal(normalizedPageUrl('https://user:pass@example.com'), null);
});
