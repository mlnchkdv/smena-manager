// A scope includes account/workspace, revision and query. Only pages of that
// scope may share results; leaving it cancels queued and in-flight requests.
export function remoteSearchSource(load, changed, { schedule = setTimeout, cancel = clearTimeout } = {}) {
  let scope;
  const pages = new Map();
  const clear = () => {
    for (const item of pages.values()) {
      cancel(item.timer);
      item.controller.abort();
    }
    pages.clear();
    scope = undefined;
  };
  return {
    clear,
    query(owner, key, options) {
      if (owner !== scope) {
        clear();
        scope = owner;
      }
      if (pages.has(key)) return pages.get(key);
      const item = { pending: true, controller: new AbortController() };
      pages.set(key, item);
      while (pages.size > 8) {
        const oldest = pages.keys().next().value,
          old = pages.get(oldest);
        cancel(old.timer);
        old.controller.abort();
        pages.delete(oldest);
      }
      item.timer = schedule(async () => {
        if (item.controller.signal.aborted || scope !== owner || pages.get(key) !== item) return;
        try {
          const data = await load(options, item.controller.signal);
          if (item.controller.signal.aborted || scope !== owner || pages.get(key) !== item) return;
          item.data = data;
        } catch (error) {
          if (item.controller.signal.aborted || scope !== owner || pages.get(key) !== item) return;
          item.error = error;
        }
        item.pending = false;
        changed();
      }, 250);
      return item;
    },
  };
}
