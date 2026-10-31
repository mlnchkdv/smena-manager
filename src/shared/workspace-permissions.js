export const ADMIN_ONLY_FIELDS = ['ws', 'workspaces', 'members', 'me', 'sessions', 'invoices', 'tfa', 'plan'];

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const clone = value => structuredClone(value);

export function canWriteWorkspace(role) {
  return role === 'admin' || role === 'editor';
}
export const canCreateWorkspace = canWriteWorkspace;
export const canManageTeams = role => role === 'admin';

export function adminFieldsChanged(current, next) {
  return ADMIN_ONLY_FIELDS.filter(field => !same(current?.[field], next?.[field]));
}

function withoutOwnPreferences(preferences, memberId) {
  const copy = clone(preferences && typeof preferences === 'object' && !Array.isArray(preferences) ? preferences : {});
  if (memberId) delete copy[memberId];
  return copy;
}

export function restoreUnauthorizedChanges(baseline, candidate, role, memberId = null) {
  if (!baseline || !candidate || role === 'admin') return { data: candidate, denied: false, fields: [] };
  if (!canWriteWorkspace(role)) {
    const denied = !same(baseline, candidate);
    return { data: denied ? clone(baseline) : candidate, denied, fields: denied ? ['*'] : [] };
  }

  const fields = adminFieldsChanged(baseline, candidate);
  const changedOtherPreferences = !same(withoutOwnPreferences(baseline.notifPrefs, memberId), withoutOwnPreferences(candidate.notifPrefs, memberId));
  if (changedOtherPreferences) fields.push('notifPrefs');
  if (!fields.length) return { data: candidate, denied: false, fields };
  const data = clone(candidate);
  for (const field of fields.filter(field => field !== 'notifPrefs')) {
    if (Object.hasOwn(baseline, field)) data[field] = clone(baseline[field]);
    else delete data[field];
  }
  if (changedOtherPreferences) {
    const ownPreferences = memberId && candidate.notifPrefs?.[memberId];
    data.notifPrefs = clone(baseline.notifPrefs || {});
    if (memberId && ownPreferences) data.notifPrefs[memberId] = clone(ownPreferences);
  }
  return { data, denied: true, fields };
}
