import test from 'node:test';
import assert from 'node:assert/strict';
import { renderKnowledgeMarkdown, knowledgeReadingSource } from '../../src/shared/knowledge-markdown.js';
import { knowledgeDisplayParts } from '../../src/shared/knowledge-frontmatter.js';
import { parseMarkdownNote, parseTextNote } from '../../src/shared/markdown-import.js';
import { buildPortableWorkspace, mergePortableWorkspace } from '../../src/shared/portable-workspace.js';
test('portable Markdown renders lists, headings and fenced code safely', () => {
  const html = renderKnowledgeMarkdown('# Title\n- Item\n1. Next\n```html\n<script>alert(1)</script>\n```\n[bad](javascript:alert)\n[ok](https://example.com)');
  assert.match(html, /<h2>Title<\/h2>/);
  assert.match(html, /<ul><li>Item/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /rel="noopener noreferrer"/);
});
test('reading view removes only a matching first heading without modifying stored Markdown', () => {
  const note = { title: 'Заметка', formatted_markdown: '# Заметка\r\n\nТекст\n# Другая часть' };
  assert.equal(knowledgeReadingSource(note), '\nТекст\n# Другая часть');
  assert.match(note.formatted_markdown, /^# Заметка/);
  assert.equal(knowledgeReadingSource({ ...note, title: 'Другое название' }), note.formatted_markdown);
  assert.equal(knowledgeReadingSource({ title: 'Note', formatted_markdown: '# Note ###\nText' }), 'Text');
});

test('Markdown tables preserve alignment, escaped pipes, inline code and safe cell formatting', () => {
  const html = renderKnowledgeMarkdown(
    '| Раздел | Qty | Details |\n| :--- | ---: | :---: |\n| **Команда** | 2 | `a|b` and c\\|d |\n| <img src=x onerror=alert(1)> | 3 | [unsafe](javascript:alert) |\n\n# Next',
  );
  assert.match(html, /<table><thead><tr><th scope="col" class="knowledge-table-left">Раздел/);
  assert.match(html, /class="knowledge-table-right">Qty/);
  assert.match(html, /class="knowledge-table-center">Details/);
  assert.match(html, /<strong>Команда<\/strong>/);
  assert.match(html, /<code>a\|b<\/code> and c\|d/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img|href="javascript:/);
  assert.match(html, /<\/table><\/div><h2>Next<\/h2>/);
});

test('tables support optional edge pipes and incomplete rows without consuming fenced code', () => {
  const html = renderKnowledgeMarkdown('Name | Value\n--- | ---\nShort |\nA | B | Ignored\n```text\nX | Y\n--- | ---\n```');
  assert.match(html, /knowledge-table-left">Short<\/td><td class="knowledge-table-left"><\/td>/);
  assert.doesNotMatch(html, /Ignored/);
  assert.match(html, /<pre><code>X \| Y\n--- \| ---<\/code><\/pre>/);
  assert.equal((html.match(/<table>/g) || []).length, 1);
  assert.doesNotMatch(renderKnowledgeMarkdown('A | B\n-- | ---\nC | D'), /<table>/);
});

test('imported MD metadata is separated for reading while raw source and provenance survive portable round trips', () => {
  const source = '---\ntitle: Команда\nsummary: Кратко\ncustom_key: <script>not executable</script>\n---\n# Команда\n\nПолезный текст';
  const note = parseMarkdownNote('team.md', source, { idFactory: () => 'md' });
  const before = JSON.stringify(note);
  assert.equal(note.sourceFormat, 'markdown');
  assert.equal(knowledgeReadingSource(note), '\nПолезный текст');
  assert.match(knowledgeDisplayParts(note).metadata, /custom_key:/);
  assert.equal(JSON.stringify(note), before);
  const roundTrip = mergePortableWorkspace({ knowledgeNotes: [] }, buildPortableWorkspace({ knowledgeNotes: [note] })).data.knowledgeNotes[0];
  assert.equal(roundTrip.sourceFormat, 'markdown');
  assert.equal(roundTrip.formatted_markdown, source);
  assert.equal(knowledgeReadingSource(roundTrip), '\nПолезный текст');
});

test('TXT frontmatter-like text remains visible even when all metadata fields match', () => {
  const source = '---\ntitle: Literal\nsummary: Same summary\ncategory: Processes\n---\nBody';
  const note = { ...parseTextNote('Literal.txt', source), summary: 'Same summary', category: 'Processes' };
  assert.equal(note.sourceFormat, 'text');
  assert.deepEqual(knowledgeDisplayParts(note), { body: source, metadata: '' });
  assert.equal(knowledgeReadingSource(note), source);
});

test('legacy imported metadata is recognized conservatively and incomplete blocks stay visible', () => {
  const source = '\uFEFF---\r\ntitle: Legacy\r\nsummary: Stored summary\r\n---\r\n# Legacy\r\n\r\nBody';
  const legacy = { title: 'Legacy', summary: 'Stored summary', category: 'Imported', formatted_markdown: source };
  assert.equal(knowledgeReadingSource(legacy), '\r\nBody');
  assert.match(knowledgeDisplayParts(legacy).metadata, /title: Legacy/);
  const ambiguous = { title: 'Plain text', formatted_markdown: source };
  assert.deepEqual(knowledgeDisplayParts(ambiguous), { body: source, metadata: '' });
  for (const raw of ['---\nUnrelated text\n---\nBody', '---\ntitle: Unclosed\nBody', '# Title\n---\ntitle: Later\n---'])
    assert.deepEqual(knowledgeDisplayParts({ formatted_markdown: raw, sourceFormat: 'markdown' }), { body: raw, metadata: '' });
});

test('legacy MD remains readable after title and summary changes using matching retained source metadata', () => {
  const original = parseMarkdownNote('original.md', '---\ntitle: Original\nsummary: Initial summary\n---\n# Body\nText');
  delete original.sourceFormat;
  const renamed = { ...original, title: 'Renamed', summary: 'Edited summary', history: [{ ...original, id: 'v-original' }] };
  const before = JSON.stringify(renamed);
  assert.equal(knowledgeDisplayParts(renamed).body, '# Body\nText');
  assert.equal(JSON.stringify(renamed), before);
  const historical = { ...renamed, history: [original, renamed] };
  assert.equal(knowledgeDisplayParts(historical).body, '# Body\nText');
  assert.deepEqual(knowledgeDisplayParts({ ...renamed, sourceFormat: 'text' }), { body: original.formatted_markdown, metadata: '' });
});

test('unrelated, malformed and out-of-bound history never establishes legacy Markdown provenance', () => {
  const source = '---\ntitle: Original\nsummary: Initial summary\n---\nBody';
  const original = { title: 'Original', summary: 'Initial summary', category: 'Imported', formatted_markdown: source };
  const renamed = { ...original, title: 'Renamed', summary: 'Changed' };
  for (const history of [
    null,
    {},
    [null, 3, {}],
    [{ ...original, sourceFormat: 'text' }],
    [{ ...original, formatted_markdown: '# Unrelated' }],
    [{ ...original, formatted_markdown: source.replace('title: Original', 'title: Different') }],
    [...Array(6).fill({}), original],
  ]) {
    assert.deepEqual(knowledgeDisplayParts({ ...renamed, history }), { body: source, metadata: '' });
  }
});
