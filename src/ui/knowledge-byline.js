import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { mem } from '../core/store.js';
import { isRussian } from '../core/i18n.js';

export function knowledgeByline(note, fullDate = false) {
  const parsed = typeof note.updatedAt === 'number' ? note.updatedAt : Date.parse(note.updatedAt || '');
  const name = note.updatedBy && mem(note.updatedBy)?.name;
  const author = name ? name + (note.updatedVia?.name ? ' · ' + note.updatedVia.name : '') : '';
  return `<span class="knowledge-byline"><span class="knowledge-updated" translate="no">${ic('clock-3', 12)}<span>${isRussian() ? 'Обновлено' : 'Updated'} ${esc(fullDate && Number.isFinite(parsed) ? new Date(parsed).toLocaleString(isRussian() ? 'ru-RU' : 'en-US', { dateStyle: 'long', timeStyle: 'short' }) : ago(Number.isFinite(parsed) ? parsed : Date.now()))}</span></span>${author ? `<span class="knowledge-author"><span class="sr">${isRussian() ? 'Автор' : 'Author'}: </span><span translate="no">${esc(author)}</span></span>` : ''}</span>`;
}
