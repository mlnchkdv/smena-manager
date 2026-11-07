import test from 'node:test';
import assert from 'node:assert/strict';
import { applyKnowledgeReview, knowledgeReviewHash } from '../../src/server/knowledge-governance-policy.js';
import {
  validKnowledgeGovernance,
  knowledgeGovernanceStatus,
  preserveKnowledgeGovernance,
  validReviewDate,
  KNOWLEDGE_REVIEW_EVENT_LIMIT,
} from '../../src/shared/knowledge-governance.js';

const members = [
  { id: 'owner', role: 'Owner' },
  { id: 'editor', role: 'Member' },
  { id: 'other', role: 'Member' },
  { id: 'viewer', role: 'Guest' },
  { id: 'removed', role: 'Member', status: 'removed' },
];
const hash = 'a'.repeat(64),
  changedHash = 'b'.repeat(64),
  at = '2026-11-07T17:00:00Z';
let sequence = 0;
const input = (note, action, fields = {}) => ({
  action,
  operationId: 'operation-' + ++sequence,
  reviewRevision: note.governance?.revision || 0,
  reviewHash: hash,
  ...fields,
});
const apply = (note, action, fields = {}, actor = members[0]) => {
  const result = applyKnowledgeReview(note, hash, actor, members, input(note, action, fields), at);
  return { ...note, governance: result.governance };
};

test('approval hashes include reading format and imported origin without changing the legacy editing/version hash', () => {
  const note = { id: 'n', title: 'Source', formatted_markdown: '# Literal' };
  assert.equal(knowledgeReviewHash(note), knowledgeReviewHash({ ...note, sourceFormat: 'markdown', sourceName: '' }));
  assert.notEqual(knowledgeReviewHash(note), knowledgeReviewHash({ ...note, sourceFormat: 'text' }));
  assert.notEqual(knowledgeReviewHash(note), knowledgeReviewHash({ ...note, sourceName: 'origin.md' }));
  assert.equal(
    knowledgeReviewHash(note),
    knowledgeReviewHash({ ...note, updatedAt: '2030-01-01', governance: {} }),
    'Server timestamps/review state are outside content approval',
  );
});

test('reviews bind approvals to a snapshot, preserve earlier decisions on edits, and allow exact restore recognition', () => {
  const original = { id: 'n', createdBy: 'owner' },
    configured = apply(original, 'configure', { ownerId: 'owner', reviewDue: '2026-12-01' });
  const requested = apply(configured, 'request', { reviewers: ['editor', 'other'] });
  assert.equal(knowledgeGovernanceStatus(requested.governance, hash).status, 'pending');
  const first = apply(requested, 'decide', { outcome: 'approved', comment: '' }, members[1]);
  assert.equal(knowledgeGovernanceStatus(first.governance, hash).status, 'pending');
  const approved = apply(first, 'decide', { outcome: 'approved', comment: 'Проверено / Reviewed' }, members[2]);
  assert.deepEqual(knowledgeGovernanceStatus(approved.governance, hash, '2026-12-01'), { status: 'approved', overdue: true });
  assert.equal(knowledgeGovernanceStatus(approved.governance, changedHash).status, 'stale');
  assert.equal(knowledgeGovernanceStatus(approved.governance, hash).status, 'approved');
  assert.equal(approved.governance.events.filter(e => e.action === 'decide').length, 2);
  assert.equal(original.governance, undefined);
  assert.equal(first.governance.events.length, 3);
  const changes = apply(approved, 'decide', { outcome: 'changes', comment: 'Clarify this paragraph' }, members[1]);
  assert.equal(knowledgeGovernanceStatus(changes.governance, hash).status, 'changes');
  assert.equal(changes.governance.events.filter(e => e.action === 'decide').length, 3, 'Earlier approval is retained');
});

