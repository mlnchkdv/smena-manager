import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
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

test('ZIP import/export retains long original filenames and never interprets TXT as frontmatter', () => {
  const filename = 'source_name-' + 'long'.repeat(24) + '.txt';
  const source = '---\naliases: misleading\n---\nLiteral text';
  const imported = readKnowledgeArchive(zipSync({ ['Folder/' + filename]: strToU8(source) }));
  const note = imported.payload.notes[0];
  assert.equal(note.sourceName, filename);
  assert.equal(note.formatted_markdown, source);
  assert.deepEqual(note.sourceProperties, {});
  assert.ok(!note.aliases.includes('misleading'));
  const bytes = buildKnowledgeArchive({ ws: {}, knowledgeNotes: [note], knowledgeFolders: imported.payload.vault_folders });
  const result = readKnowledgeArchive(bytes).payload.notes[0];
  assert.equal(result.sourceName, filename);
  assert.equal(result.formatted_markdown, source);
});
test('standalone archive links preserve opaque IDs containing colons', () => {
  const bytes = buildKnowledgeArchive(
    {
      ws: {},
      knowledgeNotes: [
        { id: 'source', title: 'Source', formatted_markdown: '[[note:n:target|Target]]\n[[file:f:asset|Attachment]]' },
        { id: 'n:target', title: 'Target', formatted_markdown: 'Body' },
      ],
    },
    [{ id: 'f:asset', name: 'asset.txt', mimeType: 'text/plain', data: strToU8('Asset') }],
  );
  const entries = unzipSync(bytes);
  const source = strFromU8(entries['notes/Source--source.md']);
  const links = [...source.matchAll(/\]\(([^)]+)\)/g)];
  assert.equal(links.length, 2);
  for (const [, href] of links) {
    const path = decodeURIComponent(new URL(href, 'https://archive.invalid/notes/Source--source.md').pathname.slice(1));
    assert.ok(Object.hasOwn(entries, path), `Archive target must exist: ${path}`);
  }
  assert.equal(readKnowledgeArchive(bytes).payload.notes[0].formatted_markdown, '[[note:n:target|Target]]\n[[file:f:asset|Attachment]]');
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
