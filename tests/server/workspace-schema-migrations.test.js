import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateWorkspaceSchema } from '../../src/shared/workspace-schema-migrations.js';

test('schema migrations are ordered, pure, and preserve legacy notifications', () => {
  const legacy = { schemaVersion: 1, notifications: [{ id: 'n1' }] };
  const migrated = migrateWorkspaceSchema(legacy, 2);
  assert.deepEqual(migrated, { schemaVersion: 2, notifs: [{ id: 'n1' }] });
  assert.deepEqual(legacy, { schemaVersion: 1, notifications: [{ id: 'n1' }] });
});

test('missing migration steps fail closed', () => {
  assert.throws(() => migrateWorkspaceSchema({ schemaVersion: -1 }, 2), /Missing workspace schema migration -1 -> 0/);
});
