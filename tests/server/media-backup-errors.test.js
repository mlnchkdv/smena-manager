import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaBackupError } from '../../src/shared/media-backup-errors.js';
test('copy errors are actionable in both languages without exposing provider identifiers', () => {
  for (const ru of [false, true]) {
    assert.ok(!mediaBackupError({ message: 'private-token-object-id', status: 503 }, ru).includes('private'));
    assert.notEqual(mediaBackupError({ code: 'MEDIA_BACKUP_LIMIT' }, ru), mediaBackupError({}, ru));
    assert.notEqual(mediaBackupError({ status: 403 }, ru), mediaBackupError({}, ru));
    assert.notEqual(mediaBackupError({ code: 'MEDIA_SOURCE_CHANGED' }, ru), mediaBackupError({}, ru));
  }
  assert.match(mediaBackupError({ code: 'MEDIA_SOURCE_CHANGED' }, true), /контрольная сумма/);
});
