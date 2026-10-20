import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareKnowledgeImport, decodeNoteFile } from '../../src/shared/knowledge-import.js';
const file = (name, content) => new File([content], name);

test('mixed TXT and Markdown imports preserve text, metadata and the chosen destination', async () => {
  const payload = await prepareKnowledgeImport(
    [
      file('Draft.TXT', '\uFEFF---\r\ntitle: Not metadata\r\n---\r\n  # literal heading\r\n'),
      file('guide.md', '---\ntitle: Руководство\ntags: [команда]\n---\n# Guide\n\nBody'),
    ],
    { folderId: 'folder', memberId: 'me', idFactory: () => 'note' },
  );
  assert.equal(payload.notes[0].title, 'Draft');
  assert.equal(payload.notes[0].formatted_markdown, '---\ntitle: Not metadata\n---\n  # literal heading\n');
  assert.deepEqual(payload.notes[0].tags, []);
  assert.equal(payload.notes[1].title, 'Руководство');
  assert.deepEqual(payload.notes[1].tags, ['команда']);
  assert.ok(payload.notes.every(note => note.folderId === 'folder' && note.createdBy === 'me'));
});
test('text decoding supports Cyrillic UTF-8, UTF-16 BOM and legacy Windows-1251', () => {
  assert.equal(decodeNoteFile(new TextEncoder().encode('Привет')), 'Привет');
  assert.equal(decodeNoteFile(Buffer.from([255, 254, 31, 4, 64, 4])), 'Пр');
  assert.equal(decodeNoteFile(Buffer.from([254, 255, 4, 31, 4, 64])), 'Пр');
  assert.equal(decodeNoteFile(Buffer.from([207, 240, 232, 226, 229, 242])), 'Привет');
  assert.throws(() => decodeNoteFile(Buffer.from([0, 1, 2])), /not a text/);
});
test('import rejects unsupported, empty and oversized batches without partial content', async () => {
  for (const [files, error] of [
    [[file('photo.png', 'binary')], /Only TXT/],
    [[file('empty.md', '  ')], /empty/],
    [Array.from({ length: 51 }, () => file('draft.txt', 'Text')), /50/],
    [[{ name: 'huge.md', size: 4 * 1024 * 1024 }], /4 MB/],
  ])
    await assert.rejects(() => prepareKnowledgeImport(files), error);
});
