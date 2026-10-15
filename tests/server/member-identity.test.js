import assert from 'node:assert/strict';
import test from 'node:test';
import { bindAccessProfiles, bindInitialAdministrator, memberForProfile } from '../../src/shared/member-identity.js';

test('initial administrator is bound to the seed member without changing references', () => {
  const database = { me: 'm1', members: [{ id: 'm1', name: 'Demo', email: 'demo@example.test' }], tasks: [{ assignee: 'm1' }] };
  const profile = { id: 'admin-profile', name: 'Анна', email: 'anna@example.test', role: 'admin' };
  const bound = bindInitialAdministrator(database, profile);

  assert.equal(bound.me, 'm1');
  assert.equal(bound.members[0].authProfileId, 'admin-profile');
  assert.equal(bound.members[0].name, 'Анна');
  assert.equal(bound.tasks[0].assignee, 'm1');
  assert.equal(memberForProfile(bound, profile)?.id, 'm1');
});

test('member lookup falls back to profile ID and normalized email', () => {
  const database = { members: [{ id: 'member-id', email: 'USER@EXAMPLE.TEST' }] };
  assert.equal(memberForProfile(database, { id: 'member-id' })?.id, 'member-id');
  assert.equal(memberForProfile(database, { id: 'other', email: 'user@example.test' })?.id, 'member-id');
});

test('additional administrator gets a member without replacing an existing identity binding', () => {
  const database = {
    me: 'm1',
    members: [{ id: 'm1', name: 'Первый администратор', email: 'first@example.test', authProfileId: 'admin-first' }],
    tasks: [{ assignee: 'm1' }],
  };
  const profile = {
    id: 'admin-second',
    name: 'Второй администратор',
    email: 'second@example.test',
    title: 'CTO',
    team: 'eng',
    role: 'admin',
  };
  const bound = bindInitialAdministrator(database, profile);

  assert.equal(bound.members.length, 2);
  assert.equal(bound.members[0].authProfileId, 'admin-first');
  assert.equal(bound.members[0].email, 'first@example.test');
  assert.equal(bound.members[1].authProfileId, 'admin-second');
  assert.equal(bound.members[1].email, 'second@example.test');
  assert.equal(bound.members[1].title, 'CTO');
  assert.equal(bound.members[1].team, 'eng');
  assert.equal(bound.me, 'admin-second');
  assert.equal(bound.tasks[0].assignee, 'm1');
  assert.equal(memberForProfile(bound, profile)?.id, 'admin-second');
});

test('editor is appended as a member without taking over an unbound seed member', () => {
  const database = { me: 'm1', members: [{ id: 'm1', name: 'Existing member' }] };
  const profile = {
    id: 'editor-alex',
    name: 'Alex Alyoshin',
    email: 'alex@example.test',
    title: 'Creative Director',
    team: 'design',
    role: 'editor',
  };
  const bound = bindInitialAdministrator(database, profile);

  assert.equal(bound.members.length, 2);
  assert.equal(bound.members[0].authProfileId, undefined);
  assert.equal(bound.members[1].id, 'editor-alex');
  assert.equal(bound.members[1].role, 'Member');
  assert.equal(bound.members[1].title, 'Creative Director');
  assert.equal(bound.me, 'editor-alex');
});

test('all active access profiles are visible without changing the stored current member', () => {
  const database = {
    me: 'm1',
    members: [{ id: 'm1', name: 'Danila', email: 'danila@example.test', authProfileId: 'admin-danila' }],
  };
  const profiles = [
    { id: 'admin-danila', name: 'Danila', email: 'danila@example.test', title: 'CTO', role: 'admin', active: true },
    { id: 'editor-alex', name: 'Alex', email: 'alex@example.test', title: 'Creative Director', role: 'editor', active: true },
    { id: 'disabled', name: 'Disabled', email: 'disabled@example.test', role: 'viewer', active: false },
  ];
  const bound = bindAccessProfiles(database, profiles);

  assert.equal(bound.me, 'm1');
  assert.equal(bound.members.length, 2);
  assert.equal(bound.members[0].title, 'CTO');
  assert.equal(bound.members[1].id, 'editor-alex');
  assert.equal(
    bound.members.some(member => member.id === 'disabled'),
    false,
  );
});
