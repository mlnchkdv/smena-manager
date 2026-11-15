import assert from 'node:assert/strict';
import test from 'node:test';
import { fileCollectionTarget } from '../../src/shared/file-collection.js';

test('file collection destinations remain scoped to the account, workspace and live edit access', () => {
  const data = {
    ws: { id: 'w' },
    me: 'm',
    projects: [
      {
        id: 'p',
        name: 'Project',
        private: true,
        members: ['m'],
        fileFolders: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B', parentId: 'a' },
        ],
      },
    ],
  };
  const user = { id: 'u', role: 'editor' },
    target = { owner: 'u', workspace: 'w', project: 'p', folder: 'b' };
  const original = structuredClone(data);
  assert.equal(fileCollectionTarget(data, user, target).path, 'Project / A / B');
  for (const change of [{ owner: 'other' }, { workspace: 'other' }, { folder: 'missing' }])
    assert.equal(fileCollectionTarget(data, user, { ...target, ...change }), null);
  assert.equal(fileCollectionTarget(data, { ...user, role: 'viewer' }, target), null);
  assert.equal(fileCollectionTarget({ ...data, me: 'outsider' }, user, target), null);
  assert.equal(
    fileCollectionTarget({ ...data, projects: [{ ...data.projects[0], fileFolders: [{ id: 'b', name: 'B', archived: true }] }] }, user, target),
    null,
  );
  assert.deepEqual(data, original);
});
