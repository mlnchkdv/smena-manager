import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeVersionChanges, knowledgeTextComparison } from '../../src/shared/knowledge-history.js';

test('comparison previews the exact restored metadata and explains a missing destination', () => {
  const note = { title: 'Now', summary: 'Now summary', tags: ['new'], category: 'General', folderId: 'current', formatted_markdown: 'New body' };
  const version = { ...note, title: 'Before', tags: ['old'], folderId: 'deleted', formatted_markdown: 'Old body' };
  const original = JSON.stringify([note, version]);
  const change = knowledgeVersionChanges(note, version, [{ id: 'current', name: 'Current folder' }]);
  assert.deepEqual(change.fields, ['title', 'formatted_markdown', 'tags', 'folderId']);
  assert.equal(change.missingFolder, true);
  assert.equal(change.restored.folderId, null);
  assert.equal(change.current.folderId, 'current');
  assert.equal(JSON.stringify([note, version]), original);
  assert.deepEqual(knowledgeVersionChanges(note, note, [{ id: 'current' }]).fields, []);
});
test('large text comparison is bounded and preserves insertion deletion and unchanged ranges', () => {
  assert.deepEqual(knowledgeTextComparison('same', 'same'), { line: 2, removed: 0, added: 0, before: '', after: '', truncated: false });
  const change = knowledgeTextComparison('Header\nOld\nFooter', 'Header\nNew\nExtra\nFooter');
  assert.equal(change.line, 2);
  assert.equal(change.removed, 1);
  assert.equal(change.added, 2);
  assert.equal(change.before, 'Old');
  assert.equal(change.after, 'New\nExtra');
  const large = knowledgeTextComparison('Before\n'.repeat(1000), 'After\n'.repeat(1000), 20);
  assert.equal(large.truncated, true);
  assert.equal(large.before.split('\n').length, 20);
  assert.equal(large.after.split('\n').length, 20);
  const singleLine = knowledgeTextComparison('a'.repeat(1024 * 1024), 'b'.repeat(1024 * 1024));
  assert.equal(singleLine.before.length, 12000);
  assert.equal(singleLine.after.length, 12000);
  assert.equal(singleLine.truncated, true);
});

test('large string fields compare exact source including a changed final character', () => {
  const source = 'Строка "quoted" \\ path\n'.repeat(60000);
  const note = { formatted_markdown: source, properties: { approved: false } };
  assert.deepEqual(knowledgeVersionChanges(note, { ...note }, []).fields, []);
  assert.deepEqual(knowledgeVersionChanges(note, { ...note, formatted_markdown: source + 'x', properties: { approved: true } }, []).fields, [
    'formatted_markdown',
    'properties',
  ]);
  assert.equal(note.formatted_markdown, source);
});
