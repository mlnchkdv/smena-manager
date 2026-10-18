// A short, atomic lease prevents every tab from polling Drive independently.
// Unsupported/blocked browser storage falls back to the existing safe polling.
export function createPollCoordinator({ locks, storage, now = Date.now, id = crypto.randomUUID() } = {}) {
  const prefix = 'smena:poll:v1:';
  return {
    async shouldPoll(owner) {
      if (!owner) return false;
      if (!locks || !storage) return true;
      try {
        return await locks.request(`${prefix}${owner}`, () => {
          const key = `${prefix}${owner}`;
          let lease;
          try {
            lease = JSON.parse(storage.getItem(key) || 'null');
          } catch {
            lease = null;
          }
          const time = now();
          if (lease?.id !== id && Number.isFinite(lease?.until) && lease.until > time && lease.until <= time + 12000) return false;
          storage.setItem(key, JSON.stringify({ id, until: time + 12000 }));
          return true;
        });
      } catch {
        return true;
      }
    },
  };
}
