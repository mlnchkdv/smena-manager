import path from 'node:path';

const MB = 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set(['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'wsf', 'reg']);
const SAFE_INLINE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf']);
const ACTIVE_CONTENT_EXTENSIONS = new Set(['html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'cjs']);
const ACTIVE_CONTENT_MIME_TYPES = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/javascript', 'application/javascript']);

function extensionOf(filename) {
  return path
    .extname(String(filename || ''))
    .slice(1)
    .toLowerCase();
}

export function getFileUploadPolicy(env = process.env) {
  const configured = Number(env.SHARED_FILE_MAX_BYTES);
  const fallback = env.VERCEL ? 4 * MB : 100 * MB;
  const requested = Number.isSafeInteger(configured) && configured > 0 ? configured : fallback;
  return {
    maxFileSizeBytes: env.VERCEL ? Math.min(requested, 4 * MB) : requested,
    maxBatchFiles: 10,
    blockedExtensions: [...BLOCKED_EXTENSIONS],
  };
}

export function validateFileUpload(file, env = process.env) {
  const name = String(file?.originalname || '').trim();
  const mimeType = String(file?.mimetype || 'application/octet-stream');
  const size = Number(file?.size || 0);
  const extension = extensionOf(name);
  const policy = getFileUploadPolicy(env);
  if (!name || name.includes('\0')) throw new TypeError('Invalid file name.');
  if (!Number.isSafeInteger(size) || size <= 0) throw new TypeError('Empty files cannot be uploaded.');
  if (size > policy.maxFileSizeBytes) throw new TypeError(`File exceeds the ${policy.maxFileSizeBytes} byte limit.`);
  if (BLOCKED_EXTENSIONS.has(extension)) throw new TypeError(`Files with .${extension} extension are not allowed.`);
  if (/application\/(x-msdownload|x-dosexec)/i.test(mimeType)) throw new TypeError('Executable files are not allowed.');
  return { name, mimeType, size, extension };
}

export function filePresentationType(filename) {
  const extension = extensionOf(filename);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return 'img';
  if (extension === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(extension)) return 'doc';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) return 'sheet';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'zip';
  if (['fig', 'sketch'].includes(extension)) return 'fig';
  if (['js', 'ts', 'json', 'html', 'css', 'py', 'sql'].includes(extension)) return 'code';
  return 'other';
}

export function getFileResponsePolicy(filename, mimeType, downloadRequested = false) {
  const extension = extensionOf(filename);
  const normalizedMimeType = String(mimeType || 'application/octet-stream')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  const activeContent = ACTIVE_CONTENT_EXTENSIONS.has(extension) || ACTIVE_CONTENT_MIME_TYPES.has(normalizedMimeType);
  return {
    attachment: Boolean(downloadRequested || activeContent || !SAFE_INLINE_EXTENSIONS.has(extension)),
    contentType: activeContent ? 'application/octet-stream' : normalizedMimeType || 'application/octet-stream',
    activeContent,
  };
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
