import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeClientWorkspace, projectWorkspace } from '../../src/server/workspace-policy.js';
import { sanitizeDescription } from '../../src/server/content-security.js';
import { validateDocumentInput } from '../../src/shared/workspace-schema.js';

function fixture() {
  return {
    me: 'owner',
    members: [{ id: 'owner' }, { id: 'editor' }],
    projects: [
      { id: 'open', members: ['editor'] },
      { id: 'secret', private: true, members: ['owner'] },
    ],
    tasks: [
      { id: 'public-task', project: 'open' },
      { id: 'secret-task', project: 'secret' },
    ],
    comments: [{ id: 'secret-comment', task: 'secret-task', text: 'private' }],
    files: [{ id: 'f', project: 'open', storageFileId: 'trusted', storageName: 'trusted.txt', by: 'editor' }],
    notifs: [{ id: 'n1', recipient: 'owner', task: 'secret-task' }],
    notifPrefs: { owner: { email_security: true }, editor: { email_security: false } },
    projOrder: ['open', 'secret'],
    trash: [],
    activity: [],
    events: [],
    savedViews: [],
  };
}

test('workspace API projection hides private projects, related content and other notifications', () => {
  const result = projectWorkspace(fixture(), { id: 'editor', role: 'editor' });
  assert.deepEqual(
    result.projects.map(item => item.id),
    ['open'],
  );
  assert.deepEqual(
    result.tasks.map(item => item.id),
    ['public-task'],
  );
  assert.deepEqual(result.comments, []);
  assert.deepEqual(result.notifs, []);
  assert.deepEqual(Object.keys(result.notifPrefs), ['editor']);
});

test('filtered updates preserve hidden records and reject forged edits', () => {
  const current = fixture();
  const candidate = projectWorkspace(current, { id: 'editor', role: 'editor' });
  candidate.tasks[0].title = 'edited';
  const merged = mergeClientWorkspace(current, candidate, 'editor', 'editor');
  assert.equal(merged.tasks.find(item => item.id === 'secret-task').project, 'secret');
  assert.equal(merged.comments[0].text, 'private');
  assert.equal(merged.tasks.find(item => item.id === 'public-task').title, 'edited');
  const forged = structuredClone(candidate);
  forged.tasks.push({ id: 'secret-task', project: 'secret', title: 'forged' });
  assert.throws(() => mergeClientWorkspace(current, forged, 'editor', 'editor'), { code: 'ENTITY_FORBIDDEN' });
});

test('snapshot updates cannot forge storage metadata even for administrators', () => {
  const current = fixture();
  const candidate = structuredClone(current);
  candidate.files[0].storageFileId = 'foreign-drive-file';
  assert.throws(() => mergeClientWorkspace(current, candidate, 'admin', 'owner'), { code: 'ENTITY_FORBIDDEN' });
});

test('project view permission cannot be bypassed through snapshot writes', () => {
  const current = fixture();
  current.projects[0].perms = { editor: 'Can view' };
  const candidate = projectWorkspace(current, { id: 'editor', role: 'editor' });
  candidate.tasks[0].title = 'not allowed';
  assert.throws(() => mergeClientWorkspace(current, candidate, 'editor', 'editor'), { code: 'ENTITY_FORBIDDEN' });
});

test('rich text keeps formatting but strips active content and delegated actions', () => {
  const result = sanitizeDescription(
    '<p><b>Safe</b><button data-a="delWorkspace">Delete</button><a href="javascript:alert(1)">link</a><img src=x onerror="alert(1)"></p>',
  );
  assert.match(result, /<b>Safe<\/b>/u);
  assert.doesNotMatch(result, /data-a|javascript:|onerror|<img|<button/u);
});

test('malformed document updates are rejected rather than converted into empty collections', () => {
  assert.throws(() => validateDocumentInput('knowledge', { knowledgeNotes: 'broken', knowledgeFolders: [] }), { code: 'WORKSPACE_INVALID' });
  assert.throws(() => validateDocumentInput('bookmarks', {}), { code: 'WORKSPACE_INVALID' });
});
