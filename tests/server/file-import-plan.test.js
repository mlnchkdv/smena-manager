import test from 'node:test';
import assert from 'node:assert/strict';
import { planFileImport } from '../../src/shared/file-import-plan.js';
test('folder import reuses paths, preserves flat choice and never mutates the draft before confirmation', () => {
  let n = 0;
  const id = () => `f-${++n}`;
  const project = { fileFolders: [{ id: 'root', name: 'photos', parentId: null }] };
  const files = [
    { name: 'a.jpg', relativePath: 'photos/trip/a.jpg' },
    { name: 'b.jpg', relativePath: 'photos/trip/b.jpg' },
  ];
  const plan = planFileImport(project, files, null, true, id);
  assert.equal(plan.added, 1);
  assert.equal(plan.paths[0], plan.paths[1]);
  assert.equal(project.fileFolders.length, 1);
  assert.deepEqual(planFileImport(project, files, null, false, id).paths, [null, null]);
  assert.equal(planFileImport(project, [files[0], files[0]], null, true, id).collisions, 1);
  assert.throws(() => planFileImport(project, [{ name: 'a.jpg', relativePath: '../a.jpg' }], null, true, id));
});
