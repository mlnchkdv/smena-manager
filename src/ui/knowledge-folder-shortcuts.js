import { A } from '../actions/actions.js';
import { D, S, save } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { kc } from './knowledge-types.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { folderPins } from '../shared/knowledge-folder-shortcuts.js';
import { render } from '../shell/render.js';
import { saveKnowledgePreferences } from '../core/knowledge-preferences.js';
let installed = false;
export function installFolderShortcuts() {
  if (installed) return;
  installed = true;
  const original = A.setKnowledgeFolder;
  A.setKnowledgeFolder = el => {
    const query = S.ui.knowledgeFolderQuery || '',
      folder = el.dataset.folder || 'all';
    if (D().knowledgeFolders.some(f => f.id === folder))
      S.ui.knowledgeFolderRecent = [folder, ...(S.ui.knowledgeFolderRecent || []).filter(id => id !== folder)].slice(0, 12);
    saveKnowledgePreferences();
    original(el);
    if (query !== S.ui.knowledgeFolderQuery) {
      S.ui.knowledgeFolderQuery = query;
      render();
    }
  };
}
export function folderQuickLinks(folders, activeId) {
  const byId = new Map(folders.map(f => [f.id, f])),
    active = byId.get(activeId),
    pins = folderPins(S.prefs.knowledgeFolderPins, folders),
    recent = (S.ui.knowledgeFolderRecent || []).filter(id => byId.has(id) && id !== activeId && !pins.includes(id)).slice(0, 4);
  if (!active && !pins.length && !recent.length) return '';
  const links = ids =>
    ids
      .map(id => {
        const f = byId.get(id),
          path = folderTrail(id, byId)
            .map(f => f.name)
            .join(' / ');
        return `<button class="knowledge-folder-quick-link" data-a="setKnowledgeFolder" data-folder="${esc(id)}" title="${esc(path)}" ${activeId === id ? 'aria-current="page"' : ''}>${ic(pins.includes(id) ? 'pin' : 'history', 13)}<span translate="no">${esc(f.name)}</span></button>`;
      })
      .join('');
  return `<div class="knowledge-folder-quick" translate="no">${
    active
      ? `<p class="knowledge-folder-current" aria-label="${kc('Current folder', 'Текущая папка')}">${esc(
          folderTrail(activeId, byId)
            .map(f => f.name)
            .join(' / '),
        )}</p><div class="knowledge-folder-context"><button class="ibtn" data-a="pinKnowledgeFolder" data-folder="${esc(active.id)}" aria-pressed="${pins.includes(active.id)}" aria-label="${kc('Pin folder', 'Закрепить папку')}" title="${kc('Pin folder', 'Закрепить папку')}">${ic('pin', 15)}</button></div>`
      : ''
  }${pins.length ? `<details open><summary>${kc('Pinned folders', 'Закреплённые папки')} · ${pins.length}</summary>${links(pins)}</details>` : ''}${recent.length ? `<details><summary>${kc('Recent folders', 'Недавние папки')}</summary>${links(recent)}</details>` : ''}</div>`;
}
A.pinKnowledgeFolder = el => {
  const folders = D().knowledgeFolders;
  if (!folders.some(f => f.id === el.dataset.folder)) return;
  const pins = folderPins(S.prefs.knowledgeFolderPins, folders),
    id = el.dataset.folder;
  S.prefs.knowledgeFolderPins = JSON.stringify(pins.includes(id) ? pins.filter(p => p !== id) : [id, ...pins].slice(0, 20));
  save();
  render();
};
