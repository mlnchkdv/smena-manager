import assert from 'node:assert/strict';
import test from 'node:test';
import { assignTeamRelations, primaryTeamId } from '../../src/shared/team-relations.js';

test('project creation falls back to an existing team', () => {
  const teams = [
    { id: 'creative', name: 'Creative' },
    { id: 'engineering', name: 'Engineering' },
  ];

  assert.equal(primaryTeamId(teams, 'engineering'), 'engineering');
  assert.equal(primaryTeamId(teams, 'obsolete-profile-team'), 'creative');
  assert.equal(primaryTeamId([], 'obsolete-profile-team'), '');
});

test('team editing persists selected members and projects together', () => {
  const database = {
    members: [
      { id: 'me', team: '' },
      { id: 'other', team: 'team-1' },
    ],
    projects: [
      { id: 'project-1', team: '' },
      { id: 'project-2', team: 'team-1' },
    ],
  };

  assignTeamRelations(database, 'team-1', ['me'], ['project-1']);

  assert.equal(database.members[0].team, 'team-1');
  assert.equal(database.members[1].team, '');
  assert.equal(database.projects[0].team, 'team-1');
  assert.equal(database.projects[1].team, '');
});
