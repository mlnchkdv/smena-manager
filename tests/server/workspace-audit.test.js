import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceAuditEvents } from '../../src/server/workspace-audit.js';

test('audit distinguishes restoration from purge and records the acting member', () => {
  const before = {
    members: [{ id: 'm', role: 'Member' }],
    trash: [
      { id: 'old', kind: 'bookmark', data: { link: { id: 'link' } } },
      { id: 'purged', kind: 'note', data: { note: { id: 'note' } } },
    ],
  };
  const after = {
    members: [{ id: 'm', role: 'Guest' }],
    trash: [{ id: 'new', kind: 'file', data: { file: { id: 'file' } } }],
    links: [{ id: 'link' }],
    knowledgeNotes: [],
  };
  const events = workspaceAuditEvents(before, after, 'actor', '2026-11-23T00:00:00Z');
  assert.deepEqual(
    events.map(e => [e.event, e.targetId, e.actorId]),
    [
      ['role', 'm', 'actor'],
      ['trashed', 'file', 'actor'],
      ['restored', 'link', 'actor'],
    ],
  );
  assert.equal(events[0].from, 'Member');
  assert.equal(events[0].to, 'Guest');
  assert.deepEqual(workspaceAuditEvents(after, after, 'actor', 'now'), []);
});
