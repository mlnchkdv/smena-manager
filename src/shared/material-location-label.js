export function materialLocationLabel(path) {
  const parts = String(path)
    .split(' / ')
    .map(part => part.trim())
    .filter(Boolean);
  const leaf = parts.pop() || path;
  return parts.length ? leaf + ' · ' + parts[0] : leaf;
}
