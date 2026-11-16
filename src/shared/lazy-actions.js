export function registerLazyActions(tables, names, { load, identity, dialog, onError }) {
  const stubs = new Map();
  let pending;
  for (const [table, keys] of Object.entries(names))
    for (const name of keys) {
      const stub = async (...args) => {
        const before = identity(),
          modal = dialog();
        let module;
        try {
          module = await (pending ||= load().catch(error => {
            pending = null;
            throw error;
          }));
        } catch {
          if (before === identity()) onError();
          return;
        }
        if (before !== identity() || modal !== dialog()) return;
        for (const [kind, group] of Object.entries(module.handlers))
          for (const [key, handler] of Object.entries(group)) if (tables[kind][key] === stubs.get(kind + ':' + key)) tables[kind][key] = handler;
        return tables[table][name](...args);
      };
      stubs.set(table + ':' + name, stub);
      tables[table][name] = stub;
    }
}
