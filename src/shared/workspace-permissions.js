export const ADMIN_ONLY_FIELDS = ['ws', 'workspaces', 'members', 'me', 'sessions', 'invoices', 'tfa', 'notifPrefs', 'plan'];

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const clone = value => structuredClone(value);

export function canWriteWorkspace(role) {
  return role === 'admin' || role === 'editor';
}

export function adminFieldsChanged(current, next) {
  return ADMIN_ONLY_FIELDS.filter(field => !same(current?.[field], next?.[field]));
}

export function restoreUnauthorizedChanges(baseline, candidate, role) {
  if (!baseline || !candidate || role === 'admin') return { data: candidate, denied: false, fields: [] };
  if (!canWriteWorkspace(role)) {
    const denied = !same(baseline, candidate);
    return { data: denied ? clone(baseline) : candidate, denied, fields: denied ? ['*'] : [] };
  }

  const fields = adminFieldsChanged(baseline, candidate);
  if (!fields.length) return { data: candidate, denied: false, fields };
  const data = clone(candidate);
  for (const field of fields) {
    if (Object.hasOwn(baseline, field)) data[field] = clone(baseline[field]);
    else delete data[field];
  }
  return { data, denied: true, fields };
}
