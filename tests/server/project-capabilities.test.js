import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadProject, canCommentProject, canEditProject } from '../../src/shared/project-access.js';

test('task affordances distinguish view, comment and edit at project and workspace boundaries', () => {
  const project = { id: 'project', access: 'private', lead: 'lead', members: ['member'], perms: { member: 'Can view' } };
  const abilities = (id, role = 'editor') => [canReadProject(project, id, role), canCommentProject(project, id, role), canEditProject(project, id, role)];
  assert.deepEqual(abilities('outsider'), [false, false, false]);
  assert.deepEqual(abilities('member'), [true, false, false]);
  project.perms.member = 'Can comment';
  assert.deepEqual(abilities('member'), [true, true, false]);
  project.perms.member = 'Can edit';
  assert.deepEqual(abilities('member'), [true, true, true]);
  project.perms.member = 'Full access';
  assert.deepEqual(abilities('member', 'viewer'), [true, false, false]);
  assert.deepEqual(abilities('lead', 'viewer'), [true, false, false]);
  assert.deepEqual(abilities('owner', 'admin'), [true, true, true]);
  assert.deepEqual([canReadProject(null, 'member'), canCommentProject(null, 'member'), canEditProject(null, 'member')], [false, false, false]);
});
