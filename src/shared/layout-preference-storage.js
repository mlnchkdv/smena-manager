const identities = (user, workspace) => typeof user === 'string' && user.length > 0 && typeof workspace === 'string' && workspace.length > 0;
const legacySafe = (user, workspace) => !user.includes(':') && !workspace.includes(':');
export function layoutPreferenceKeys(user, workspace, name) {
  if (!identities(user, workspace) || typeof name !== 'string' || !name) return [];
  return [
    `smena.layout.v2:${JSON.stringify([user, workspace, name])}`,
    ...(legacySafe(user, workspace) ? [`smena.layout.v1:${user}:${workspace}:${name}`] : []),
  ];
}
export function knowledgeViewKeys(user, workspace) {
  if (!identities(user, workspace)) return [];
  return [`smena.knowledge.ui.v2:${JSON.stringify([user, workspace])}`, ...(legacySafe(user, workspace) ? [`smena.knowledge.ui.v1:${user}:${workspace}`] : [])];
}
export function readScopedLayout(storage, keys) {
  for (const [index, key] of keys.entries()) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    const value = JSON.parse(raw);
    if (index > 0) {
      try {
        storage.setItem(keys[0], raw);
      } catch {
        /* A blocked device store must not hide an existing layout. */
      }
    }
    return { stored: true, value };
  }
  return { stored: false };
}
