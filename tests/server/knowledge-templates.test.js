import test from 'node:test';
import assert from 'node:assert/strict';
import { templateNote, validKnowledgeTemplates } from '../../src/shared/knowledge-templates.js';
test('templates expand only supported variables and never share mutable default values', () => {
  const template = {
    id: 'x',
    name: 'Meeting',
    title: '{{project}} — {{date}}',
    body: 'Author: {{user}}; {{unknown}}',
    typeId: 'meeting',
    properties: { date: '{{date}}', flag: false },
    tags: ['team'],
  };
  assert.equal(validKnowledgeTemplates([template]), true);
  assert.equal(validKnowledgeTemplates([null]), false);
  const note = templateNote(template, { id: 'a', now: '2026-10-31', day: '2026-10-31', author: 'Alex', project: '3DGS', memberId: 'alex' });
  assert.equal(note.title, '3DGS — 2026-10-31');
  assert.equal(note.formatted_markdown, 'Author: Alex; {{unknown}}');
  assert.equal(note.properties.flag, false);
  note.tags.push('changed');
  assert.equal(template.tags.length, 1);
});
