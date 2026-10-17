const DATABASE = 'smena-recovery-v1';
const STORE = 'drafts';
let opening;

function database() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Local recovery storage is unavailable.'));
  opening ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => {
    opening = null;
    throw error;
  });
  return opening;
}

const browserAdapter = {
  async run(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = operation(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Local recovery write failed.'));
    });
  },
  get(key) {
    return this.run('readonly', store => store.get(key));
  },
  put(value) {
    return this.run('readwrite', store => store.put(value));
  },
  delete(key) {
    return this.run('readwrite', store => store.delete(key));
  },
};

export function draftContext(user, data) {
  return { owner: user?.id || '', workspace: data?.ws?.id || data?.workspaces?.[0]?.id || 'primary' };
}

export function createDraftJournal(context, adapter = browserAdapter) {
  const key = JSON.stringify([context.owner, context.workspace, context.scope]);
  let queue = Promise.resolve();
  const serialize = action => {
    const result = queue.then(action, action);
    queue = result.catch(() => undefined);
    return result;
  };
  return {
    read: () => serialize(() => adapter.get(key)),
    save: value => serialize(() => adapter.put({ ...structuredClone(value), ...context, key, savedAt: new Date().toISOString() })),
    acknowledge: local =>
      serialize(async () => {
        const record = await adapter.get(key);
        if (record && JSON.stringify(record.local) === JSON.stringify(local)) await adapter.delete(key);
      }),
  };
}
