import test from 'node:test';
import assert from 'node:assert/strict';
import { recordedActivityIndex, compareProjectActivity } from '../../src/shared/recorded-activity.js';

const now = Date.UTC(2026, 9, 27);
test('recorded activity ignores demo counters, unknown task scopes and inaccessible projects', () => {
  const projects = [
    { id: 'allowed', name: 'Alpha', last: 0 },
    { id: 'unknown', name: 'Unknown', last: 4 },
  ];
  const result = recordedActivityIndex(
    {
      tasks: [{ id: 't', project: 'allowed', created: now - 5000, updated: now - 4000, assignee: 'not-an-actor' }],
      comments: [{ task: 't', by: 'writer', at: now - 2000 }],
      activity: [
        { task: 't', by: 'writer', at: now - 3000 },
        { project: 'private', by: 'hidden', at: now },
        { task: 'missing', by: 'hidden', at: now },
      ],
    },
    projects,
    now,
  );
  assert.equal(result.projects.get('allowed'), now - 2000);
  assert.equal(result.projects.has('unknown'), false);
  assert.equal(result.members.get('writer'), now - 2000);
  assert.equal(result.members.has('hidden'), false);
  assert.equal(result.members.has('not-an-actor'), false);
});
test('absolute times stay unchanged as time advances; invalid and future times are unknown', () => {
  const projects = [
    { id: 'p', createdAt: new Date(now - 10000).toISOString() },
    { id: 'future', createdAt: now + 3600000 },
    { id: 'bad', createdAt: 'bad' },
  ];
  const first = recordedActivityIndex({}, projects, now),
    later = recordedActivityIndex({}, projects, now + 60000);
  assert.equal(first.projects.get('p'), now - 10000);
  assert.equal(later.projects.get('p'), first.projects.get('p'));
  assert.equal(first.projects.size, 1);
});
test('recent ordering is newest first with deterministic ties and missing times last', () => {
  const projects = [
    { id: 'b', name: 'Same' },
    { id: 'a', name: 'Same' },
    { id: 'new', name: 'Newest' },
    { id: 'old', name: 'Old' },
  ];
  const times = new Map([
    ['new', now],
    ['old', now - 1000],
  ]);
  const original = structuredClone(projects);
  assert.deepEqual(
    [...projects].sort((a, b) => compareProjectActivity(a, b, times)).map(p => p.id),
    ['new', 'old', 'a', 'b'],
  );
  assert.deepEqual(projects, original);
});
