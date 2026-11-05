import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadCapacity } from '../../src/shared/upload-capacity.js';
test('quota estimates reserve queued bytes and never treat unknown capacity as free space', () => {
  assert.equal(uploadCapacity(100, { quotaBytes: 1000, usageBytes: 850 }, 60).sufficient, false);
  assert.equal(uploadCapacity(90, { quotaBytes: 1000, usageBytes: 850 }, 60).sufficient, true);
  assert.equal(uploadCapacity(100, { quotaBytes: null, usageBytes: null }).sufficient, null);
  assert.equal(uploadCapacity(100, { quotaBytes: 0, usageBytes: 0 }).availableBytes, null);
  assert.equal(uploadCapacity(100, { quotaBytes: 1000, usageBytes: 990, trashUsageBytes: 500 }).availableBytes, 10);
});
