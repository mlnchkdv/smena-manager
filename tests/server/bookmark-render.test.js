import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPublicPage } from '../../src/server/bookmark-render.js';
import { archiveBookmarkHtml } from '../../src/server/bookmark-html-archive.js';
import { fetchPublicRenderResource } from '../../src/server/web-page-fetch.js';

test('render broker refuses private resources before connecting', async () => {
  await assert.rejects(fetchPublicRenderResource('http://127.0.0.1/secret'), { code: 'PAGE_BLOCKED_ADDRESS' });
  await assert.rejects(fetchPublicRenderResource('file:///etc/passwd'), { code: 'PAGE_INVALID_URL' });
});
test('isolated capture preserves JS-generated text and a screenshot; archive strips scripts', { skip: process.env.SMENA_TEST_RENDER !== '1' }, async () => {
  const requested = [];
  const page = await renderPublicPage('https://render.example.test/', {
    fetchResource: async url => {
      requested.push(url);
      if (url !== 'https://render.example.test/') throw new Error('Denied resource');
      return {
        url,
        contentType: 'text/html',
        body: Buffer.from(
          '<!doctype html><title>Dynamic</title><main id="text"></main><script>document.getElementById("text").innerHTML="<h1>Rendered experiment</h1><p>Searchable results</p>";fetch("http://127.0.0.1/secret");</script>',
        ),
      };
    },
  });
  assert.match(page.html, /<h1>Rendered experiment<\/h1>/);
  assert.ok(Buffer.from(page.screenshot, 'base64').length > 1000);
  const archive = await archiveBookmarkHtml(page, {
    fetchAsset: async () => {
      throw new Error('Denied');
    },
  });
  assert.match(archive.html, /Searchable results/);
  assert.doesNotMatch(archive.document, /<script|127\.0\.0\.1/);
  assert.ok(requested.includes('http://127.0.0.1/secret'), 'all browser requests go through the broker');
});
