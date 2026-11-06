import { knowledgeDisplayParts } from './knowledge-frontmatter.js';
import { markdownText } from './markdown-text.js';

// Present an already authorized, loaded entity; never fetch media or store a
// second body in the whiteboard document.
export function whiteboardMaterialPreview(entity) {
  if (!entity?.item) return null;
  const { item, kind } = entity;
  const icons = { note: 'file-text', task: 'circle-check', project: 'folder', bookmark: 'bookmark', file: 'paperclip', whiteboard: 'panels-top-left' };
  let text = '',
    icon = icons[kind] || 'file-text';
  if (kind === 'note') {
    const source = item.summary || knowledgeDisplayParts(item).body || (item.bodyPending ? item.bodyPreview : '') || '';
    text = item.sourceFormat === 'text' ? String(source).slice(0, 1600).replace(/\s+/g, ' ').trim() : markdownText(String(source).slice(0, 1600));
  } else if (kind === 'bookmark') {
    text = String(item.desc || item.description || '');
    if (!text && item.url) {
      try {
        text = new URL(item.url).hostname;
      } catch {
        /* Legacy invalid URLs never become requests. */
      }
    }
  } else if (kind === 'file') {
    const mime = String(item.mimeType || item.mime || '');
    icon = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'music' : 'paperclip';
    text =
      String(item.name || '')
        .split('.')
        .at(-1)
        ?.toUpperCase() || '';
  } else text = markdownText(String(item.desc || item.description || '').slice(0, 1600));
  const tags = Array.isArray(item.tags)
    ? item.tags
        .filter(tag => typeof tag === 'string' && tag.trim())
        .slice(0, 3)
        .map(tag => tag.slice(0, 40))
    : [];
  return { kind, icon, text: text.length > 240 ? text.slice(0, 239) + '…' : text, tags };
}
