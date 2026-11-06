import { createUploadJournal } from '../shared/upload-journal.js';

let database;
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('smena-upload-journal-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('Upload storage is blocked.'));
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          database = null;
        };
        resolve(request.result);
      };
    }).catch(error => {
      database = null;
      throw error;
    });
  return database;
}
async function transaction(write, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', write ? 'readwrite' : 'readonly');
    const request = action(tx.objectStore('records'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || Error('Upload storage failed.'));
  });
}
export const uploadJournal = createUploadJournal({
  storage: {
    get: key => transaction(false, store => store.get(key)),
    put: (key, value) => transaction(true, store => store.put(value, key)),
    clear: () => transaction(true, store => store.clear()),
  },
});
