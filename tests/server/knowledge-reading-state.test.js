import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeReadingInputs, sameKnowledgeReadingInputs } from '../../src/shared/knowledge-reading-state.js';

test('retention ignores unrelated activity but fences exact source, scope, assets and transclusions', () => {
  const note = { id: 'note', sourceFormat: 'markdown', wikiRefs: [], assets: [] };
  const data = { me: 'owner', knowledgeNotes: [note, { id: 'embedded', title: 'Block', bodyToken: 'v1' }] };
  const scope = [1, 'workspace', 'ru', 'admin'],
    assets = [['file', true, 'blob:one']];
  const baseline = knowledgeReadingInputs(data, note, 'Original', scope, assets);
  const same = () => sameKnowledgeReadingInputs(baseline, knowledgeReadingInputs(data, note, 'Original', scope, assets));
  assert.equal(same(), true);
  data.activity = [{ id: 'unrelated' }];
  data.revision = 100;
  assert.equal(same(), true);
  for (const nextScope of [
    [2, 'workspace', 'ru', 'admin'],
    [1, 'other', 'ru', 'admin'],
    [1, 'workspace', 'en', 'admin'],
    [1, 'workspace', 'ru', 'viewer'],
  ])
    assert.equal(sameKnowledgeReadingInputs(baseline, knowledgeReadingInputs(data, note, 'Original', nextScope, assets)), false);
  assert.equal(sameKnowledgeReadingInputs(baseline, knowledgeReadingInputs(data, note, 'Changed!', scope, assets)), false);
  assert.equal(sameKnowledgeReadingInputs(baseline, knowledgeReadingInputs(data, note, 'Original', scope, [['file', false, '']])), false);
  data.knowledgeNotes[1].formatted_markdown = 'Newly loaded block';
  assert.equal(same(), false);
  delete data.knowledgeNotes[1].formatted_markdown;
  data.knowledgeNotes[1].aliases = ['new wiki target'];
  assert.equal(same(), false);
  delete data.knowledgeNotes[1].aliases;
  data.knowledgeNotes[1].sourceFormat = 'text';
  assert.equal(same(), false);
  delete data.knowledgeNotes[1].sourceFormat;
  note.materialTargets = { './relative.md': 'note:embedded' };
  assert.equal(same(), false);
});

test('equal-length embedded edits and deleted targets invalidate retained markup', () => {
  const note = { id: 'note' },
    target = { id: 'target', title: 'Target', formatted_markdown: 'One' };
  const data = { me: 'owner', knowledgeNotes: [note, target] };
  const before = knowledgeReadingInputs(data, note, 'Source', [], []);
  target.formatted_markdown = 'Two';
  assert.equal(sameKnowledgeReadingInputs(before, knowledgeReadingInputs(data, note, 'Source', [], [])), false);
  data.knowledgeNotes.pop();
  assert.equal(sameKnowledgeReadingInputs(before, knowledgeReadingInputs(data, note, 'Source', [], [])), false);
});
