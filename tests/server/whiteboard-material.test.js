import test from 'node:test';
import assert from 'node:assert/strict';
import { whiteboardMaterialPreview } from '../../src/shared/whiteboard-material.js';

test('cold catalog material keeps its authorized excerpt without downloading or materializing the body', () => {
  for (const text of ['Readable excerpt', 'Читаемый фрагмент']) {
    const item = { id: 'cold', title: 'Title', sourceFormat: 'markdown', summary: '', bodyPending: true, bodyPreview: text };
    const before = structuredClone(item);
    assert.equal(whiteboardMaterialPreview({ kind: 'note', item }).text, text);
    assert.deepEqual(item, before);
    assert.equal(whiteboardMaterialPreview({ kind: 'note', item: { ...item, formatted_markdown: 'Updated body' } }).text, 'Updated body');
  }
});
test('linked previews stay live, bounded and outside the board body while hiding Markdown service metadata', () => {
  const item = {
    title: 'Original',
    sourceFormat: 'markdown',
    formatted_markdown: '---\ntitle: Original\nsecret: import-only\n---\n# Visible\n\nBody **text**.',
    tags: ['a', 'b', 'c', 'd'],
  };
  const before = JSON.stringify(item);
  const preview = whiteboardMaterialPreview({ kind: 'note', item });
  assert.match(preview.text, /Visible Body text/);
  assert.doesNotMatch(preview.text, /import-only|secret/);
  assert.equal(preview.tags.length, 3);
  assert.equal(JSON.stringify(item), before);
  item.formatted_markdown = 'New version';
  assert.equal(whiteboardMaterialPreview({ kind: 'note', item }).text, 'New version');
  item.formatted_markdown = 'x'.repeat(200000);
  assert.ok(whiteboardMaterialPreview({ kind: 'note', item }).text.length <= 240);
  item.sourceFormat = 'text';
  item.formatted_markdown = '---\ntitle: ordinary TXT\n---\nBody';
  assert.match(whiteboardMaterialPreview({ kind: 'note', item }).text, /ordinary TXT/);
});
test('unavailable material has no preview and media icons never require a download', () => {
  assert.equal(whiteboardMaterialPreview(null), null);
  assert.equal(whiteboardMaterialPreview({ kind: 'file', item: { name: 'Photo.png', mimeType: 'image/png' } }).icon, 'image');
  assert.equal(whiteboardMaterialPreview({ kind: 'bookmark', item: { url: 'https://example.test/private/path' } }).text, 'example.test');
});
