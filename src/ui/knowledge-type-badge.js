import { D } from '../core/store.js';
import { ic } from '../core/icons.js';
import { esc } from '../core/utils.js';
import { noteType } from '../shared/knowledge-types.js';
import { kc, typeName } from './knowledge-types.js';

export function noteTypeBadge(note) {
  const name = typeName(noteType(note, D().ws));
  return `<button class="knowledge-note-type" data-a="openNoteProperties" data-id="${esc(note.id)}" data-section="type" aria-label="${esc(kc('Note type', 'Тип заметки') + ': ' + name)}" translate="no">${ic('tag', 13)}<span>${esc(name)}</span>${ic('chevron-down', 12)}</button>`;
}
