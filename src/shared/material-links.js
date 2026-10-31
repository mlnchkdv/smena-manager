const KEY = /^(note|project|task|bookmark|file):([\p{L}\p{N}_.:@+-]{1,180})$/u;
export function materialLink(value) {
  const [target, ...label] = String(value).split('|');
  const [key, block] = target.split('#^');
  return KEY.test(key) && (block == null || /^[a-zA-Z0-9_-]{1,100}$/.test(block)) ? { key, block, label: label.join('|') || target } : null;
}
export function materialReferences(source) {
  return [...String(source || '').matchAll(/\[\[([^\]\n]+)\]\]/g)].map(m => materialLink(m[1])).filter(Boolean);
}
export function insertMaterialLink(source, start, end, key, label) {
  if (!KEY.test(key)) throw new TypeError('Invalid material target');
  const link = `[[${key}|${String(label)
    .replace(/[|\]\r\n]/g, ' ')
    .trim()}]]`;
  return { text: source.slice(0, start) + link + source.slice(end), cursor: start + link.length };
}
