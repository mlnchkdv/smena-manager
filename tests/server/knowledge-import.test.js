import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareKnowledgeImport, decodeNoteFile, reviewKnowledgeImport } from '../../src/shared/knowledge-import.js';
import { mergePortableWorkspace } from '../../src/shared/portable-workspace.js';
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
test('mass intake reports each invalid file without hiding the valid subset', async () => {
  const result = await reviewKnowledgeImport([
    file('Good.md', '# Хорошая заметка\nТекст'),
    file('empty.txt', '  '),
    file('other.pdf', 'PDF'),
    {
      name: 'broken.txt',
      size: 20,
      arrayBuffer: async () => {
        throw new Error('OS detail');
      },
    },
  ]);
  assert.equal(result.payload.notes.length, 1);
  assert.equal(result.entries.length, 4);
  assert.equal(result.entries[0].id, result.payload.notes[0].id);
  assert.equal(result.entries[1].error, 'The note file is empty.');
  assert.equal(result.entries[2].name, 'other.pdf');
  assert.equal(result.entries[3].error, 'The file could not be read.');
  assert.throws(() => decodeNoteFile(Buffer.from([255, 254, 1])), /not a text/);
});
test('fifty mixed files import once and repeated batches are skipped without changing content', async () => {
  const files = Array.from({ length: 50 }, (_, i) => file(`Заметка ${i}.${i % 2 ? 'txt' : 'md'}`, `Содержимое ${i}\n\nTeam document ${i}`));
  let id = 0;
  const progress = [];
  const result = await reviewKnowledgeImport(files, {
    folderId: 'team',
    idFactory: () => `n-${id++}`,
    onProgress: (done, total) => progress.push([done, total]),
  });
  const current = { knowledgeNotes: [], knowledgeFolders: [{ id: 'team', name: 'Team' }] };
  const first = mergePortableWorkspace(current, result.payload);
  assert.equal(first.counts.notes, 50);
  assert.equal(first.data.knowledgeNotes.filter(note => note.folderId === 'team').length, 50);
  assert.deepEqual(progress.at(-1), [50, 50]);
  const repeat = await reviewKnowledgeImport(files, { idFactory: () => `n-${id++}` });
  const second = mergePortableWorkspace(first.data, repeat.payload);
  assert.equal(second.counts.notes, 0);
  assert.equal(second.counts.skipped, 50);
  assert.deepEqual(second.data.knowledgeNotes, first.data.knowledgeNotes);
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
