import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgePreviewNavigation } from '../../src/shared/knowledge-preview-navigation.js';

const context = { owner: 'reader', workspace: 'team', ids: ['b', 'a', 'c'] };
const scope = { owner: 'reader', workspace: 'team', notes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
test('preview navigation keeps the captured filtered page order and explicit boundaries', () => {
  assert.deepEqual(knowledgePreviewNavigation(context, { ...scope, activeId: 'b' }), { index: 0, total: 3, previous: null, next: 'a' });
  assert.deepEqual(knowledgePreviewNavigation(context, { ...scope, activeId: 'a' }), { index: 1, total: 3, previous: 'b', next: 'c' });
  assert.deepEqual(knowledgePreviewNavigation(context, { ...scope, activeId: 'c' }), { index: 2, total: 3, previous: 'a', next: null });
});
test('preview navigation skips deleted notes without leaving the captured page', () => {
  assert.deepEqual(knowledgePreviewNavigation(context, { ...scope, activeId: 'b', notes: [{ id: 'b' }, { id: 'c' }, { id: 'outside' }] }), {
    index: 0,
    total: 2,
    previous: null,
    next: 'c',
  });
  assert.equal(knowledgePreviewNavigation(context, { ...scope, activeId: 'missing' }), null);
});
test('preview navigation rejects stale users, workspaces, anonymous and malformed contexts', () => {
  for (const changes of [{ owner: 'other' }, { workspace: 'other' }, { owner: null }, { workspace: '' }])
    assert.equal(knowledgePreviewNavigation(context, { ...scope, activeId: 'a', ...changes }), null);
  assert.equal(knowledgePreviewNavigation(null, scope), null);
  assert.equal(knowledgePreviewNavigation({ ...context, ids: null }, scope), null);
});
test('preview navigation is bounded, deduplicated, non-mutating and safe for a single note', () => {
  const ids = ['a', 'a', null, 42];
  assert.deepEqual(knowledgePreviewNavigation({ ...context, ids }, { ...scope, activeId: 'a' }), { index: 0, total: 1, previous: null, next: null });
  assert.deepEqual(ids, ['a', 'a', null, 42]);
  const many = Array.from({ length: 1000 }, (_, id) => ({ id: String(id) }));
  assert.equal(knowledgePreviewNavigation({ ...context, ids: many.map(note => note.id) }, { ...scope, notes: many, activeId: '59' }).total, 60);
  assert.equal(knowledgePreviewNavigation({ ...context, ids: many.map(note => note.id) }, { ...scope, notes: many, activeId: '60' }), null);
});
