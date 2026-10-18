import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeClientWorkspace, projectWorkspace } from '../../src/server/workspace-policy.js';
import { sanitizeDescription } from '../../src/server/content-security.js';
import { validateDocumentInput, validateWorkspaceData } from '../../src/shared/workspace-schema.js';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';

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

test('project comment permission permits comments but not task edits, and leads retain ACL control', () => {
  const current = fixture();
  current.projects[0].perms = { editor: 'Can comment' };
  const candidate = projectWorkspace(current, { id: 'editor', role: 'editor' });
  candidate.comments.push({ id: 'new', task: 'public-task', by: 'editor', text: 'Comment' });
  assert.ok(mergeClientWorkspace(current, candidate, 'editor', 'editor').comments.some(comment => comment.id === 'new'));
  candidate.tasks[0].title = 'Forbidden edit';
  assert.throws(() => mergeClientWorkspace(current, candidate, 'editor', 'editor'), { code: 'ENTITY_FORBIDDEN' });
  current.projects[0].lead = 'editor';
  const lead = projectWorkspace(current, { id: 'editor', role: 'editor' });
  lead.projects[0].members.push('owner');
  assert.ok(
    mergeClientWorkspace(current, lead, 'editor', 'editor')
      .projects.find(project => project.id === 'open')
      .members.includes('owner'),
  );
});

test('a known private physical file cannot be aliased into a public project after access is lost', () => {
  const current = fixture();
  const privateFile = { id: 'private-file', project: 'secret', storageFileId: 'private-physical', storageName: 'private.txt', by: 'editor' };
  current.files.push(privateFile);
  const candidate = projectWorkspace(current, { id: 'editor', role: 'editor' });
  candidate.tasks[0].title = 'Allowed public edit';
  assert.ok(mergeClientWorkspace(current, candidate, 'editor', 'editor').files.some(file => file.id === privateFile.id));
  candidate.files.push({ ...privateFile, id: 'new-alias', project: 'open' });
  assert.throws(() => mergeClientWorkspace(current, candidate, 'editor', 'editor'), { code: 'ENTITY_FORBIDDEN' });
});

test('comment authorship and other members reactions cannot be forged', () => {
  const current = fixture();
  current.comments.push({ id: 'c', task: 'public-task', by: 'owner', at: 10, text: 'Original', reactions: { '👍': ['owner'] } });
  const candidate = projectWorkspace(current, { id: 'editor', role: 'editor' });
  candidate.comments[0].by = 'editor';
  assert.throws(() => mergeClientWorkspace(current, candidate, 'editor', 'editor'), { code: 'ENTITY_FORBIDDEN' });
  candidate.comments[0].by = 'owner';
  candidate.comments[0].reactions['👍'].push('editor');
  assert.ok(mergeClientWorkspace(current, candidate, 'editor', 'editor'));
  candidate.comments[0].reactions['👍'] = ['editor'];
  assert.throws(() => mergeClientWorkspace(current, candidate, 'editor', 'editor'), { code: 'ENTITY_FORBIDDEN' });
});

test('unsafe identity strings and active markup reaction names are rejected', () => {
  const data = createEmptyDatabase();
  data.tasks.push({ id: 'bad" data-a="signOut' });
  assert.throws(() => validateWorkspaceData(data), { code: 'WORKSPACE_INVALID' });
  data.tasks = [];
  data.comments.push({ id: 'c', reactions: { '<button>': ['m'] } });
  assert.throws(() => validateWorkspaceData(data), { code: 'WORKSPACE_INVALID' });
  data.comments = [{ id: 'c', re: { '👍': ['m'] } }];
  assert.ok(validateWorkspaceData(data));
  data.comments[0].re = { '<button>': ['m'] };
  assert.throws(() => validateWorkspaceData(data), { code: 'WORKSPACE_INVALID' });
  const workspace = createEmptyDatabase();
  workspace.ws = { c: '#fff" data-a="signOut' };
  assert.throws(() => validateWorkspaceData(workspace), { code: 'WORKSPACE_INVALID' });
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

test('nested task entities and folder graphs reject malformed values, duplicate identities and cycles', () => {
  const data = createEmptyDatabase();
  data.tasks = [{ id: 't', subtasks: ['not-an-object'] }];
  assert.throws(() => validateWorkspaceData(data), { code: 'WORKSPACE_INVALID' });
  data.tasks[0].subtasks = [{ id: 's' }, { id: 's' }];
  assert.throws(() => validateWorkspaceData(data), { code: 'WORKSPACE_INVALID' });
  data.tasks[0].subtasks = [];
  data.tasks[0].attachments = [null];
  assert.throws(() => validateWorkspaceData(data), { code: 'WORKSPACE_INVALID' });
  const document = {
    knowledgeFolders: [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ],
    knowledgeNotes: [],
  };
  assert.throws(() => validateDocumentInput('knowledge', document), { code: 'WORKSPACE_INVALID' });
  document.knowledgeFolders = [{ id: 'a', parentId: 'missing' }];
  assert.throws(() => validateDocumentInput('knowledge', document), { code: 'WORKSPACE_INVALID' });
  document.knowledgeFolders = [];
  document.knowledgeNotes = [{ id: 'n', folderId: 'missing' }];
  assert.throws(() => validateDocumentInput('knowledge', document), { code: 'WORKSPACE_INVALID' });
  document.knowledgeNotes = [];
  document.knowledgeFolders = Array.from({ length: 201 }, (_, index) => ({ id: `f${index}`, parentId: index ? `f${index - 1}` : null }));
  assert.throws(() => validateDocumentInput('knowledge', document), { code: 'WORKSPACE_INVALID' });
});
