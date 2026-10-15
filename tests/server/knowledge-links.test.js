import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanWikiTitle, extractWikiLinks, knowledgeRelations } from '../../src/shared/knowledge-links.js';

test('wiki links are cleaned and extracted without case-insensitive duplicates', () => {
  assert.equal(cleanWikiTitle(' [[Команда и роли]] '), 'Команда и роли');
  assert.deepEqual(extractWikiLinks('См. [[Онбординг]], [[онбординг]] и [[ Регламенты ]].'), ['Онбординг', 'Регламенты']);
});

test('knowledge relations resolve outgoing links and calculate backlinks', () => {
  const notes = [
    { id: 'n1', title: 'Онбординг', wikilinks: ['Команда и роли', 'Не создано'] },
    { id: 'n2', title: 'Команда и роли', formatted_markdown: 'Вернуться к [[Онбординг]].' },
    { id: 'n3', title: 'Регламенты', wikilinks: ['[[ОНБОРДИНГ]]', '[[Онбординг]]'] },
  ];

  const relations = knowledgeRelations(notes, notes[0]);

  assert.deepEqual(
    relations.outgoing.map(item => ({ title: item.title, id: item.note?.id || null })),
    [
      { title: 'Команда и роли', id: 'n2' },
      { title: 'Не создано', id: null },
    ],
  );
  assert.deepEqual(
    relations.backlinks.map(note => note.id),
    ['n2', 'n3'],
  );
});

test('relations remain useful for imported notes with stale wikilink arrays', () => {
  const notes = [
    { id: 'n1', title: 'Главная', wikilinks: [], formatted_markdown: 'Связано с [[Детали]].' },
    { id: 'n2', title: 'Детали', wikilinks: [] },
  ];

  assert.equal(knowledgeRelations(notes, notes[0]).outgoing[0].note.id, 'n2');
});
