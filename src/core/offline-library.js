const DB = 'smena-offline-library-v1';
export const OFFLINE_OWNER = 'smena.offline.owner';
let opening;
function database() {
  return (opening ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('items', { keyPath: 'key' });
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  }));
}
export const offlineKey = item => JSON.stringify([item.owner, item.workspace, item.kind, item.id]);
export async function offlineItems(owner) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('items').objectStore('items').getAll();
    request.onsuccess = () => resolve(request.result.filter(item => item.owner === owner));
    request.onerror = () => reject(request.error);
  });
}
export async function putOffline(item) {
  const db = await database(),
    record = { ...item, key: offlineKey(item), savedAt: new Date().toISOString() };
  record.bytes = (item.blob?.size || 0) + new Blob([JSON.stringify({ ...item, blob: null })]).size;
  if (record.bytes > 20 * 1024 * 1024) throw Error('Offline item exceeds 20 MB.');
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readwrite'),
      store = tx.objectStore('items'),
      request = store.getAll();
    let quota = false;
    request.onsuccess = () => {
      const others = request.result.filter(i => i.key !== record.key);
      if (others.length >= 200 || others.reduce((n, i) => n + (i.bytes || 0), 0) + record.bytes > 50 * 1024 * 1024) {
        quota = true;
        tx.abort();
      } else store.put(record);
    };
    tx.oncomplete = () => resolve(record);
    tx.onerror = tx.onabort = () => reject(quota ? Error('Offline library limit: 200 items / 50 MB.') : tx.error || Error('Offline storage unavailable.'));
  });
}
export async function removeOffline(item) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readwrite');
    tx.objectStore('items').delete(item.key || offlineKey(item));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function forgetOfflineOwner() {
  try {
    localStorage.removeItem(OFFLINE_OWNER);
  } catch {
    /* Local storage may be unavailable. */
  }
  if (opening) await opening.then(db => db.close()).catch(() => {});
  return new Promise(resolve => {
    const request = indexedDB.deleteDatabase(DB);
    request.onsuccess = request.onerror = request.onblocked = resolve;
    opening = null;
  });
}
