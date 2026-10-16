import assert from 'node:assert/strict';
import test from 'node:test';
import { isEmptyWorkspace, workspacePayload } from '../../src/core/workspace-snapshot.js';

test('workspace payload removes server metadata and keeps application data', () => {
  const payload = workspacePayload({
    schemaVersion: 1,
    revision: 4,
    createdAt: 'created',
    updatedAt: 'updated',
    workspace: { name: 'Smena Manager' },
    ws: { name: 'Команда' },
    projects: [{ id: 'p1' }],
    tasks: [],
  });

  assert.deepEqual(payload, {
    ws: { name: 'Команда' },
    projects: [{ id: 'p1' }],
    tasks: [],
  });
});

test('only a pristine server workspace is treated as empty', () => {
  assert.equal(isEmptyWorkspace({ revision: 0, members: [], projects: [], tasks: [], comments: [] }), true);
  assert.equal(
    isEmptyWorkspace({
      revision: 1,
      ws: { name: '' },
      members: [{ id: 'admin', authProfileId: 'admin' }],
      workspaces: [],
      projects: [],
      tasks: [],
      comments: [],
    }),
    true,
  );
  assert.equal(isEmptyWorkspace({ revision: 1, ws: { name: '' }, members: [{ id: 'legacy' }], projects: [], tasks: [], comments: [] }), false);
  assert.equal(isEmptyWorkspace({ revision: 0, ws: { name: 'Команда' }, projects: [], tasks: [] }), false);
  assert.equal(isEmptyWorkspace({ revision: 1, ws: { name: '' }, members: [], projects: [{ id: 'p1' }], tasks: [] }), false);
});
