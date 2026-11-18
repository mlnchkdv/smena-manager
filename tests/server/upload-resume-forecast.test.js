import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadResumeForecast } from '../../src/shared/upload-resume-forecast.js';
test('upload review distinguishes retained access, a future prompt and reselect-only browsers without requesting permission', async () => {
  const entries = [
    { sourceHandle: { queryPermission: async () => 'granted' } },
    { sourceHandle: { queryPermission: async () => 'prompt' } },
    { sourceHandle: { queryPermission: async () => 'denied' } },
    {},
  ];
  assert.deepEqual(await uploadResumeForecast(entries), { automatic: 1, permission: 2, reselect: 1 });
  assert.deepEqual(await uploadResumeForecast(entries, { persistHandles: false }), { automatic: 0, permission: 0, reselect: 4 });
});
