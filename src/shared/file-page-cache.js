export function filePageOptions(options) {
  return Object.fromEntries(
    Object.keys(options)
      .sort()
      .filter(key => key !== 'countFolders')
      .map(key => [key, options[key]]),
  );
}

// Counts describe canonical direct children, independent of the row search and
// sort. Never share them across a session/actor/role/workspace/revision scope.
export function createFolderCountCache(limit = 256) {
  let scope;
  const values = new Map();
  const align = next => {
    if (next !== scope) {
      scope = next;
      values.clear();
    }
  };
  const unique = keys => [...new Map(keys.map(pair => [JSON.stringify(pair), pair])).entries()];
  return {
    seed(next, rows) {
      align(next);
      for (const row of rows || []) {
        if (Array.isArray(row) && row.length === 3 && typeof row[0] === 'string' && typeof row[1] === 'string' && Number.isSafeInteger(row[2]) && row[2] >= 0)
          values.set(JSON.stringify(row.slice(0, 2)), [...row]);
      }
      while (values.size > limit) values.delete(values.keys().next().value);
    },
    read(next, keys) {
      align(next);
      return unique(keys).flatMap(([key]) => (values.has(key) ? [[...values.get(key)]] : []));
    },
    missing(next, keys) {
      align(next);
      return unique(keys)
        .filter(([key]) => !values.has(key))
        .map(([, pair]) => [...pair]);
    },
    clear() {
      scope = undefined;
      values.clear();
    },
  };
}
