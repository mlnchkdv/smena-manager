import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorkListIntent, completedWithin } from '../../src/shared/work-list-intent.js';

test('dashboard navigation clears stale query but keeps column and sorting choices', () => {
  const view = { q: 'invisible old query', filters: [{ f: 'priority' }], hidden: ['due'], colW: { title: 300 }, sort: { f: 'due', dir: 1 } };
  applyWorkListIntent(view, { kind: 'overdue', project: 'p1', assignee: 'me' });
  assert.equal(view.q, '');
  assert.deepEqual(view.filters, [
    { f: 'status', op: 'not', v: ['done'] },
    { f: 'due', op: 'is', v: ['overdue'] },
    { f: 'assignee', op: 'is', v: ['me'] },
    { f: 'project', op: 'is', v: ['p1'] },
  ]);
  assert.deepEqual(view.hidden, ['due']);
  assert.deepEqual(view.colW, { title: 300 });
  assert.deepEqual(view.sort, { f: 'due', dir: 1 });
});

test('recent completion uses completion time, never a later edit to an old completed task', () => {
  const now = 2000000000,
    day = 86400000;
  assert.equal(completedWithin({ status: 'done', completedAt: now - 8 * day, updated: now }, 7, now), false);
  assert.equal(completedWithin({ status: 'done', completedAt: now - 7 * day }, 7, now), true);
  for (const completedAt of [null, undefined, 'broken', now + 1]) assert.equal(completedWithin({ status: 'done', completedAt }, 7, now), false);
  assert.equal(completedWithin({ status: 'todo', completedAt: now }, 7, now), false);
  const view = applyWorkListIntent({}, { kind: 'done' });
  assert.equal(view.filters[1].f, 'completed');
});

test('unassigned and due-soon intents remain open-only and project scoped', () => {
  for (const kind of ['unassigned', 'week']) {
    const view = applyWorkListIntent({}, { kind, project: 'visible' });
    assert.deepEqual(view.filters[0], { f: 'status', op: 'not', v: ['done'] });
    assert.deepEqual(view.filters.at(-1), { f: 'project', op: 'is', v: ['visible'] });
  }
});
