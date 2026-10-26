import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownText, redundantMarkdownSummary } from '../../src/shared/markdown-text.js';
import { parseMarkdownNote } from '../../src/shared/markdown-import.js';
import { knowledgeExcerpt } from '../../src/shared/knowledge-search.js';

test('summaries preserve identifiers, hyphens and meaningful text', () => {
  const body = '**NAV-CHECK** `user_id` и _команда_ [docs](https://example.test) 🙂';
  assert.equal(markdownText(body), 'NAV-CHECK user_id и команда docs 🙂');
  assert.equal(parseMarkdownNote('guide.md', '# Guide\n\n' + body).summary, 'NAV-CHECK user_id и команда docs 🙂');
});
test('reading suppresses duplicate generated and legacy descriptions without rewriting data', () => {
  assert.equal(redundantMarkdownSummary('NAVCHECK user_id', '**NAV-CHECK** `user_id`'), true);
  assert.equal(redundantMarkdownSummary('Editorial summary', '# Guide\n\nDetailed body'), false);
  assert.equal(knowledgeExcerpt({ sourceFormat: 'text', formatted_markdown: '# literal user_id **text**' }, ''), '# literal user_id **text**');
});
