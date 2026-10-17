import assert from 'node:assert/strict';
import test from 'node:test';
import { createDraftJournal } from '../../src/core/offline-drafts.js';

test('drafts survive journal recreation and are isolated by owner, workspace and document', async () => {
  const records = new Map();
  const adapter = { get: async key => records.get(key), put: async item => records.set(item.key, item), delete: async key => records.delete(key) };
  const context = { owner: 'alice', workspace: 'team', scope: 'workspace' };
  await createDraftJournal(context, adapter).save({ base: { value: 'A' }, local: { value: 'B' }, revision: 7 });
  assert.equal((await createDraftJournal(context, adapter).read()).local.value, 'B');
  assert.equal(await createDraftJournal({ ...context, owner: 'bob' }, adapter).read(), undefined);
  assert.equal(await createDraftJournal({ ...context, scope: 'knowledge' }, adapter).read(), undefined);
  assert.equal(await createDraftJournal({ ...context, workspace: 'other' }, adapter).read(), undefined);
});

test('an acknowledgement cannot erase a newer queued draft', async () => {
  const records = new Map();
  const adapter = { get: async key => records.get(key), put: async item => records.set(item.key, item), delete: async key => records.delete(key) };
  const journal = createDraftJournal({ owner: 'alice', workspace: 'team', scope: 'workspace' }, adapter);
  await journal.save({ base: { value: 'A' }, local: { value: 'B' } });
  await journal.save({ base: { value: 'A' }, local: { value: 'C' } });
  await journal.acknowledge({ value: 'B' });
  assert.equal((await journal.read()).local.value, 'C');
  await journal.acknowledge({ value: 'C' });
  assert.equal(await journal.read(), undefined);
});
