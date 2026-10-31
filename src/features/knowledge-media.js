import { A } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { downloadWorkspaceFile, getSessionGeneration } from '../core/api.js';
import { ensureFileIdentities } from './file-catalog-demand.js';
import { entityAllowed } from '../shared/relations.js';
import { filePreviewPolicy } from '../shared/file-preview-policy.js';
import { knowledgeMedia, mediaScope } from '../core/knowledge-media-state.js';
import { toast, mutate } from '../ui/toast.js';
import { render } from '../shell/render.js';
import { uid } from '../core/utils.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { kc } from '../ui/knowledge-types.js';
import { knowledgeEditBlocked } from '../ui/knowledge-save-status.js';
export async function loadKnowledgeImage(el) {
  const id = el.dataset.id,
    generation = getSessionGeneration();
  el.disabled = true;
  try {
    await ensureFileIdentities([id]);
    if (generation !== getSessionGeneration()) return;
    const file = D().files.find(f => f.id === id);
    if (!entityAllowed(D(), `file:${id}`, { role: S.ui.currentUser?.role, memberId: D().me }) || filePreviewPolicy(file).kind !== 'image')
      throw Error(kc('Image unavailable.', 'Изображение недоступно.'));
    const { blob } = await downloadWorkspaceFile(id, false, { maxBytes: 20 * 1024 * 1024 });
    if (generation !== getSessionGeneration()) return;
    mediaScope();
    while (knowledgeMedia.size >= 6 || [...knowledgeMedia.values()].reduce((n, v) => n + v.bytes, 0) + blob.size > 32 * 1024 * 1024) {
      const oldest = knowledgeMedia.keys().next().value;
      if (!oldest) break;
      URL.revokeObjectURL(knowledgeMedia.get(oldest).url);
      knowledgeMedia.delete(oldest);
    }
    knowledgeMedia.set(id, { url: URL.createObjectURL(blob), bytes: blob.size });
    render();
  } catch (error) {
    toast(error.message, { kind: 'err' });
  } finally {
    if (el.isConnected) el.disabled = false;
  }
}
A.bindKnowledgeAsset = el => {
  const note = D().knowledgeNotes.find(n => n.id === el.dataset.id);
  if (!note || S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  openModal({
    type: 'relations',
    source: `note:${note.id}`,
    query: '',
    kind: 'file',
    relationType: 'source',
    inline: { id: note.id, start: 0, end: 0, base: note.formatted_markdown, assetPath: el.dataset.path },
  });
};
A.openKnowledgeFilePage = async el => {
  await A.openRelatedEntity({ dataset: { key: `file:${el.dataset.id}` } });
  const m = S.ui.modals.at(-1);
  if (m?.type === 'filePreview' && m.file.id === el.dataset.id) m.initialPage = Math.max(1, Number(el.dataset.page) || 1);
};
export function capturePdfExcerpt() {
  const m = S.ui.modals.at(-1),
    selection = window.getSelection(),
    container = document.querySelector('[data-pdf-page-text]');
  if (
    m?.preview?.kind !== 'pdf' ||
    S.ui.currentUser?.role === 'viewer' ||
    knowledgeEditBlocked() ||
    !container?.contains(selection?.anchorNode) ||
    !selection.toString().trim()
  )
    return toast(kc('Select text in the page text first.', 'Сначала выделите фрагмент в тексте страницы.'), { kind: 'info' });
  const text = selection.toString().slice(0, 8000),
    id = uid('kn'),
    name = `${m.file.name} — ${kc('page', 'стр.')} ${m.preview.page}`;
  if (
    mutate(() =>
      D().knowledgeNotes.unshift({
        id,
        title: name,
        typeId: 'research',
        properties: { source: `smena-file:${m.file.id}#page=${m.preview.page}` },
        formatted_markdown: `[${name}](smena-file:${m.file.id}#page=${m.preview.page})\n\n> ${text.replace(/\n/g, '\n> ')}\n\n`,
        tags: [],
        folderId: null,
        updatedAt: new Date().toISOString(),
        updatedBy: D().me,
      }),
    )
  ) {
    closeModal();
    A.goKnowledgeNote({ dataset: { id } });
  }
}
