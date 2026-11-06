// No File contents or login token are persisted. Provider tickets are encrypted
// at rest with a non-extractable per-scope key; this is not protection from XSS.
export function createUploadJournal({ storage, crypto = globalThis.crypto }) {
  const encode = value => new TextEncoder().encode(value);
  let epoch = 0,
    tail = Promise.resolve();
  const sequence = fn => {
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
  };
  return {
    save(scope, entries, current = () => true) {
      const started = epoch,
        captured = structuredClone(entries);
      return sequence(async () => {
        if (started !== epoch || !current()) return;
        let key = await storage.get(`key:${scope}`);
        if (!key) {
          key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          if (started !== epoch || !current()) return;
          await storage.put(`key:${scope}`, key);
        }
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const payload = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encode(scope) }, key, encode(JSON.stringify(captured)));
        if (started !== epoch || !current()) return;
        await storage.put(`queue:${scope}`, { version: 1, iv, payload, at: Date.now() });
      });
    },
    async read(scope) {
      await tail;
      const row = await storage.get(`queue:${scope}`),
        key = row && (await storage.get(`key:${scope}`));
      if (!row || !key || row.version !== 1 || row.at < Date.now() - 7 * 86400000) return [];
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv, additionalData: encode(scope) }, key, row.payload);
      return JSON.parse(new TextDecoder().decode(plain));
    },
    clear() {
      epoch++;
      return sequence(() => storage.clear());
    },
  };
}

export function createUploadOwner({ locks, scope }) {
  let held = false,
    release,
    pending,
    disposed = false;
  return {
    get held() {
      return held;
    },
    async acquire() {
      if (held) return true;
      if (disposed || !locks?.request) return false;
      if (pending) return pending;
      pending = new Promise(resolve => {
        locks
          .request(`smena-upload-owner:${scope}`, { ifAvailable: true }, async lock => {
            if (!lock || disposed) {
              resolve(false);
              return;
            }
            held = true;
            await new Promise(done => {
              release = done;
              resolve(true);
            });
            held = false;
          })
          .catch(() => resolve(false));
      });
      const result = await pending;
      pending = null;
      return result;
    },
    close() {
      disposed = true;
      held = false;
      release?.();
    },
  };
}

export async function fullUploadFingerprint(file, signal) {
  const chunks = [],
    chunkSize = 8 * 1024 * 1024;
  for (let start = 0; start < file.size; start += chunkSize) {
    if (signal?.aborted) throw Object.assign(Error('Upload cancelled.'), { code: 'UPLOAD_CANCELLED' });
    chunks.push(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.slice(start, start + chunkSize).arrayBuffer())));
  }
  const input = new Uint8Array(chunks.length * 32);
  chunks.forEach((chunk, index) => input.set(chunk, index * 32));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return `sha256-v2:${file.size}:${[...hash].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
