import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineAnchorPage, timelineContextKey } from '../../src/shared/timeline-page.js';

test('timeline dates clamp to nearest page including empty and boundary collections', () => {
  for (const count of [0, 59, 60, 61, 125]) {
    const items = Array.from({ length: count }, (_, id) => ({ date: '2026-01-01', task: { id } }));
    assert.equal(timelineAnchorPage(items, '2025-01-01').page, 0);
    assert.equal(timelineAnchorPage(items, '2030-01-01').page, Math.max(0, Math.ceil(count / 60) - 1));
    assert.equal(timelineAnchorPage(items, '2030-01-01').afterLast, count > 0);
    assert.equal(timelineAnchorPage(items, '2026-01-01').page, 0);
  }
});
test('timeline context distinguishes filtered collections without changing on identical renders', () => {
  const items = [
    { date: '2026-01-01', task: { id: 'a' } },
    { date: '2026-01-02', task: { id: 'b' } },
  ];
  assert.equal(timelineContextKey('tl', '2026-01-01', items), timelineContextKey('tl', '2026-01-01', structuredClone(items)));
  assert.notEqual(timelineContextKey('tl', '2026-01-01', items), timelineContextKey('tl', '2026-01-01', items.slice(1)));
});
