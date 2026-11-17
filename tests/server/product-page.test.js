import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDocument } from 'htmlparser2';
import { findAll } from 'domutils';
import postcss from 'postcss';

const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('public product pages expose all capabilities without scripts and keep accessible isolated demos', async () => {
  for (const lang of ['ru', 'en']) {
    const html = await read('public/product' + (lang === 'en' ? '-en' : '') + '.html');
    const root = parseDocument(html);
    const elements = findAll(node => !!node.attribs, root.children);
    assert.equal(elements.find(node => node.name === 'html').attribs.lang, lang);
    assert.match(html, /smena\.team/);
    assert.doesNotMatch(html, /SMENA\.|Smena Manager|>Smena</);
    assert.equal(elements.filter(node => node.attribs['data-product-example']).length, 12);
    assert.equal(elements.filter(node => node.attribs.class === 'feature-story').length, 7);
    const ids = elements.map(node => node.attribs.id).filter(Boolean);
    assert.equal(ids.length, new Set(ids).size, 'no duplicate IDs across repeated examples');
    for (const node of elements.filter(node => node.name === 'dialog')) assert.ok(node.attribs['aria-label']);
    for (const node of elements.filter(node => node.name === 'script')) {
      assert.match(node.attribs.src, /^\/product(?:-theme)?\.js$/);
      assert.equal(node.children.length, 0, 'no inline scripts under the production CSP');
    }
    assert.ok(!elements.some(node => node.attribs['data-a']), 'demo cannot invoke production actions');
    for (const id of ['projects', 'files', 'knowledge', 'bookmarks', 'whiteboards', 'graph']) {
      const panel = elements.find(node => node.attribs.id === 'panel-' + id);
      assert.ok(panel);
      assert.equal(panel.attribs.hidden, undefined, 'all capabilities readable without JavaScript');
    }
  }
  const script = await read('public/product.js');
  assert.doesNotMatch(script, /\bfetch\s*\(|\/api\/|smena\.v1|\bimport\s/);
  assert.match(script, /lostpointercapture/);
  assert.match(script, /new ResizeObserver\(fit\)/);
});

test('public themes retain every native light and dark design token', async () => {
  const native = postcss.parse(await read('src/styles/tokens.css'));
  const product = postcss.parse(await read('public/product-system.css'));
  const declarations = tree => {
    const list = [];
    tree.walkDecls(decl => {
      if (decl.prop.startsWith('--')) list.push([decl.parent.selector, decl.prop, decl.value]);
    });
    return list;
  };
  const actual = new Set(declarations(product).map(row => row.join('|')));
  for (const row of declarations(native)) assert.ok(actual.has(row.join('|')), 'shared token: ' + row[1]);
  assert.match(await read('public/product-theme.js'), /smena\.product\.theme/);
});
