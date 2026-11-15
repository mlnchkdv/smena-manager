import assert from 'node:assert/strict';
import test from 'node:test';
import { validProjectStatus, migrateProjectStatuses } from '../../src/shared/project-status.js';
import { projectStatus } from '../../src/core/constants.js';
import { validateWorkspaceData } from '../../src/shared/workspace-schema.js';

test('unknown project status is rejected on write, recovered on legacy read and safe to display', () => {
  const data = Object.fromEntries(
    [
      'workspaces',
      'members',
      'projects',
      'tasks',
      'comments',
      'knowledgeNotes',
      'knowledgeFolders',
      'links',
      'linkFolders',
      'files',
      'activity',
      'notifs',
      'events',
      'savedViews',
      'sessions',
      'invoices',
      'trash',
      'projOrder',
      'recentSearches',
    ].map(key => [key, []]),
  );
  data.projects = [{ id: 'p', status: 'future-state' }];
  assert.throws(
    () => validateWorkspaceData(data),
    error => error.fields.includes('projects.status'),
  );
  migrateProjectStatuses(data);
  assert.equal(data.projects[0].status, 'planning');
  assert.equal(data.projects[0].legacyStatus, 'future-state');
  assert.doesNotThrow(() => validateWorkspaceData(data));
  assert.equal(validProjectStatus('constructor'), false);
  assert.equal(projectStatus('constructor').name, 'Unknown status');
  assert.equal(projectStatus('active').name, 'In Progress');
});
