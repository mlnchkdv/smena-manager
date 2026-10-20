import { D } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { createKnowledgeFolderIndex, knowledgeFolderChildren } from '../shared/knowledge-folder-index.js';
import { t } from '../core/i18n.js';

export function knowledgeMovePicker(m) {
  const index = createKnowledgeFolderIndex(D().knowledgeFolders);
  const path = folderTrail(m.folder, index.byId);
  const query = (m.query || '').trim().toLocaleLowerCase();
  const matches = query
    ? index.order
        .map(id => index.byId.get(id))
        .filter(folder =>
          folderTrail(folder.id, index.byId)
            .map(item => item.name)
            .join(' / ')
            .toLocaleLowerCase()
            .includes(query),
        )
    : null;
  const total = matches?.length ?? (index.children.get(m.folder || null) || []).length;
  const start = Math.min(m.offset || 0, Math.max(0, Math.ceil(total / 60) - 1) * 60);
  const folders = matches ? matches.slice(start, start + 60) : knowledgeFolderChildren(index, m.folder, { offset: start, limit: 60 }).folders;
  const selected = D().knowledgeNotes.filter(note => m.ids.includes(note.id));
  const canMove = selected.length === m.ids.length && selected.some(note => (note.folderId || null) !== m.folder) && (!m.folder || index.byId.has(m.folder));
  const destination = path.map(item => item.name).join(' / ') || t('No folder');
  return `<div class="modal-b" data-keep="${esc(`knowledge-move:${m.folder || ''}:${m.query || ''}:${start}`)}">
    <p class="hint"><span>Selected notes</span>: ${selected.length}</p>
    <ul class="knowledge-move-note-titles">${selected
      .slice(0, 3)
      .map(note => `<li translate="no">${esc(note.title || t('Untitled note'))}</li>`)
      .join('')}${selected.length > 3 ? `<li class="hint">+${selected.length - 3}</li>` : ''}</ul>
    <nav class="knowledge-move-crumbs" aria-label="Destination folder"><button class="btn btn-ghost btn-sm" data-a="browseKnowledgeMove" data-folder="">${ic('folder-open', 14)}No folder</button>${path.map(item => `<span aria-hidden="true">/</span><button class="btn btn-ghost btn-sm" data-a="browseKnowledgeMove" data-folder="${esc(item.id)}" translate="no">${esc(item.name)}</button>`).join('')}</nav>
    <label class="field"><span class="sr">Find destination folder</span><input class="input" id="knowledge-move-search" data-in="knowledgeMoveQuery" value="${esc(m.query || '')}" placeholder="Find destination folder" autofocus></label>
    <div class="knowledge-move-folders">${
      folders.length
        ? folders
            .map(
              folder =>
                `<button class="knowledge-move-row" data-a="browseKnowledgeMove" data-folder="${esc(folder.id)}">${ic('folder', 18)}<span translate="no">${esc(
                  query
                    ? folderTrail(folder.id, index.byId)
                        .map(item => item.name)
                        .join(' / ')
                    : folder.name,
                )}</span>${ic('chevron-right', 14)}</button>`,
            )
            .join('')
        : `<p class="hint">${query ? 'No matching folders.' : 'No subfolders here.'}</p>`
    }</div>
    ${total > 60 ? `<div class="knowledge-folder-card-pages"><button class="btn btn-ghost btn-sm" data-a="pageKnowledgeMove" data-offset="${Math.max(0, start - 60)}" ${!start ? 'disabled' : ''}>Previous folders</button><span class="num">${start + 1}–${start + folders.length} / ${total}</span><button class="btn btn-ghost btn-sm" data-a="pageKnowledgeMove" data-offset="${start + 60}" ${start + 60 >= total ? 'disabled' : ''}>Next folders</button></div>` : ''}
    <div class="knowledge-move-destination"><span>Destination folder</span><strong translate="no">${esc(destination)}</strong>${canMove ? '' : '<span class="hint">Choose a different destination folder.</span>'}</div>
    </div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">Cancel</button><span class="sp"></span><button class="btn btn-primary" data-a="confirmKnowledgeMove" ${canMove ? '' : 'disabled'}>Move here</button></div>`;
}
