import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeEntityEtag, knowledgeEntityVersion, stampKnowledgeEntityVersions } from '../../src/server/knowledge-entity-version.js';

test('entity versions ignore forged counters, isolate sibling changes and fence restores', () => {
  const source = {
    knowledgeNotes: [
      { id: 'a', title: 'A', formatted_markdown: 'first' },
      { id: 'b', title: 'B', formatted_markdown: 'second' },
    ],
  };
  const original = knowledgeEntityEtag(source.knowledgeNotes[0]);
  const next = structuredClone(source);
  next.knowledgeNotes[0].title = 'Changed';
  next.knowledgeNotes[0]._apiVersion = { number: 9999, generation: 'forged' };
  stampKnowledgeEntityVersions(source, next);
  assert.equal(knowledgeEntityVersion(next.knowledgeNotes[0]).number, 2);
  assert.notEqual(knowledgeEntityEtag(next.knowledgeNotes[0]), original);
  assert.equal(knowledgeEntityEtag(next.knowledgeNotes[1]), knowledgeEntityEtag(source.knowledgeNotes[1]));
  const restored = structuredClone(source);
  stampKnowledgeEntityVersions(next, restored, { reset: true });
  assert.equal(knowledgeEntityVersion(restored.knowledgeNotes[0]).number, 3);
  assert.notEqual(knowledgeEntityEtag(restored.knowledgeNotes[0]), original);
  const noChange = structuredClone(restored);
  noChange.knowledgeNotes[0]._apiVersion = { number: 1, generation: 'forged' };
  stampKnowledgeEntityVersions(restored, noChange);
  assert.equal(knowledgeEntityEtag(noChange.knowledgeNotes[0]), knowledgeEntityEtag(restored.knowledgeNotes[0]));
});

test('legacy body migration preserves the same version token without loading bodies', () => {
  const inline = { id: 'a', title: 'A', formatted_markdown: 'Привет 🌍' };
  // The body store hashes exactly this UTF-8 envelope.
  return import('node:crypto').then(({ createHash }) => {
    const external = {
      id: 'a',
      title: 'A',
      bodyRef: {
        sha256: createHash('sha256')
          .update(JSON.stringify({ format: 'smena-knowledge-body-v1', noteId: 'a', formatted_markdown: inline.formatted_markdown }))
          .digest('hex'),
      },
    };
    assert.equal(knowledgeEntityEtag(inline), knowledgeEntityEtag(external));
  });
});
