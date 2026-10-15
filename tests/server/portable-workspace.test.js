import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPortableWorkspace, mergePortableWorkspace } from '../../src/shared/portable-workspace.js';

const emptyWorkspace = () => ({ knowledgeNotes: [], knowledgeFolders: [], links: [], linkFolders: [] });
const ids = prefix => prefix + '-generated';

test('KMS Brain workspace snapshots import notes, folders, and bookmarks', () => {
  const payload = {
    format: 'kms-brain-workspace',
    version: 1,
    notes: [
      {
        id: 'note-1',
        title: 'Онбординг',
        category: 'Processes',
        summary: 'Порядок адаптации',
        tags: ['Команда'],
        wikilinks: ['Команда и роли'],
        formatted_markdown: '# Онбординг',
        folder_id: 'vault-1',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
    ],
    vault_folders: [{ id: 'vault-1', name: 'Регламенты', parent_id: null, created_at: '2026-01-01T00:00:00.000Z' }],
    links: [
      {
        id: 'link-1',
        url: 'example.com/design/',
        title: 'Дизайн-система',
        description: 'Компоненты',
        folder: 'links-1',
        importance: 'high',
        tags: ['UI'],
      },
    ],
    link_folders: [{ id: 'links-1', name: 'Инструменты', color: '#10B981' }],
  };

  const result = mergePortableWorkspace(emptyWorkspace(), payload, { idFactory: ids, now: '2026-10-15T00:00:00.000Z' });

  assert.deepEqual(result.counts, { notes: 1, knowledgeFolders: 1, links: 1, linkFolders: 1, skipped: 0, invalid: 0 });
  assert.equal(result.data.knowledgeNotes[0].folderId, 'vault-1');
  assert.equal(result.data.knowledgeNotes[0].formatted_markdown, '# Онбординг');
  assert.equal(result.data.links[0].folder, 'links-1');
  assert.equal(result.data.links[0].url, 'https://example.com/design');
  assert.deepEqual(result.data.links[0].tags, ['ui']);
});

test('portable imports skip duplicates without replacing existing workspace data', () => {
  const current = {
    ...emptyWorkspace(),
    knowledgeNotes: [{ id: 'note-1', title: 'Онбординг', formatted_markdown: '# Existing' }],
    links: [{ id: 'link-1', url: 'https://example.com/design', title: 'Existing link' }],
  };
  const payload = {
    notes: [{ id: 'different-id', title: ' онбординг ', formatted_markdown: '# Imported' }],
    links: [{ id: 'different-link', url: 'https://example.com/design/', title: 'Imported link' }],
  };

  const result = mergePortableWorkspace(current, payload, { idFactory: ids });

  assert.equal(result.data.knowledgeNotes.length, 1);
  assert.equal(result.data.knowledgeNotes[0].formatted_markdown, '# Existing');
  assert.equal(result.data.links.length, 1);
  assert.equal(result.data.links[0].title, 'Existing link');
  assert.equal(result.counts.skipped, 2);
});

test('standalone KMS notes and bookmark exports are supported', () => {
  const notes = mergePortableWorkspace(emptyWorkspace(), [{ id: 'n1', title: 'Заметка', formatted_markdown: '# Текст' }], { idFactory: ids });
  assert.equal(notes.counts.notes, 1);

  const bookmarks = mergePortableWorkspace(emptyWorkspace(), {
    folders: [{ id: 'f1', name: 'Сервисы' }],
    links: [{ id: 'l1', url: 'https://example.org', title: 'Сервис', folder: 'f1' }],
  });
  assert.equal(bookmarks.counts.linkFolders, 1);
  assert.equal(bookmarks.counts.links, 1);
  assert.equal(bookmarks.data.links[0].folder, 'f1');
});

test('portable export keeps KMS-compatible collection names', () => {
  const exported = buildPortableWorkspace(
    {
      knowledgeNotes: [{ id: 'n1', title: 'Note' }],
      knowledgeFolders: [{ id: 'f1', name: 'Folder', parentId: null, createdAt: '2026-01-01T00:00:00.000Z' }],
      links: [{ id: 'l1', url: 'https://example.com' }],
      linkFolders: [{ id: 'lf1', name: 'Links', parent_id: null, color: '#10B981', created_at: '2026-01-01T00:00:00.000Z' }],
    },
    '2026-10-15T00:00:00.000Z',
  );

  assert.equal(exported.format, 'smena-manager-portable');
  assert.equal(exported.notes.length, 1);
  assert.equal(exported.vault_folders[0].parent_id, null);
  assert.equal(exported.link_folders[0].color, '#10B981');
});
