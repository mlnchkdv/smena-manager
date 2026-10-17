const ADMIN_ROLES = new Set(['owner', 'admin']);

export function isActiveMember(member) {
  return Boolean(member?.id) && !['deactivated', 'removed'].includes(String(member.status || 'active').toLowerCase());
}

export function isWorkspaceAdministrator(member) {
  return isActiveMember(member) && ADMIN_ROLES.has(String(member.role || '').toLowerCase());
}

export function activeWorkspaceAdministrators(data) {
  return (data?.members || []).filter(isWorkspaceAdministrator);
}

export class WorkspaceMembershipError extends Error {
  constructor(message, code = 'MEMBERSHIP_INVALID') {
    super(message);
    this.name = 'WorkspaceMembershipError';
    this.statusCode = 409;
    this.code = code;
    this.fields = ['members'];
  }
}

export function validateMembershipTransition(current, next) {
  const members = Array.isArray(next?.members) ? next.members : [];
  const ids = members.map(member => String(member?.id || '')).filter(Boolean);
  const emails = members
    .map(member =>
      String(member?.email || '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new WorkspaceMembershipError('Member IDs must be unique.', 'MEMBER_ID_DUPLICATE');
  if (new Set(emails).size !== emails.length) throw new WorkspaceMembershipError('Member email addresses must be unique.', 'MEMBER_EMAIL_DUPLICATE');
  // Enforce the invariant once the workspace has an administrator. Legacy
  // snapshots without role metadata must remain writable so they can be
  // migrated and assigned an administrator by the configured access profile.
  if (activeWorkspaceAdministrators(current).length && !activeWorkspaceAdministrators(next).length) {
    throw new WorkspaceMembershipError('At least one active workspace administrator is required.', 'LAST_ADMIN_REQUIRED');
  }
  return next;
}

export function membershipAuditEntries(current, next, actorMemberId, revision, at = Date.now()) {
  if (!actorMemberId) return [];
  const before = new Map((current?.members || []).map(member => [member.id, member]));
  const after = new Map((next?.members || []).map(member => [member.id, member]));
  const entries = [];
  const add = (verb, member, extra = '') =>
    entries.push({ id: `member-audit-${revision}-${member.id}-${entries.length}`, by: actorMemberId, verb, task: null, project: null, at, extra });

  for (const [id, member] of after) {
    const previous = before.get(id);
    if (!previous) add('added workspace member', member, member.name || member.email || '');
    else {
      if (previous.role !== member.role) add('changed member role', member, `${member.name}: ${previous.role} → ${member.role}`);
      if (previous.status !== member.status) {
        add(member.status === 'deactivated' ? 'deactivated workspace member' : 'reactivated workspace member', member, member.name || member.email || '');
      }
    }
  }
  for (const [id, member] of before) if (!after.has(id)) add('removed workspace member', member, member.name || member.email || '');
  return entries;
}
