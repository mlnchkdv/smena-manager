import { createWorkspaceBackup, deleteWorkspaceBackup, listWorkspaceBackups } from './workspace-store.js';

const AUTOMATIC_BACKUP_PREFIX = 'Automatic backup ';
const DEFAULT_RETENTION_COUNT = 30;

function retentionCount(value = process.env.BACKUP_RETENTION_COUNT) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isSafeInteger(parsed) ? Math.min(90, Math.max(7, parsed)) : DEFAULT_RETENTION_COUNT;
}

function dateKey(now, timeZone = process.env.BACKUP_TIME_ZONE || 'Europe/Saratov') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(part => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function runAutomaticWorkspaceBackup(options = {}) {
  const list = options.list || listWorkspaceBackups;
  const create = options.create || createWorkspaceBackup;
  const remove = options.remove || deleteWorkspaceBackup;
  const keep = retentionCount(options.retentionCount);
  const label = `${AUTOMATIC_BACKUP_PREFIX}${dateKey(options.now || new Date(), options.timeZone)}`;
  let backups = await list();
  const existing = backups.find(backup => backup.label === label);
  const created = existing || (await create(label));

  if (!existing) backups = await list();
  const automatic = backups
    .filter(backup => String(backup.label || '').startsWith(AUTOMATIC_BACKUP_PREFIX))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  const expired = automatic.slice(keep);
  const removed = [];
  for (const backup of expired) {
    await remove(backup.id);
    removed.push(backup.id);
  }

  return { created: !existing, backupId: created.id, label, retained: Math.min(automatic.length, keep), removed };
}

export { AUTOMATIC_BACKUP_PREFIX, DEFAULT_RETENTION_COUNT };
