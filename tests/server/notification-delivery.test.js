import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  notificationDeliveryStatus,
  claimNotificationTestCooldown,
  recordNotificationCronRun,
  recordNotificationDelivery,
  resetNotificationDeliveryForTests,
} from '../../src/server/notification-delivery.js';
import { resetStorageProvider } from '../../src/server/storage/index.js';

test('delivery diagnostics retain channel totals and the latest cron result', async t => {
  const testRoot = path.join(process.cwd(), '.data', 'tests');
  await fs.promises.mkdir(testRoot, { recursive: true });
  const directory = await fs.promises.mkdtemp(path.join(testRoot, 'notification-delivery-'));
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
  resetStorageProvider();
  resetNotificationDeliveryForTests();
  t.after(async () => {
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    resetStorageProvider();
    resetNotificationDeliveryForTests();
    await fs.promises.rm(directory, { recursive: true, force: true });
  });

  await recordNotificationDelivery(
    {
      push: { attempted: 2, delivered: 1, failed: 1, retried: 1, removed: 0 },
      email: { attempted: 1, delivered: 1, failed: 0, retried: 0, removed: 0 },
    },
    { source: 'workspace', notifications: 2, at: '2026-10-17T10:00:00.000Z' },
  );
  await recordNotificationCronRun({ status: 'ok', reminders: { created: 1 } }, { at: '2026-10-17T11:00:00.000Z' });
  const status = await notificationDeliveryStatus();

  assert.equal(status.delivery.lastRun.notifications, 2);
  assert.equal(status.delivery.totals.push.retried, 1);
  assert.equal(status.delivery.totals.email.delivered, 1);
  assert.equal(status.delivery.lastCron.status, 'ok');
});

test('diagnostic notification cooldown is persisted and claimed atomically', async t => {
  const testRoot = path.join(process.cwd(), '.data', 'tests');
  const directory = await fs.promises.mkdtemp(path.join(testRoot, 'notification-cooldown-'));
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(directory, 'workspace.json');
  resetStorageProvider();
  resetNotificationDeliveryForTests();
  t.after(async () => {
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    resetStorageProvider();
    resetNotificationDeliveryForTests();
    await fs.promises.rm(directory, { recursive: true, force: true });
  });
  const now = Date.now();
  assert.equal(await claimNotificationTestCooldown('admin:email', 60_000, now), true);
  assert.equal(await claimNotificationTestCooldown('admin:email', 60_000, now + 1_000), false);
  assert.equal(await claimNotificationTestCooldown('admin:email', 60_000, now + 61_000), true);
});
