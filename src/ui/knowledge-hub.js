import { D } from '../core/store.js';
import { esc } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { hubNotes } from '../shared/knowledge-hub.js';
import { relationsPanel } from './relations.js';
export function knowledgeHub(kind, id) {
  const notes = hubNotes(D(), kind, id),
    ru = isRussian();
  return `<section class="panel knowledge-hub"><div class="panel-h"><h2 translate="no">${ru ? 'Знания и материалы' : 'Knowledge and materials'}</h2><span class="badge">${notes.length}</span></div><div class="panel-b">${
    notes
      .slice(0, 12)
      .map(
        note =>
          `<button class="btn btn-ghost knowledge-relation" data-a="goKnowledgeNote" data-id="${esc(note.id)}" translate="no">${esc(note.title)}</button>`,
      )
      .join('') ||
    `<p class="hint" translate="no">${ru ? 'Свяжите заметку через свойство проекта или участника.' : 'Link a note using a project or member property.'}</p>`
  }${notes.length > 12 ? `<span class="hint" translate="no">${ru ? 'Первые 12 заметок' : 'First 12 notes'}</span>` : ''}${kind === 'project' ? relationsPanel(`project:${id}`, true) : ''}</div></section>`;
}
