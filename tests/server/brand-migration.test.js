import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateLegacyWorkspaceBrand } from '../../src/shared/workspace-brand.js';

test('legacy workspace branding migrates without mutating the stored snapshot', () => {
  const legacy = {
    workspace: { name: 'Gr8r Studio' },
    ws: { name: 'Gr8r Studio', url: 'gr8rstudio' },
    workspaces: [
      { id: 'w1', name: 'Gr8r Studio' },
      { id: 'w2', name: 'Personal' },
    ],
    members: [{ id: 'm1', email: 'hello@gr8rstudio.com' }],
    projects: [{ id: 'p1', desc: 'Refresh gr8rstudio.com' }],
    sessions: [{ id: 's1', dev: 'iPhone · Gr8r app' }],
  };

  const migrated = migrateLegacyWorkspaceBrand(legacy);

  assert.notEqual(migrated, legacy);
  assert.equal(legacy.ws.name, 'Gr8r Studio');
  assert.deepEqual(migrated.ws, { name: 'smena.team', url: 'smena-manager' });
  assert.equal(migrated.workspace.name, 'smena.team');
  assert.equal(migrated.workspaces[0].name, 'smena.team');
  assert.equal(migrated.workspaces[1].name, 'Personal');
  assert.equal(migrated.members[0].email, 'hello@example.com');
  assert.equal(migrated.projects[0].desc, 'Refresh smena.team');
  assert.equal(migrated.sessions[0].dev, 'iPhone · smena.team');
});
