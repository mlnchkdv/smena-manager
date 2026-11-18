import { normalizedPageUrl } from './bookmark-metadata.js';

export function whiteboardPastedContent(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (text.length <= 360000) {
    try {
      const selection = JSON.parse(text);
      if (selection?.format === 'smena-whiteboard-selection') return selection.version === 1 ? { kind: 'selection', board: selection.board } : null;
    } catch {
      // Ordinary text and URLs are also valid clipboard content.
    }
  }
  const url = text.length <= 2000 && /^https?:\/\//i.test(text) && normalizedPageUrl(text);
  if (url && url.length <= 2000 && !/\s/.test(text)) return { kind: 'website', url };
  return text.length <= 6000 ? { kind: 'text', text } : null;
}

export function whiteboardMaterialPositions(point, count) {
  if (!point || ![point.x, point.y].every(Number.isFinite) || !Number.isInteger(count) || count < 1 || count > 200) return [];
  const columns = Math.min(3, count),
    rows = Math.ceil(count / 3);
  const x = Math.max(-50000, Math.min(50000 - (columns - 1) * 400, Math.round(point.x)));
  const y = Math.max(-50000, Math.min(50000 - (rows - 1) * 500, Math.round(point.y)));
  return Array.from({ length: count }, (_, index) => ({ x: x + (index % 3) * 400, y: y + Math.floor(index / 3) * 500 }));
}
