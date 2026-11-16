import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { mem } from '../core/store.js';
import { isRussian } from '../core/i18n.js';

export function knowledgeByline(note) {
  const parsed = typeof note.updatedAt === 'number' ? note.updatedAt : Date.parse(note.updatedAt || '');
  const author = note.updatedBy && mem(note.updatedBy)?.name;
  return `<span class="knowledge-byline"><span class="knowledge-updated" translate="no">${ic('clock-3', 12)}<span>${isRussian() ? 'Обновлено' : 'Updated'} ${esc(ago(Number.isFinite(parsed) ? parsed : Date.now()))}</span></span>${author ? `<span class="knowledge-author"><span class="sr">${isRussian() ? 'Автор' : 'Author'}: </span><span translate="no">${esc(author)}</span></span>` : ''}</span>`;
}
