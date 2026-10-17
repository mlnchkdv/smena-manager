const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const TEXT_TYPES = new Set(['text/plain', 'text/csv', 'text/markdown', 'application/json']);

export function filePreviewPolicy(file) {
  const mime = String(file?.mimeType || '')
    .toLowerCase()
    .split(';')[0];
  const kind = IMAGE_TYPES.has(mime) ? 'image' : TEXT_TYPES.has(mime) ? 'text' : null;
  const maxBytes = kind === 'image' ? 20 * 1024 * 1024 : 1024 * 1024;
  if (!file?.storageName || !kind || !Number.isFinite(file.bytes) || file.bytes > maxBytes) return { kind: null, maxBytes };
  return { kind, maxBytes };
}
