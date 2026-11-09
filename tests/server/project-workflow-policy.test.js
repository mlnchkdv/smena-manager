import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveProjectWorkflows } from '../../src/server/project-workflow-policy.js';
import { defaultProjectWorkflow } from '../../src/shared/project-workflow.js';
import { mergeClientWorkspace } from '../../src/server/workspace-policy.js';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';
import { validateWorkspaceData } from '../../src/shared/workspace-schema.js';

test('full snapshot validation checks cycle references while retaining unrelated legacy fields without a configured process', () => {
  const data = {
    ...createEmptyDatabase(),
    projects: [{ id: 'p', workflow: defaultProjectWorkflow() }],
    tasks: [{ id: 'a', project: 'p', status: 'todo', cycleId: 'missing' }],
  };
  assert.throws(() => validateWorkspaceData(data), { code: 'WORKSPACE_INVALID' });
  data.projects[0].workflow.cycles = [{ id: 'missing', name: 'Archived cycle', start: '2026-11-09', end: '2026-11-15', archived: true }];
  assert.doesNotThrow(() => validateWorkspaceData(data), 'An archived cycle still identifies historical assignments');
  data.projects[0].workflow = null;
  assert.throws(() => validateWorkspaceData(data), { code: 'WORKSPACE_INVALID' }, 'An explicitly reset process has no cycles');
  delete data.projects[0].workflow;
  assert.doesNotThrow(() => validateWorkspaceData(data), 'Unconfigured legacy projects are not rewritten by the new feature');
});

test('ordinary workspace and trash writes retain canonical processes and cannot forge configuration provenance', () => {
  const project = { id: 'p', workflow: defaultProjectWorkflow(), workflowRevision: 2, workflowUpdatedBy: 'owner', workflowUpdatedAt: '2026-11-09T08:00:00Z' };
  const current = { projects: [project], trash: [] };
  const result = preserveProjectWorkflows(current, {
    projects: [
      { id: 'p', name: 'Rename' },
      { id: 'new', workflow: defaultProjectWorkflow(), workflowRevision: 99, workflowUpdatedBy: 'owner' },
    ],
    trash: [{ kind: 'project', data: { project: { id: 'p' } } }],
  });
  assert.deepEqual(result.projects[0].workflow, project.workflow);
  assert.equal(result.projects[0].workflowRevision, 2);
  assert.equal(result.projects[1].workflowRevision, undefined);
  assert.equal(result.projects[1].workflowUpdatedBy, undefined);
  assert.deepEqual(result.trash[0].data.project.workflow, project.workflow);
  const forged = structuredClone(project);
  forged.workflow.wip.progress = 3;
  for (const incoming of [{ projects: [forged] }, { trash: [{ kind: 'project', data: { project: forged } }] }])
    assert.throws(() => preserveProjectWorkflows(current, incoming), { code: 'WORKFLOW_ENDPOINT_REQUIRED' });
  assert.equal(project.workflow.wip.progress, 0);
});
test('private project authorization precedes workflow comparison; guessed configuration cannot become an oracle', () => {
  const current = {
    ...createEmptyDatabase(),
    me: 'owner',
    members: [
      { id: 'owner', role: 'Owner' },
      { id: 'editor', role: 'Member' },
    ],
    projects: [{ id: 'private', access: 'private', members: ['owner'], workflow: defaultProjectWorkflow() }],
  };
  for (const workflow of [null, defaultProjectWorkflow(), { version: 99 }]) {
    assert.throws(() => mergeClientWorkspace(current, { projects: [{ id: 'private', workflow }] }, 'editor', 'editor'), { statusCode: 403 });
  }
});
