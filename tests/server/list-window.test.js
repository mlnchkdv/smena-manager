import assert from 'node:assert/strict';
import test from 'node:test';
import { listWindow } from '../../src/shared/list-window.js';

test('task windows bound rendered rows, preserve order and clamp stale pages after filtering', () => {
  const tasks = Array.from({ length: 10000 }, (_, index) => ({ id: `t${index}` }));
  const first = listWindow(tasks);
  assert.equal(first.items.length, 100);
  assert.equal(first.pages, 100);
  const last = listWindow(tasks, 999);
  assert.equal(last.page, 99);
  assert.equal(last.items.at(-1).id, 't9999');
  assert.equal(listWindow(tasks.slice(0, 10), last.page).page, 0);
  assert.equal(tasks[0].id, 't0');
  assert.equal(listWindow([]).pages, 1);
});
