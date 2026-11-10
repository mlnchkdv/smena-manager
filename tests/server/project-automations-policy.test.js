import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveProjectAutomations, validateStoredProjectAutomations, projectAutomationsHash } from '../../src/server/project-automations-policy.js';
import { mergeClientWorkspace } from '../../src/server/workspace-policy.js';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';

const draft = () => ({
  version: 1,
  rules: [{ id: 'r', name: 'Draft / Черновик', enabled: false, trigger: { from: ['todo'], to: 'progress' }, actions: [{ field: 'priority', value: 'high' }] }],
});
test('ordinary project/trash snapshots retain canonical drafts and cannot configure copied projects or forge provenance', () => {
  const p = { id: 'p', automations: draft(), automationsRevision: 1, automationsUpdatedBy: 'owner', automationsUpdatedAt: '2026-11-10T13:00:00Z' },
    current = { projects: [p], trash: [] };
  const result = preserveProjectAutomations(current, {
    projects: [
      { id: 'p', name: 'Rename' },
      { ...p, id: 'new' },
    ],
    trash: [{ kind: 'project', data: { project: { id: 'p' } } }],
  });
  assert.deepEqual(result.projects[0].automations, p.automations);
  assert.equal(result.projects[0].automationsRevision, 1);
  assert.equal(result.projects[1].automations, undefined);
  assert.equal(result.projects[1].automationsUpdatedBy, undefined);
  assert.deepEqual(result.trash[0].data.project.automations, p.automations);
  const forged = structuredClone(p);
  forged.automations.rules[0].enabled = true;
  for (const input of [{ projects: [forged] }, { trash: [{ kind: 'project', data: { project: forged } }] }])
    assert.throws(() => preserveProjectAutomations(current, input), { code: 'AUTOMATION_ENDPOINT_REQUIRED' });
  const stamp = preserveProjectAutomations(current, { projects: [{ ...p, automationsRevision: 999, automationsUpdatedBy: 'forged' }] });
  assert.equal(stamp.projects[0].automationsRevision, 1);
  assert.equal(stamp.projects[0].automationsUpdatedBy, 'owner');
  assert.equal(p.automations.rules[0].enabled, false);
});
test('stored and restored draft models are checked without reading material collections', () => {
  const data = {
    projects: [{ id: 'p', automations: draft() }],
    get knowledgeNotes() {
      throw Error('Unrelated');
    },
  };
  assert.equal(validateStoredProjectAutomations(data), data);
  const before = projectAutomationsHash({}),
    after = projectAutomationsHash({ automations: { version: 1, rules: [] } });
  assert.equal(before, after);
  for (const bad of [
    { automations: { version: 2, rules: [] } },
    { automationsRevision: -1 },
    { automationsRevision: 1_000_001 },
    { automationsUpdatedBy: {} },
    { automationsUpdatedAt: 'bad' },
    { automationsUpdatedAt: ' '.repeat(10000) + '2026-11-10' },
  ]) {
    assert.throws(() => validateStoredProjectAutomations({ projects: [{ id: 'p', ...bad }] }), { code: 'AUTOMATION_INTEGRITY' });
    assert.throws(() => validateStoredProjectAutomations({ projects: [], trash: [{ kind: 'project', data: { project: { id: 'p', ...bad } } }] }), {
      code: 'AUTOMATION_INTEGRITY',
    });
  }
});
test('private project access is checked before comparing a guessed automation configuration', () => {
  const current = {
    ...createEmptyDatabase(),
    me: 'owner',
    members: [
      { id: 'owner', role: 'Owner' },
      { id: 'editor', role: 'Member' },
    ],
    projects: [{ id: 'private', access: 'private', members: ['owner'], automations: draft() }],
  };
  for (const automations of [null, draft(), { version: 99 }])
    assert.throws(() => mergeClientWorkspace(current, { projects: [{ id: 'private', automations }] }, 'editor', 'editor'), { statusCode: 403 });
});
