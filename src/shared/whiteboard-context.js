import { BOARD_COLORS } from './project-whiteboard.js';

// Compare just the edited field: unrelated concurrent moves or text edits survive.
export function patchWhiteboardContext(board, { kind, id, field, base, value }) {
  const item = (kind === 'node' ? board.nodes : kind === 'edge' ? board.edges : []).find(item => item.id === id);
  if (!item) return { error: 'missing' };
  const textField = kind === 'edge' ? 'label' : item.type === 'material' ? null : 'title';
  const allowed =
    (textField !== null && field === textField && typeof value === 'string' && value.length <= 120) ||
    (field === 'color' && BOARD_COLORS.includes(value)) ||
    (kind === 'edge' && field === 'arrow' && typeof value === 'boolean');
  if (!allowed) return { error: 'invalid' };
  if (item[field] !== base && item[field] !== value) return { error: 'changed' };
  if (item[field] === value) return { changed: false };
  item[field] = value;
  return { changed: true };
}
