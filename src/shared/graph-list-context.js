// Use the bounded graph DTO only; list labels never hydrate source documents.
export function graphListContext(node, kindLabel = '', noFolder = '') {
  const title = String(node.title || '').trim();
  const context = String(node.context || '').trim();
  if (context && ![title, node.kind, kindLabel].some(value => value.toLocaleLowerCase() === context.toLocaleLowerCase())) return context;
  if (node.kind === 'bookmark' && node.item?.url) {
    try {
      const url = new URL(node.item.url);
      if (['http:', 'https:'].includes(url.protocol) && url.hostname !== title) return url.hostname;
    } catch {
      // A legacy malformed URL is not useful list metadata.
    }
  }
  return node.kind === 'note' && !context ? noFolder : '';
}

// Only disambiguate the authorized, bounded candidate set supplied by the caller.
export function graphChoiceContexts(nodes, labels = {}, noFolder = '') {
  const groups = new Map();
  const result = new Map();
  for (const node of nodes) {
    const context = graphListContext(node, labels[node.kind] || '', noFolder);
    result.set(node.key, context);
    const identity = JSON.stringify([node.kind, String(node.title || '').toLocaleLowerCase(), context]);
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(node.key);
  }
  for (const keys of groups.values()) {
    if (keys.length < 2) continue;
    keys.sort().forEach((key, index) => result.set(key, [result.get(key), `${index + 1}/${keys.length}`].filter(Boolean).join(' · ')));
  }
  return result;
}
