import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdownFrontmatter, parseMarkdownNote } from '../../src/shared/markdown-import.js';

test('Markdown frontmatter supports scalar and list values', () => {
  const parsed = parseMarkdownFrontmatter('---\ntitle: "Онбординг"\ntags:\n  - команда\n  - процесс\n---\n# Текст');
  assert.equal(parsed.frontmatter.title, 'Онбординг');
  assert.deepEqual(parsed.frontmatter.tags, ['команда', 'процесс']);
  assert.equal(parsed.body, '# Текст');
});

test('Markdown notes preserve source and derive portable metadata', () => {
  const note = parseMarkdownNote(
    'fallback-name.md',
    '\uFEFF---\ntitle: Онбординг\ncategory: Processes\ntags: [#команда, процесс]\nskills: коммуникация, наставничество\n---\r\n# Онбординг\r\n\r\nНачните с [[Команда и роли]].',
    { idFactory: prefix => prefix + '-1', memberId: 'm1', now: '2026-10-15T00:00:00.000Z', folderId: 'f1' },
  );

  assert.equal(note.id, 'kn-1');
  assert.equal(note.title, 'Онбординг');
  assert.equal(note.category, 'Processes');
  assert.deepEqual(note.tags, ['команда', 'процесс']);
  assert.deepEqual(note.extracted_skills, ['коммуникация', 'наставничество']);
  assert.deepEqual(note.wikilinks, ['Команда и роли']);
  assert.equal(note.folderId, 'f1');
  assert.equal(note.createdBy, 'm1');
  assert.match(note.formatted_markdown, /\[\[Команда и роли\]\]/);
});

test('Markdown notes fall back to heading, filename, and plain summary', () => {
  const heading = parseMarkdownNote('readme.md', '# Регламент\n\nПравила работы команды.', { idFactory: () => 'n1' });
  const filename = parseMarkdownNote('team-process.md', 'Текст без заголовка.', { idFactory: () => 'n2' });

  assert.equal(heading.title, 'Регламент');
  assert.equal(heading.summary, 'Правила работы команды.');
  assert.equal(filename.title, 'team process');
  assert.equal(filename.summary, 'Текст без заголовка.');
  assert.throws(() => parseMarkdownNote('empty.md', '  '), /empty/u);
});
