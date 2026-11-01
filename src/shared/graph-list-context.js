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
