import { knowledgeBodyState, ensureKnowledgeBody } from '../core/knowledge-bodies.js';
import { render } from '../shell/render.js';
import { isRussian } from '../core/i18n.js';
import { esc } from '../core/utils.js';
export function knowledgeBodyLoading(note) {
  const state = knowledgeBodyState(note);
  if (state.loaded) return '';
  if (!state.loading && !state.error)
    void ensureKnowledgeBody(note).then(render, error => {
      if (!error.staleSession) render();
    });
  return `<section class="panel" role="status" aria-busy="${!state.error}"><p>${isRussian() ? (state.error ? 'Не удалось загрузить заметку. Текст не изменён.' : 'Загрузка заметки…') : state.error ? 'Unable to load this note. Its content is unchanged.' : 'Loading note…'}</p>${state.error ? `<button class="btn btn-secondary" data-a="retryKnowledgeBody" data-id="${esc(note.id)}">${isRussian() ? 'Повторить' : 'Retry'}</button>` : ''}</section>`;
}
