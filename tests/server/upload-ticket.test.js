import assert from 'node:assert/strict';
import test from 'node:test';
import { createUploadTicket, verifyUploadTicket } from '../../src/server/upload-ticket.js';
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
  });
  assert.throws(() => verifyUploadTicket(`${ticket}x`, 2_000), /invalid/);
  assert.throws(() => verifyUploadTicket(ticket, 86_401_000), /expired/);
});

test('an upload ticket cannot be replayed in another workspace even by the same account', () => {
  const scope = '11111111-1111-4111-8111-111111111111';
  const ticket = inWorkspace(scope, () => createUploadTicket({ profileId: 'same-account', filename: 'private.txt' }, 1000));
  assert.throws(() => verifyUploadTicket(ticket, 2000), { code: 'FILE_FORBIDDEN', statusCode: 403 });
  assert.equal(inWorkspace(scope, () => verifyUploadTicket(ticket, 2000)).profileId, 'same-account');
});
