import test from 'node:test';
import assert from 'node:assert/strict';
import { applyKnowledgeIntake } from '../../src/server/knowledge-intake-policy.js';
import { validKnowledgeIntake, knowledgeIntakeSummary, preserveKnowledgeIntake } from '../../src/shared/knowledge-intake.js';

const members = [
  { id: 'owner', role: 'Owner', status: 'active' },
  { id: 'editor', role: 'Member', status: 'active' },
  { id: 'other', role: 'Member', status: 'active' },
  { id: 'viewer', role: 'Guest', status: 'active' },
  { id: 'removed', role: 'Member', status: 'removed' },
];
const data = {
  members,
  projects: [
    { id: 'public', name: 'Public' },
    { id: 'private', private: true, lead: 'owner' },
  ],
  knowledgeNotes: [{ id: 'a' }, { id: 'b' }],
};
const command = (note, action, extra = {}) => ({
  action,
  operationId: `operation-${(note.intake?.revision || 0) + 1}`,
  intakeRevision: note.intake?.revision || 0,
  ...extra,
});
const apply = (note, action, actor = members[1], extra = {}) => {
  const input = command(note, action, extra),
    result = applyKnowledgeIntake(note, actor, data, input, '2026-11-08T10:00:00Z');
  note.intake = result.intake;
  assert.equal(validKnowledgeIntake(note.intake), true);
  return input;
};
test('intake assigns responsibility, records distinct outcomes, reopens without altering content and fences project rights', () => {
  const note = { id: 'a', formatted_markdown: '# Original', captureStatus: 'unprocessed' };
  assert.equal(knowledgeIntakeSummary(note).state, 'open');
  apply(note, 'assign', members[1], { ownerId: 'other' });
  assert.throws(() => apply(note, 'resolve', members[1], { outcome: 'knowledge' }), { code: 'INTAKE_FORBIDDEN' });
  assert.throws(() => apply(note, 'resolve', members[2], { outcome: 'project', projectId: 'private' }), { code: 'INTAKE_FORBIDDEN' });
  apply(note, 'resolve', members[2], { outcome: 'project', projectId: 'public', reason: 'Next action' });
  assert.equal(note.intake.state, 'closed');
  assert.equal(note.intake.result.projectId, 'public');
  apply(note, 'assign', members[0], { ownerId: 'editor' });
  assert.equal(note.intake.state, 'closed', 'Reassignment preserves a closed outcome');
  apply(note, 'reopen');
  assert.equal(note.intake.result, null);
  assert.throws(() => apply(note, 'resolve', members[1], { outcome: 'duplicate', duplicateId: 'a', reason: 'self' }), { code: 'INTAKE_INVALID' });
  assert.throws(() => apply(note, 'resolve', members[1], { outcome: 'duplicate', duplicateId: 'b' }), { code: 'INTAKE_INVALID' });
  apply(note, 'resolve', members[1], { outcome: 'duplicate', duplicateId: 'b', reason: 'Same source' });
  assert.equal(note.formatted_markdown, '# Original');
  assert.equal(note.captureStatus, 'unprocessed', 'Process state is separate from versioned source properties');
});
test('intake uses canonical roles, revision CAS, exact operation replay and bounded audit events', () => {
  const note = { id: 'a' };
  assert.throws(() => apply(note, 'enroll', members[3]), { code: 'INTAKE_FORBIDDEN' });
  assert.throws(() => apply(note, 'enroll', members[4]), { code: 'INTAKE_FORBIDDEN' });
  const input = apply(note, 'enroll');
  assert.equal(applyKnowledgeIntake(note, members[1], data, input).replay, true);
  assert.throws(() => applyKnowledgeIntake(note, members[1], data, { ...input, reason: 'Changed replay' }), { code: 'INTAKE_STALE' });
  assert.throws(() => applyKnowledgeIntake(note, members[1], data, { ...input, operationId: 'other-operation' }), { code: 'INTAKE_STALE' });
  assert.throws(() => apply(note, 'assign', members[1], { ownerId: 'viewer' }), { code: 'INTAKE_INVALID' });
  for (let i = 0; i < 53; i++) apply(note, 'assign', members[1], { ownerId: 'editor' });
  assert.equal(note.intake.events.length, 50);
  assert.equal(note.intake.omitted, 4);
  const bad = structuredClone(note.intake);
  bad.events[0] = null;
  assert.equal(validKnowledgeIntake(bad), false);
  assert.throws(() => applyKnowledgeIntake({ ...note, intake: bad }, members[1], data, command(note, 'assign', { ownerId: 'editor' })), {
    code: 'INTAKE_INTEGRITY',
  });
});
test('client/core/trash payloads cannot forge or clear intake decisions', () => {
  const note = { id: 'a' };
  apply(note, 'enroll');
  const current = { knowledgeNotes: [note], trash: [] };
  const incoming = {
    knowledgeNotes: [
      { id: 'a', intake: null },
      { id: 'new', intake: note.intake },
    ],
    trash: [{ kind: 'note', data: { note: { id: 'a', intake: null } } }],
  };
  const result = preserveKnowledgeIntake(current, incoming);
  assert.deepEqual(result.knowledgeNotes[0].intake, note.intake);
  assert.equal(result.knowledgeNotes[1].intake, undefined);
  assert.deepEqual(result.trash[0].data.note.intake, note.intake);
  assert.equal(incoming.knowledgeNotes[0].intake, null, 'No caller mutation');
});
