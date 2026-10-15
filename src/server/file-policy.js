import path from 'node:path';

const MB = 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set(['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'wsf', 'reg']);

export function getFileUploadPolicy(env = process.env) {
  const configured = Number(env.SHARED_FILE_MAX_BYTES);
  const fallback = env.VERCEL ? 4 * MB : 100 * MB;
  return {
    maxFileSizeBytes: Number.isSafeInteger(configured) && configured > 0 ? configured : fallback,
    maxBatchFiles: 10,
    blockedExtensions: [...BLOCKED_EXTENSIONS],
  };
}

export function validateFileUpload(file, env = process.env) {
  const name = String(file?.originalname || '').trim();
  const mimeType = String(file?.mimetype || 'application/octet-stream');
  const size = Number(file?.size || 0);
  const extension = path.extname(name).slice(1).toLowerCase();
  const policy = getFileUploadPolicy(env);
  if (!name || name.includes('\0')) throw new TypeError('Invalid file name.');
  if (!Number.isSafeInteger(size) || size <= 0) throw new TypeError('Empty files cannot be uploaded.');
  if (size > policy.maxFileSizeBytes) throw new TypeError(`File exceeds the ${policy.maxFileSizeBytes} byte limit.`);
  if (BLOCKED_EXTENSIONS.has(extension)) throw new TypeError(`Files with .${extension} extension are not allowed.`);
  if (/application\/(x-msdownload|x-dosexec)/i.test(mimeType)) throw new TypeError('Executable files are not allowed.');
  return { name, mimeType, size, extension };
}

export function filePresentationType(filename) {
  const extension = path.extname(filename).slice(1).toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return 'img';
  if (extension === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(extension)) return 'doc';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) return 'sheet';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'zip';
  if (['fig', 'sketch'].includes(extension)) return 'fig';
  if (['js', 'ts', 'json', 'html', 'css', 'py', 'sql'].includes(extension)) return 'code';
  return 'other';
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
