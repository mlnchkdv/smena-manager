import assert from 'node:assert/strict';
import test from 'node:test';
import { createUploadTicket, verifyUploadTicket } from '../../src/server/upload-ticket.js';

const originalSecret = process.env.SESSION_SECRET;

test.before(() => {
  process.env.SESSION_SECRET = 'upload-ticket-test-secret-that-is-long-enough';
});

test.after(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

test('upload tickets preserve trusted metadata and reject tampering or expiry', () => {
  const ticket = createUploadTicket({ profileId: 'm1', filename: 'stored.pdf', size: 42 }, 1_000);
  assert.deepEqual(verifyUploadTicket(ticket, 2_000), {
    version: 1,
    profileId: 'm1',
    filename: 'stored.pdf',
    size: 42,
    expiresAt: 1_801_000,
  });
  assert.throws(() => verifyUploadTicket(`${ticket}x`, 2_000), /invalid/);
  assert.throws(() => verifyUploadTicket(ticket, 1_801_000), /expired/);
});
