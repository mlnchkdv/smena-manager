import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CONTENT_SECURITY_POLICY, CYTOSCAPE_STYLE_HASH, GOOGLE_BUTTON_STYLE_HASH, HTTP_SECURITY_HEADERS } from '../../src/shared/http-security.js';

test('application security headers restrict active and privileged browser content', () => {
  const directives = Object.fromEntries(
    CONTENT_SECURITY_POLICY.split('; ').map(directive => {
      const [name, ...values] = directive.split(' ');
      return [name, values.join(' ')];
    }),
  );
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /style-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /style-src-elem 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /style-src-attr 'unsafe-inline'/);
  assert.doesNotMatch(directives['style-src'], /'unsafe-inline'/);
  assert.doesNotMatch(directives['style-src-elem'], /'unsafe-inline'/);
  assert.ok(directives['style-src'].includes(GOOGLE_BUTTON_STYLE_HASH));
  assert.ok(directives['style-src-elem'].includes(GOOGLE_BUTTON_STYLE_HASH));
  assert.ok(directives['style-src'].includes(CYTOSCAPE_STYLE_HASH));
  assert.ok(directives['style-src-elem'].includes(CYTOSCAPE_STYLE_HASH));
  assert.doesNotMatch(directives['script-src'], /'unsafe-inline'|'unsafe-eval'/);
  assert.equal(directives['style-src-attr'], "'unsafe-inline'");
  assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'self'/);
  assert.equal(HTTP_SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.match(HTTP_SECURITY_HEADERS['Permissions-Policy'], /camera=\(\)/);
});

test('graph stylesheet authorization matches the installed Cytoscape renderer', () => {
  const source = fs.readFileSync(new URL('../../node_modules/cytoscape/src/extensions/renderer/base/index.mjs', import.meta.url), 'utf8');
  const className = source.match(/var className\s*=\s*'([^']+)'/)?.[1];
  assert.ok(className, 'Re-audit the renderer stylesheet after a Cytoscape update');
  assert.match(source, /stylesheet\.textContent = '\.'\+className\+' \{ position: relative; \}'/);
  const hash = createHash('sha256').update(`.${className} { position: relative; }`).digest('base64');
  assert.equal(CYTOSCAPE_STYLE_HASH, `'sha256-${hash}'`);
});

test('Vercel static responses use the same security headers as the API', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const configured = Object.fromEntries(config.headers.find(rule => rule.source === '/(.*)').headers.map(header => [header.key, header.value]));
  assert.deepEqual(configured, HTTP_SECURITY_HEADERS);
});
