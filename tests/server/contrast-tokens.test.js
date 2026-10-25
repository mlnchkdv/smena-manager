import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const luminance = hex =>
  hex
    .slice(1)
    .match(/../g)
    .map(x => parseInt(x, 16) / 255)
    .map(x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
test('small metadata text keeps contrast on all standard light and dark surfaces', async () => {
  const css = await readFile(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
  const colors = [...css.matchAll(/--text-4:\s*(#[0-9a-f]{6});/g)].map(match => match[1]);
  assert.equal(colors.length, 3);
  for (let i = 0; i < colors.length; i++)
    for (const background of i ? ['#1a1a19', '#1d1d1c', '#252524', '#2d2d2b'] : ['#ffffff', '#fbfaf8', '#f4f3f0', '#f6f5f2', '#eeede9']) {
      const a = luminance(colors[i]),
        b = luminance(background);
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${colors[i]} on ${background}`);
    }
});
