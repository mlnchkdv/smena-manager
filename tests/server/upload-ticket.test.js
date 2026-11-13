import assert from 'node:assert/strict';
import test from 'node:test';
import { createUploadTicket, renewUploadTicket, verifyUploadTicket } from '../../src/server/upload-ticket.js';
import { inWorkspace } from '../../src/server/workspace-context.js';

const originalSecret = process.env.SESSION_SECRET;

test.before(() => {
  process.env.SESSION_SECRET = 'upload-ticket-test-secret-that-is-long-enough';
});

test.after(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

test('upload tickets preserve trusted metadata and reject tampering or expiry', () => {
  const ticket = createUploadTicket({ profileId: 'm1', filename: 'stored.pdf', size: 42, folderId: 'folder-a' }, 1_000);
  assert.deepEqual(verifyUploadTicket(ticket, 2_000), {
    version: 1,
    profileId: 'm1',
    filename: 'stored.pdf',
    size: 42,
    folderId: 'folder-a',
    workspace: 'default',
    expiresAt: 86_401_000,
    renewUntil: 604_801_000,
  });
  assert.throws(() => verifyUploadTicket(`${ticket}x`, 2_000), /invalid/);
  assert.throws(() => verifyUploadTicket(ticket, 86_401_000), /expired/);
});

test('expired tickets can only renew within the original seven-day recovery window', () => {
  const day = 86400000;
  const ticket = createUploadTicket({ profileId: 'm1', projectId: 'p1', marker: 'unchanged' }, 1000);
  assert.throws(() => verifyUploadTicket(ticket, 2 * day), { code: 'UPLOAD_TICKET_EXPIRED' });
  const payload = verifyUploadTicket(ticket, 2 * day, { allowRenewal: true });
  const renewed = renewUploadTicket(payload, 2 * day);
  const verified = verifyUploadTicket(renewed, 2 * day + 100);
  assert.equal(verified.marker, 'unchanged');
  assert.equal(verified.renewUntil, 1000 + 7 * day);
  const last = renewUploadTicket(verified, 6 * day + 1000);
  assert.throws(() => verifyUploadTicket(last, 1000 + 7 * day, { allowRenewal: true }), { code: 'UPLOAD_TICKET_EXPIRED' });
  assert.throws(() => verifyUploadTicket(ticket + 'tampered', 2 * day, { allowRenewal: true }), { code: 'UPLOAD_TICKET_INVALID' });
});

test('an upload ticket cannot be replayed in another workspace even by the same account', () => {
  const scope = '11111111-1111-4111-8111-111111111111';
  const ticket = inWorkspace(scope, () => createUploadTicket({ profileId: 'same-account', filename: 'private.txt' }, 1000));
  assert.throws(() => verifyUploadTicket(ticket, 2000), { code: 'FILE_FORBIDDEN', statusCode: 403 });
  assert.equal(inWorkspace(scope, () => verifyUploadTicket(ticket, 2000)).profileId, 'same-account');
});
