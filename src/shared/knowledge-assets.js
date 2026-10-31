export function knowledgeAsset(value, assets = {}) {
  const match = String(value).match(/^smena-file:([\p{L}\p{N}_.:@+-]{1,180})(?:#page=(\d{1,5}))?$/u);
  if (match) return { id: match[1], page: Number(match[2]) || null };
  const key = String(value).replace(/^\.\//, '');
  return Object.hasOwn(assets || {}, key) && typeof assets[key] === 'string' ? { id: assets[key], page: null } : null;
}
export function assetPath(value) {
  const path = String(value).replace(/^\.\//, '');
  return path.length <= 500 && !/^(?:[a-z]+:|\/)|(?:^|\/)\.\.(?:\/|$)/i.test(path) ? path : null;
}

export function knowledgeFileReferences(note) {
  return [
    ...new Set(
      [...(note.formatted_markdown || '').matchAll(/smena-file:([\p{L}\p{N}_.:@+-]{1,180})/gu)]
        .map(m => m[1])
        .concat(Object.values(note.assets || {}).filter(id => typeof id === 'string')),
    ),
  ];
}
