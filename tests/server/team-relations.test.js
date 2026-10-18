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

test('saving a team preserves archived project relations hidden by the picker', () => {
  const database = {
    members: [],
    projects: [
      { id: 'archived', team: 'team-1', archived: true },
      { id: 'other-archive', team: 'team-2', archived: true },
      { id: 'active', team: 'team-1' },
    ],
  };
  assignTeamRelations(database, 'team-1', [], ['other-archive']);
  assert.equal(database.projects[0].team, 'team-1');
  assert.equal(database.projects[1].team, 'team-2');
  assert.equal(database.projects[2].team, '');
});

test('hidden inactive members retain their team and cannot be reassigned by stale selections', () => {
  const database = {
    members: [
      { id: 'disabled', team: 'team-1', status: 'deactivated' },
      { id: 'removed', team: 'team-2', status: 'removed' },
      { id: 'active', team: 'team-1', status: 'active' },
    ],
  };
  assignTeamRelations(database, 'team-1', ['removed'], []);
  assert.deepEqual(
    database.members.map(member => member.team),
    ['team-1', 'team-2', ''],
  );
});
