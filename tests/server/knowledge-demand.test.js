import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheKnowledgeBody, hydrateKnowledgeBody, knowledgeNotePayload, clearKnowledgeBodies } from '../../src/shared/knowledge-demand.js';
import { mergeWorkspaceData } from '../../src/shared/workspace-merge.js';
import { restoreUnauthorizedChanges } from '../../src/shared/workspace-permissions.js';
test('hydration is not an edit, but empty and changed bodies remain explicit writes', () => {
  clearKnowledgeBodies();
  const note = { id: 'a', bodyToken: 'a'.repeat(64), bodyPending: true, title: 'A' };
  const baseline = structuredClone(note);
  cacheKnowledgeBody(note.bodyToken, '# Original');
  hydrateKnowledgeBody(note);
  assert.deepEqual(knowledgeNotePayload(note), baseline);
  assert.equal(restoreUnauthorizedChanges({ knowledgeNotes: [baseline] }, { knowledgeNotes: [note] }, 'viewer').denied, false);
  note.formatted_markdown = '';
  assert.equal(knowledgeNotePayload(note).formatted_markdown, '');
  assert.equal(restoreUnauthorizedChanges({ knowledgeNotes: [baseline] }, { knowledgeNotes: [note] }, 'viewer').denied, true);
  note.formatted_markdown = 'New';
  assert.equal(knowledgeNotePayload(note).formatted_markdown, 'New');
  clearKnowledgeBodies();
  assert.equal(hydrateKnowledgeBody(baseline).formatted_markdown, undefined);
  assert.equal(knowledgeNotePayload(note).formatted_markdown, 'New');
});
test('an evicted clean body unloads instead of becoming an empty or dirty write', () => {
  clearKnowledgeBodies();
  const note = { id: 'a', bodyToken: 'a'.repeat(64), bodyPending: true, formatted_markdown: 'Original' };
  cacheKnowledgeBody(note.bodyToken, note.formatted_markdown, note);
  for (let i = 1; i <= 41; i++) cacheKnowledgeBody(i.toString(16).padStart(64, '0'), 'Body ' + i);
  assert.equal(note.formatted_markdown, undefined);
  assert.equal(Object.hasOwn(knowledgeNotePayload(note), 'formatted_markdown'), false);
  clearKnowledgeBodies();
});

test('a second edit during acknowledgement keeps the new body and advances its token', () => {
  clearKnowledgeBodies();
  const first = { id: 'a', title: 'A', bodyToken: 'a'.repeat(64), bodyPending: true, formatted_markdown: 'First save' };
  const local = { ...first, formatted_markdown: 'Second edit' };
  const remote = { id: 'a', title: 'A', bodyToken: 'b'.repeat(64), bodyPending: true };
  cacheKnowledgeBody(remote.bodyToken, 'First save');
  const result = mergeWorkspaceData({ knowledgeNotes: [first] }, { knowledgeNotes: [local] }, { knowledgeNotes: [remote] });
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.data.knowledgeNotes[0].formatted_markdown, 'Second edit');
  assert.equal(result.data.knowledgeNotes[0].bodyToken, remote.bodyToken);
  clearKnowledgeBodies();
});

test('cold draft recovery cannot silently overwrite an unread remote body', () => {
  clearKnowledgeBodies();
  const base = { id: 'a', title: 'A', bodyToken: 'a'.repeat(64), bodyPending: true };
  const remote = { ...base, bodyToken: 'b'.repeat(64) };
  const result = mergeWorkspaceData(
    { knowledgeNotes: [base] },
    { knowledgeNotes: [{ ...base, formatted_markdown: 'Offline edit' }] },
    { knowledgeNotes: [remote] },
  );
  assert.deepEqual(result.conflicts, ['knowledgeNotes[a].formatted_markdown']);
  const metadata = mergeWorkspaceData({ knowledgeNotes: [base] }, { knowledgeNotes: [{ ...base, title: 'Renamed' }] }, { knowledgeNotes: [remote] });
  assert.deepEqual(metadata.conflicts, []);
  assert.equal(metadata.data.knowledgeNotes[0].title, 'Renamed');
  assert.equal(metadata.data.knowledgeNotes[0].bodyToken, remote.bodyToken);
});
