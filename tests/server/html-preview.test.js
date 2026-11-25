import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { htmlPreviewDocument, decodeHtml, HTML_PREVIEW_CSP, INTERACTIVE_HTML_PREVIEW_CSP } from '../../src/server/html-preview.js';
import { app } from '../../src/server/app.js';
import { memberSharingFixture } from '../fixtures/member-sharing.js';

test('HTML exports preserve formatting inside a scriptless network-isolated document', () => {
  const html = htmlPreviewDocument(
    '<style>h1{color:red}</style><h1 onclick="alert(1)">Report</h1><script>alert(1)</script><iframe src="https://evil.test"></iframe><img src="https://evil.test/t"><a href="javascript:alert(1)">Go</a><form action="/api"><input></form>',
  );
  assert.match(html, /h1\{color:red\}/);
  assert.match(html, /<h1>Report<\/h1>/);
  assert.doesNotMatch(html, /onclick|<script|<iframe|<form|<input|https:\/\/evil|javascript:/);
  assert.match(HTML_PREVIEW_CSP, /sandbox; default-src 'none'; script-src 'none'/);
});

test('safe preview keeps local section links and presents unavailable destinations as text', () => {
  const html = htmlPreviewDocument(
    '<a href="#part">Contents</a><a href="#missing">Missing</a><a href="https://example.org">Outside</a><h2 id="part">Part</h2>',
  );
  assert.match(html, /<a href="#part">Contents<\/a>/);
  assert.match(html, /<span>Missing<\/span><span>Outside<\/span>/);
});
test('HTML decoding respects exported Cyrillic encodings and UTF-16 BOM', () => {
  const bytes = Buffer.concat([Buffer.from('<meta charset="windows-1251"><p>'), Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]), Buffer.from('</p>')]);
  assert.match(decodeHtml(bytes), /Привет/);
  assert.match(decodeHtml(Buffer.from('\ufeff<h1>Привет</h1>', 'utf16le')), /Привет/);
});

test('HTML preview requires the current account, project access and bounded stored bytes', async () => {
  const fixture = await memberSharingFixture({ htmlFile: true });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const call = (route, auth = true) => fetch(origin + route, { headers: auth ? { Authorization: 'Bearer ' + fixture.sessions[1] } : {} });
  try {
    const route = '/api/html-previews/file?account=member-profile';
    assert.equal((await call(route, false)).status, 401);
    assert.equal((await call('/api/html-previews/file?account=other-profile')).status, 409);
    const result = await call(route);
    assert.equal(result.status, 200, await result.clone().text());
    assert.equal(result.headers.get('content-security-policy'), HTML_PREVIEW_CSP);
    assert.match(await result.text(), /Saved report/);
    const interactiveUrl = origin + route + '&mode=interactive';
    assert.equal((await call(route + '&mode=interactive')).status, 403);
    const frameHeaders = { 'Sec-Fetch-Dest': 'iframe', 'Sec-Fetch-Site': 'same-origin', Authorization: 'Bearer ' + fixture.sessions[1] };
    const reader = await fetch(origin + route + '&reader=1', { headers: frameHeaders });
    const policy = reader.headers.get('content-security-policy');
    const nonce = /script-src 'nonce-([^']+)'/.exec(policy)?.[1];
    assert.ok(nonce);
    assert.doesNotMatch(policy, /allow-same-origin|script-src 'unsafe-inline'/);
    const document = await reader.text();
    assert.equal((document.match(/<script\b/g) || []).length, 1);
    assert.ok(document.includes(`nonce="${nonce}"`));
    const interactive = await fetch(interactiveUrl, { headers: frameHeaders });
    assert.equal(interactive.status, 200);
    assert.equal(interactive.headers.get('content-security-policy'), INTERACTIVE_HTML_PREVIEW_CSP);
    assert.match(INTERACTIVE_HTML_PREVIEW_CSP, /^sandbox allow-scripts;/);
    assert.doesNotMatch(INTERACTIVE_HTML_PREVIEW_CSP, /allow-same-origin|unsafe-eval/);
    assert.match(await interactive.text(), /<script>/);
    assert.equal((await fetch(interactiveUrl.replace('/file?', '/private-file?'), { headers: frameHeaders })).status, 404);
    assert.equal((await call('/api/html-previews/private-file?account=member-profile')).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fixture.cleanup();
  }
});
