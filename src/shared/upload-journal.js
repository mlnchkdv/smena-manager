// No File contents or login token are persisted. Browser-granted read-only file
// handles are stored separately; provider tickets remain encrypted per scope.
// This is not protection from XSS. Reopening a source always verifies its hash.
export function readUploadFallback(read) {
  try {
    const entries = JSON.parse(read() || '[]');
    return Array.isArray(entries) ? entries : [];
  } catch {
    return []; // Session storage may be blocked while IndexedDB is still usable.
  }
}

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
      const started = epoch;
      let captured;
      try {
        captured = structuredClone(entries);
      } catch {
        captured = structuredClone(
          entries.map(entry => {
            const copy = { ...entry };
            delete copy.sourceHandle;
            return copy;
          }),
        );
      }
      return sequence(async () => {
        if (started !== epoch || !current()) return;
        let key = await storage.get(`key:${scope}`);
        if (!key) {
          key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          if (started !== epoch || !current()) return;
          await storage.put(`key:${scope}`, key);
        }
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const sources = captured.filter(entry => entry.sourceHandle).map(entry => [entry.id, entry.sourceHandle]);
        const payload = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, additionalData: encode(scope) },
          key,
          encode(JSON.stringify(captured, (name, value) => (name === 'sourceHandle' ? undefined : value))),
        );
        if (started !== epoch || !current()) return;
        const row = { version: 1, iv, payload, sources, at: Date.now() };
        try {
          await storage.put(`queue:${scope}`, row);
        } catch (error) {
          if (!sources.length || !['DataCloneError', 'NotSupportedError'].includes(error?.name)) throw error;
          if (started !== epoch || !current()) return;
          // Some browsers expose the picker but cannot persist its handles.
          // Preserve encrypted metadata; source re-selection remains available.
          await storage.put(`queue:${scope}`, { ...row, sources: [] });
        }
      });
    },
    async read(scope) {
      await tail;
      const row = await storage.get(`queue:${scope}`),
        key = row && (await storage.get(`key:${scope}`));
      if (!row || !key || row.version !== 1 || row.at < Date.now() - 7 * 86400000) return [];
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv, additionalData: encode(scope) }, key, row.payload);
      const sources = new Map(row.sources || []);
      return JSON.parse(new TextDecoder().decode(plain)).map(entry => ({
        ...entry,
        ...(sources.has(entry.id) ? { sourceHandle: sources.get(entry.id) } : {}),
      }));
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
