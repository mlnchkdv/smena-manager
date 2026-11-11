import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeExcerpt, noteCardExcerpt, createKnowledgeMatcher, knowledgeSearchContext } from '../../src/shared/knowledge-search.js';

test('blank card excerpts are bounded while searches retain distant matches and exact source', () => {
  const source = '# Opening\n\n' + 'Readable text '.repeat(150000) + '\n\nDISTANT_UNIQUE_TERM';
  const note = { id: 'large', formatted_markdown: source, sourceFormat: 'markdown' };
  const excerpt = noteCardExcerpt(note, '');
  assert.ok(excerpt.startsWith('Opening Readable text'));
  assert.ok(excerpt.length <= 181);
  assert.ok(excerpt.endsWith('…'));
  assert.match(knowledgeExcerpt(note, 'DISTANT_UNIQUE_TERM'), /DISTANT_UNIQUE_TERM/);
  assert.equal(knowledgeExcerpt({ ...note, summary: 'Short summary' }, ''), 'Short summary');
  assert.equal(knowledgeExcerpt({ ...note, summary: '   ' }, ''), excerpt);
  assert.equal(note.formatted_markdown, source);
});
import { knowledgeView } from '../../src/shared/knowledge-view.js';
test('card excerpts skip only the initial stock prompt while searches and stored source retain it', () => {
  const formatted_markdown = '# Новая заметка\n\nДобавьте сюда знания, регламент или рабочие договорённости команды.\n\nНастоящий регламент';
  const note = { formatted_markdown };
  assert.equal(noteCardExcerpt(note, ''), 'Настоящий регламент');
  assert.match(noteCardExcerpt(note, 'Добавьте'), /Добавьте/);
  assert.equal(note.formatted_markdown, formatted_markdown);
  assert.equal(noteCardExcerpt({ ...note, sourceFormat: 'text' }, ''), knowledgeExcerpt({ ...note, sourceFormat: 'text' }, ''));
});
test('search excerpts reveal matching body text even when a summary is present', () => {
  const note = { summary: 'Short description', formatted_markdown: `# Guide\n\n${'Context '.repeat(80)}ключевая фраза далее` };
  assert.equal(knowledgeExcerpt(note, ''), 'Short description');
  assert.match(knowledgeExcerpt(note, '"ключевая фраза"'), /ключевая фраза/);
  assert.match(knowledgeExcerpt(note, 'guide'), /Guide/);
  assert.match(knowledgeExcerpt(note, 'description'), /Short description/);
});
test('excerpts remain plain text and bounded for long Markdown sources', () => {
  const result = knowledgeExcerpt({ formatted_markdown: '# Heading\n\n**content** '.repeat(300) }, 'content', 80);
  assert.ok(result.length <= 82);
  assert.ok(!result.includes('*'));
  assert.equal(knowledgeExcerpt({}, 'none'), '');
});

test('card excerpts omit MD service metadata while metadata remains searchable and TXT stays literal', () => {
  const note = { sourceFormat: 'markdown', formatted_markdown: '---\ninternal_key: service-only-marker\n---\nUseful team body' };
  assert.equal(knowledgeExcerpt(note, ''), 'Useful team body');
  assert.equal(createKnowledgeMatcher('service-only-marker')(note), true);
  assert.equal(knowledgeExcerpt(note, 'service-only-marker'), 'Useful team body');
  assert.match(knowledgeExcerpt({ ...note, sourceFormat: 'text' }, ''), /internal_key: service-only-marker/);
});

test('blank searches on large collections never scan note bodies', () => {
  const notes = Array.from({ length: 3000 }, (_, i) => ({
    id: String(i),
    title: `Note ${i}`,
    get formatted_markdown() {
      throw new Error('Unnecessary full-text scan');
    },
  }));
  assert.equal(knowledgeView(notes, { query: '   ', limit: 60 }).visible.length, 60);
  assert.equal(createKnowledgeMatcher('')(notes[0]), true);
});

test('folder and tag filters exclude unrelated full text before searching', () => {
  const irrelevant = {
    id: 'other',
    folderId: 'other',
    tags: ['other'],
    get formatted_markdown() {
      throw new Error('Unrelated note body');
    },
  };
  const relevant = { id: 'match', folderId: 'target', tags: ['team'], formatted_markdown: 'Ключевая фраза Full text' };
  assert.equal(knowledgeView([irrelevant, relevant], { folder: 'target', query: 'full "ключевая фраза"' }).total, 1);
  assert.equal(knowledgeView([irrelevant, relevant], { tag: 'team', query: 'FULL ключевая' }).total, 1);
  const matcher = createKnowledgeMatcher('"Full text" ключевая');
  assert.equal(matcher(relevant), true);
  assert.equal(matcher({ formatted_markdown: 'Full other text ключевая' }), false);
});

test('summary hits avoid the body, while additional distant terms still select matching content', () => {
  const summaryOnly = {
    summary: 'Команда — release notes',
    get formatted_markdown() {
      throw Error('Unnecessary body scan');
    },
  };
  assert.equal(knowledgeExcerpt(summaryOnly, 'команда release'), summaryOnly.summary);
  assert.deepEqual(knowledgeSearchContext(summaryOnly, 'команда release'), { label: 'Matching text', text: summaryOnly.summary });
  const source = '**Команда** ' + 'readable '.repeat(150000) + '\n\nКоманда DISTANT_TERM';
  const note = { summary: 'Команда', formatted_markdown: source, sourceFormat: 'markdown' };
  const context = knowledgeSearchContext(note, 'команда distant_term');
  assert.equal(context.label, 'Matching text');
  assert.equal(context.text, knowledgeExcerpt(note, 'команда distant_term'));
  assert.equal(note.formatted_markdown, source);
});
