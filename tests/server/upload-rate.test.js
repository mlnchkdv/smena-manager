import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleUploadRate, uploadEstimate } from '../../src/shared/upload-rate.js';
test('upload estimate requires samples and suppresses ETA for paused queues', () => {
  let sample = sampleUploadRate(null, 100, 0);
  sample = sampleUploadRate(sample, 1100, 1000);
  assert.equal(uploadEstimate([{ phase: 'uploading', bytes: 4100, accepted: 1100, rateSample: sample }]).seconds, null);
  sample = sampleUploadRate(sample, 2100, 2000);
  const job = { phase: 'uploading', bytes: 4100, accepted: 2100, rateSample: sample };
  assert.equal(uploadEstimate([job]).seconds, 2);
  assert.equal(uploadEstimate([job, { phase: 'paused', bytes: 1000 }]).seconds, null);
  assert.equal(sampleUploadRate(sample, 2000, 3000).rate, 0);
  assert.equal(sampleUploadRate(sample, 2200, 20000).rate, 0);
});
