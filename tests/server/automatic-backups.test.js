import assert from 'node:assert/strict';
import test from 'node:test';
import { runAutomaticWorkspaceBackup } from '../../src/server/automatic-backups.js';

test('automatic backups are created once per local calendar day', async () => {
  const backups = [];
  let creates = 0;
  const options = {
    now: new Date('2026-10-18T01:00:00.000Z'),
    timeZone: 'Europe/Saratov',
    list: async () => [...backups],
    create: async label => {
      creates += 1;
      const backup = { id: `backup-${creates}`, label, createdAt: '2026-10-18T01:00:00.000Z' };
      backups.push(backup);
      return backup;
    },
    remove: async () => undefined,
  };

  const first = await runAutomaticWorkspaceBackup(options);
  const second = await runAutomaticWorkspaceBackup(options);

  assert.equal(first.created, true);
  assert.equal(first.label, 'Automatic backup 2026-10-18');
  assert.equal(second.created, false);
  assert.equal(creates, 1);
});

test('automatic backup retention removes only expired automatic copies', async () => {
  const removed = [];
  const backups = [
    { id: 'manual', label: 'Manual backup', createdAt: '2026-01-01T00:00:00.000Z' },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `auto-${index}`,
      label: `Automatic backup 2026-10-${String(18 - index).padStart(2, '0')}`,
      createdAt: `2026-10-${String(18 - index).padStart(2, '0')}T01:00:00.000Z`,
    })),
  ];

  const result = await runAutomaticWorkspaceBackup({
    now: new Date('2026-10-18T01:00:00.000Z'),
    timeZone: 'Europe/Saratov',
    retentionCount: 7,
    list: async () => backups,
    create: async () => assert.fail("today's automatic backup already exists"),
    remove: async id => removed.push(id),
  });

  assert.deepEqual(removed, ['auto-7', 'auto-8']);
  assert.deepEqual(result.removed, removed);
  assert.equal(result.retained, 7);
  assert.equal(removed.includes('manual'), false);
});
