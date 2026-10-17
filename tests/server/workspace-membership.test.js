import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeWorkspaceAdministrators,
  membershipAuditEntries,
  validateMembershipTransition,
  WorkspaceMembershipError,
} from '../../src/shared/workspace-membership.js';

const admin = { id: 'admin-1', name: 'Admin', email: 'admin@example.test', role: 'Admin', status: 'active' };
const member = { id: 'member-1', name: 'Member', email: 'member@example.test', role: 'Member', status: 'active' };

test('membership keeps at least one active administrator and unique identities', () => {
  assert.equal(activeWorkspaceAdministrators({ members: [admin, member] }).length, 1);
  assert.throws(
    () => validateMembershipTransition({ members: [admin, member] }, { members: [{ ...admin, status: 'deactivated' }, member] }),
    error => error instanceof WorkspaceMembershipError && error.code === 'LAST_ADMIN_REQUIRED',
  );
  assert.throws(
    () => validateMembershipTransition({ members: [admin] }, { members: [admin, { ...member, email: admin.email }] }),
    error => error.code === 'MEMBER_EMAIL_DUPLICATE',
  );
});

test('membership changes create an administrator audit trail', () => {
  const next = { members: [{ ...admin }, { ...member, role: 'Admin', status: 'deactivated' }] };
  const entries = membershipAuditEntries({ members: [admin, member] }, next, admin.id, 12, 1000);
  assert.deepEqual(
    entries.map(entry => entry.verb),
    ['changed member role', 'deactivated workspace member'],
  );
  assert.ok(entries.every(entry => entry.by === admin.id && entry.at === 1000));
});
