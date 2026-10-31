import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { buildKnowledgeArchive, readKnowledgeArchive, archivePath, mapArchiveFiles, parseCollectionCsv } from '../../src/shared/knowledge-archive.js';
test('knowledge ZIP round trips raw text, properties, definitions and attachment bytes', () => {
  const data = {
    ws: { knowledgeTypes: [{ id: 'x', name: 'X', fields: [] }] },
    knowledgeNotes: [
      { id: 'n', title: 'Note', typeId: 'x', properties: { score: 2 }, formatted_markdown: '![Image](smena-file:f)', assets: { 'image.png': 'f' } },
    ],
  };
  const bytes = buildKnowledgeArchive(data, [{ id: 'f', name: 'image.png', mimeType: 'image/png', data: new Uint8Array([1, 2, 3]) }]);
  const result = readKnowledgeArchive(bytes);
  assert.equal(result.payload.notes[0].formatted_markdown, data.knowledgeNotes[0].formatted_markdown);
  assert.equal(result.payload.knowledgeTypes[0].id, 'x');
  assert.deepEqual([...result.files[0].data], [1, 2, 3]);
  assert.equal(mapArchiveFiles(result.payload, { f: 'new' }).notes[0].assets['image.png'], 'new');
});
test('Markdown vault imports preserve folders, frontmatter, local links, media and CSV collections', () => {
  let id = 0;
  const zip = zipSync({
    'Guides/One.md': strToU8('---\ntitle: One\nscore: 5\n---\n[Two](../Two.md)\n![Image](../assets/image.png)'),
    'Two.md': strToU8('# Two\nBody'),
    'assets/image.png': new Uint8Array([1]),
    'Reading.csv': strToU8('Title,Comment\nOne,"a,b"'),
  });
  const result = readKnowledgeArchive(zip, { idFactory: prefix => prefix + ++id }),
    note = result.payload.notes.find(n => n.title === 'One');
  assert.equal(result.source, 'markdown');
  assert.ok(note.folderId);
  assert.equal(note.sourceProperties.score, '5');
  assert.ok(note.materialTargets['../Two.md']);
  assert.ok(note.assets['../assets/image.png']);
  assert.ok(note.tags.includes('Reading'));
  assert.equal(parseCollectionCsv('Title,Note\nOne,"a,b"')[0].Note, 'a,b');
  assert.equal(archivePath('../../escape'), null);
  assert.equal(archivePath('../Two.md', 'Guides'), 'Two.md');
  assert.throws(() => readKnowledgeArchive(zipSync({ '../escape.md': strToU8('Bad') })), /paths/);
});
