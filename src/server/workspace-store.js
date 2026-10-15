import { getStorageProvider } from './storage/index.js';

export const CURRENT_SCHEMA_VERSION = 1;

let database = null;
let initializationPromise = null;

function createEmptyDatabase() {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    workspace: { name: 'Smena Manager' },
    members: [],
    projects: [],
    tasks: [],
    comments: [],
    files: [],
    activity: [],
    notifications: [],
    events: [],
    savedViews: [],
  };
}

function normalizeDatabase(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Workspace database must be a JSON object.');
  }
  const version = Number(value.schemaVersion || 1);
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Workspace schema ${version} is newer than supported schema ${CURRENT_SCHEMA_VERSION}.`);
  }
  return { ...createEmptyDatabase(), ...value, schemaVersion: CURRENT_SCHEMA_VERSION };
}

export async function initWorkspaceStore() {
  if (database) return database;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    const storage = getStorageProvider();
    await storage.init();
    const stored = await storage.loadDatabase();
    database = stored ? normalizeDatabase(stored) : createEmptyDatabase();
    if (!stored) await storage.saveDatabase(database);
    return database;
  })();

  try {
    return await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

export async function getWorkspaceStatus() {
  const data = await initWorkspaceStore();
  const storage = getStorageProvider();
  return {
    storage: await storage.getStatus(),
    schemaVersion: data.schemaVersion,
    revision: data.revision,
    updatedAt: data.updatedAt,
  };
}

export function resetWorkspaceStore() {
  database = null;
  initializationPromise = null;
}
