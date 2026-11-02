export function shortcutPresentation(input) {
  const keys = Array.isArray(input)
    ? input
    : String(input || '')
        .split(' ')
        .filter(Boolean);
  const kind = keys.length < 2 ? 'single' : keys[0] === 'G' ? 'sequence' : keys.every(k => ['↑', '↓', '←', '→'].includes(k)) ? 'alternative' : 'chord';
  return { keys, kind, separator: kind === 'sequence' ? 'then' : kind === 'alternative' ? '/' : '+' };
}
