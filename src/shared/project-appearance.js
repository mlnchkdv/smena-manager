export function normalizeProjectColor(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  if (/^#[\da-f]{6}$/i.test(hex)) return hex.toUpperCase();
  if (/^#[\da-f]{3}$/i.test(hex))
    return (
      '#' +
      [...hex.slice(1)]
        .map(char => char + char)
        .join('')
        .toUpperCase()
    );
  return null;
}
