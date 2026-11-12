import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { backupInventory, verifyBackupInventory } from '../../deploy/vps/backup-inventory.mjs';
test('offline copy inventory detects byte corruption, missing and extra objects without modifying the export', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-inventory-'));
  try {
    await fs.mkdir(path.join(directory, 'objects'));
    const target = path.join(directory, 'objects', 'video.bin');
    await fs.writeFile(target, Buffer.alloc(1024 * 1024 + 17, 19));
    const inventory = await backupInventory(directory);
    assert.equal((await verifyBackupInventory(directory, inventory)).verified, true);
    await fs.writeFile(target, Buffer.alloc(1024 * 1024 + 17, 20));
    await assert.rejects(verifyBackupInventory(directory, inventory), /mismatch/);
    await fs.unlink(target);
    await assert.rejects(verifyBackupInventory(directory, inventory), /empty/);
    await fs.writeFile(target, Buffer.alloc(1024 * 1024 + 17, 19));
    await fs.writeFile(path.join(directory, 'extra'), 'extra');
    await assert.rejects(verifyBackupInventory(directory, inventory), /mismatch/);
  } finally {
    assert.ok(directory.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('smena-inventory-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
