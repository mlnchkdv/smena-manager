import test from 'node:test';
import assert from 'node:assert/strict';
import { inboxCategoryMatches } from '../../src/shared/notification-workflow.js';
import { inboxEventGroups } from '../../src/shared/inbox-groups.js';
import { knowledgeView } from '../../src/shared/knowledge-view.js';
import { planFileImport } from '../../src/shared/file-import-plan.js';
test('large personal feeds preserve identities and shared read state through request filtering and technical grouping', () => {
  const events = Array.from({ length: 10000 }, (_, i) => ({
    id: String(i),
    type: i % 2 ? 'system' : 'mention',
    read: i % 3 === 0,
    text: 'Repeated status',
    snippet: 'Same incident',
    workspace: 'a',
  }));
  const grouped = inboxEventGroups(events);
  assert.equal(new Set(grouped.flatMap(group => [group.notification, ...group.earlier]).map(item => item.id)).size, 10000);
  assert.equal(events.filter(event => inboxCategoryMatches(event, 'actionable')).length, 5000);
  assert.ok(grouped.every(group => group.earlier.every(item => item.read)));
  assert.equal(events.filter(event => !event.read).length, 6666);
});
test('10k typed notes sort before paging and deep folder import plans retain a bounded 500-file batch', () => {
  const notes = Array.from({ length: 10000 }, (_, i) => ({
    id: String(i),
    title: `n${i}`,
    typeId: 'custom',
    properties: { score: 10000 - i },
    tags: ['team'],
  }));
  const page = knowledgeView(notes, { tag: 'team', propertySort: { key: 'property:custom:score' }, limit: 60, offset: 60 });
  assert.equal(page.total, 10000);
  assert.equal(page.visible.length, 60);
  assert.equal(page.visible[0].properties.score, 61);
  let id = 0;
  const files = Array.from({ length: 500 }, (_, i) => ({ name: `image-${i}.jpg`, relativePath: `photos/day-${Math.floor(i / 10)}/image-${i}.jpg` }));
  const plan = planFileImport({ fileFolders: [] }, files, null, true, () => `folder-${++id}`);
  assert.equal(plan.added, 51);
  assert.equal(plan.paths.length, 500);
  assert.equal(plan.collisions, 0);
});
