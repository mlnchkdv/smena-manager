/**
 * Ordered, pure migrations for the persisted workspace envelope.
 * Keep migrations small and deterministic so a backup can be replayed in a
 * test without touching providers or user data.
 */
export const WORKSPACE_SCHEMA_MIGRATIONS = Object.freeze({
  1: value => {
    const next = { ...value };
    if (!Object.hasOwn(next, 'notifs') && Array.isArray(next.notifications)) next.notifs = next.notifications;
    delete next.notifications;
    return next;
  },
  // Storage may split the catalog only after all readers support schema 3.
  // The logical, materialized shape (including portable backups) is unchanged.
  2: value => ({ ...value }),
});

export function migrateWorkspaceSchema(value, targetVersion) {
  let next = { ...value };
  let version = Number(next.schemaVersion || 1);
  while (version < targetVersion) {
    const migrate = WORKSPACE_SCHEMA_MIGRATIONS[version];
    if (typeof migrate !== 'function') throw new Error(`Missing workspace schema migration ${version} -> ${version + 1}.`);
    next = migrate(next);
    version += 1;
    next.schemaVersion = version;
  }
  return next;
}
