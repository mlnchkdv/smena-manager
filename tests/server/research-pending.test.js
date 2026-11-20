import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pendingResearchCommands,
  keepPendingResearch,
  clearPendingResearch,
  listResearchDrafts,
  keepResearchDraft,
  clearResearchDraft,
} from '../../src/core/research-pending.js';

test('recovering one research operation keeps other drafts, workspaces and legacy saves intact', () => {
  const storage = {};
  Object.defineProperties(storage, {
    getItem: { value: key => storage[key] ?? null },
    setItem: {
      value: (key, value) => {
        storage[key] = value;
      },
    },
    removeItem: {
      value: key => {
        delete storage[key];
      },
    },
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const scope = ['workspace', 'member', 'project'];
    const other = ['workspace', 'member', 'other-project'];
    const draft = id => ({ id, record: { kind: 'experiment', data: {}, title: id } });
    const command = id => ({ action: 'create', operationId: id });
    storage.setItem('smena:research:pending:v1:workspace:member:project', JSON.stringify(command('legacy')));
    storage.setItem('smena:research:drafts:v1:workspace:member:project', JSON.stringify([draft('legacy')]));
    for (const id of ['first', 'second']) {
      keepPendingResearch(...scope, command(id));
      keepResearchDraft(scope, draft(id));
    }
    keepPendingResearch(...other, command('first'));
    clearPendingResearch(...scope, 'first');
    clearResearchDraft(scope, 'first');
    assert.deepEqual(
      pendingResearchCommands(...scope)
        .map(c => c.operationId)
        .sort(),
      ['legacy', 'second'],
    );
    assert.deepEqual(
      listResearchDrafts(scope)
        .map(d => d.id)
        .sort(),
      ['legacy', 'second'],
    );
    clearPendingResearch(...scope, 'legacy');
    clearResearchDraft(scope, 'legacy');
    assert.deepEqual(pendingResearchCommands(...scope), [command('second')]);
    assert.deepEqual(listResearchDrafts(scope), [draft('second')]);
    assert.deepEqual(pendingResearchCommands(...other), [command('first')]);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
