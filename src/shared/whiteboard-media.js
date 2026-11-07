import { filePreviewPolicy } from './file-preview-policy.js';

export function validWhiteboardMedia(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1) return false;
  return Object.hasOwn(value, 'page')
    ? Number.isSafeInteger(value.page) && value.page >= 1 && value.page <= 100000
    : Object.hasOwn(value, 'seconds') && Number.isSafeInteger(value.seconds) && value.seconds >= 0 && value.seconds <= 604800;
}
export function parseWhiteboardTime(source) {
  if (typeof source !== 'string' || source.length > 16 || !source.trim()) return null;
  const parts = source.trim().split(':');
  if (parts.length > 3 || parts.some(part => !/^\d{1,6}$/.test(part)) || (parts.length > 1 && parts.slice(1).some(part => Number(part) > 59))) return NaN;
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0);
  return seconds <= 604800 ? seconds : NaN;
}
export function formatWhiteboardTime(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 604800) return '';
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
export function clampedMediaStart(seconds, duration) {
  if (!validWhiteboardMedia({ seconds }) || !Number.isFinite(duration) || duration < 0) return null;
  return Math.min(seconds, Math.max(0, duration - 0.05));
}
// Call only with a currently authorized file. A node stores a position, never
// media bytes, device paths, access URLs or credentials.
export function whiteboardMediaPosition(file, value) {
  const { kind } = filePreviewPolicy(file);
  if (!validWhiteboardMedia(value)) return { kind };
  if (kind === 'pdf' && Object.hasOwn(value, 'page')) return { kind, page: value.page };
  if (['video', 'audio'].includes(kind) && Object.hasOwn(value, 'seconds')) return { kind, seconds: value.seconds };
  return { kind };
}