test('canonical ownership, active reviewer assignment, version/review CAS and exact operation replay fence writes', () => {
  const note = apply({ id: 'n', createdBy: 'owner' }, 'request', { reviewers: ['editor'] });
  for (const actor of [members[2], members[3], members[4]])
    assert.throws(() => apply(note, 'decide', { outcome: 'approved', comment: '' }, actor), { code: 'KNOWLEDGE_REVIEW_FORBIDDEN' });
  assert.throws(() => apply(note, 'configure', { ownerId: 'other', reviewDue: '' }, members[1]), { code: 'KNOWLEDGE_REVIEW_FORBIDDEN' });
  assert.throws(() => apply(note, 'request', { reviewers: ['removed'] }), { code: 'KNOWLEDGE_REVIEW_INVALID' });
  assert.throws(() => apply(note, 'request', { reviewers: ['editor', 'editor'] }), { code: 'KNOWLEDGE_REVIEW_INVALID' });
  for (const invalid of [{ operationId: 12345678 }, { operationId: ['operation-array'] }, { reviewHash: [hash] }])
    assert.throws(() => applyKnowledgeReview(note, hash, members[0], members, { ...input(note, 'request', { reviewers: ['editor'] }), ...invalid }, at), {
      code: 'KNOWLEDGE_REVIEW_INVALID',
    });
  assert.throws(() => apply(note, 'decide', { outcome: 'changes', comment: ' ' }, members[1]), { code: 'KNOWLEDGE_REVIEW_INVALID' });
  const command = input(note, 'decide', { outcome: 'approved', comment: '' });
  const saved = applyKnowledgeReview(note, hash, members[1], members, command, at);
  const replay = applyKnowledgeReview({ ...note, governance: saved.governance }, hash, members[1], members, command, '2026-11-08T00:00:00Z');
  assert.equal(replay.replay, true);
  assert.deepEqual(replay.governance, saved.governance);
  assert.throws(() => applyKnowledgeReview({ ...note, governance: saved.governance }, hash, members[1], members, { ...command, comment: 'changed' }, at), {
    code: 'KNOWLEDGE_REVIEW_REPLAY',
  });
  assert.throws(() => applyKnowledgeReview(note, hash, members[1], members, { ...command, operationId: 'stale-operation', reviewRevision: 0 }, at), {
    code: 'KNOWLEDGE_REVIEW_STALE',
  });
  assert.throws(() => applyKnowledgeReview(note, changedHash, members[1], members, command, at), { code: 'KNOWLEDGE_VERSION_STALE' });
  assert.throws(() => applyKnowledgeReview(note, changedHash, members[1], members, { ...command, reviewHash: changedHash }, at), {
    code: 'KNOWLEDGE_REVIEW_STALE',
  });
});

test('review history is bounded with an explicit omitted count, while the current decision remains intact', () => {
  let note = apply({ id: 'n', createdBy: 'owner' }, 'request', { reviewers: ['owner'] });
  note = apply(note, 'decide', { outcome: 'approved', comment: '' });
  for (let i = 0; i < KNOWLEDGE_REVIEW_EVENT_LIMIT + 3; i++) note = apply(note, 'configure', { ownerId: 'owner', reviewDue: '' });
  assert.equal(note.governance.events.length, KNOWLEDGE_REVIEW_EVENT_LIMIT);
  assert.equal(note.governance.omitted, 5);
  assert.equal(knowledgeGovernanceStatus(note.governance, hash).status, 'approved');
  assert.equal(validKnowledgeGovernance(note.governance), true);
});

test('review dates and malformed persisted journals fail closed without throwing from validation', () => {
  for (const value of ['', '2028-02-29', '2030-12-31']) assert.equal(validReviewDate(value), true);
  for (const value of ['2026-02-29', '2030-13-01', '1969-12-31', null, 123]) assert.equal(validReviewDate(value), false);
  const note = apply({ id: 'n' }, 'configure', { ownerId: 'owner', reviewDue: '' });
  for (const governance of [
    { ...note.governance, events: [null] },
    { ...note.governance, events: [{ id: 'x' }] },
    { ...note.governance, current: { reviewers: [] } },
    { ...note.governance, omitted: 100 },
  ]) {
    assert.equal(validKnowledgeGovernance(governance), false);
    assert.equal(knowledgeGovernanceStatus(governance, hash).status, 'unavailable');
    assert.throws(() => applyKnowledgeReview({ ...note, governance }, hash, members[0], members, input(note, 'request', { reviewers: ['editor'] })), {
      code: 'KNOWLEDGE_REVIEW_INTEGRITY',
    });
  }
});

test('core, legacy and trash round-trips cannot invent or overwrite server-owned decisions', () => {
  const note = apply({ id: 'n', createdBy: 'owner' }, 'request', { reviewers: ['editor'] });
  const current = { knowledgeNotes: [note], trash: [{ id: 'trash-b', kind: 'note', data: { note: { ...note, id: 'b' } } }] };
  const forged = { ...note.governance, ownerId: 'other' };
  const incoming = {
    knowledgeNotes: [
      { id: 'n', governance: forged },
      { id: 'b', governance: forged },
      { id: 'new', governance: forged },
    ],
    trash: [
      { id: 'new-trash', kind: 'note', data: { note: { id: 'n', governance: forged } } },
      { id: 'unknown', kind: 'note', data: { note: { id: 'unknown', governance: forged } } },
    ],
  };
  const saved = preserveKnowledgeGovernance(current, incoming);
  assert.deepEqual(saved.knowledgeNotes[0].governance, note.governance);
  assert.deepEqual(saved.knowledgeNotes[1].governance, note.governance);
  assert.equal(saved.knowledgeNotes[2].governance, undefined);
  assert.deepEqual(saved.trash[0].data.note.governance, note.governance);
  assert.equal(saved.trash[1].data.note.governance, undefined);
  assert.equal(incoming.knowledgeNotes[0].governance.ownerId, 'other');
});
