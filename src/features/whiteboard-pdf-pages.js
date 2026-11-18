import { A } from '../actions/actions.js';
import { S } from '../core/store.js';
import { whiteboardPdfPageCount, whiteboardPreviewPage } from '../core/whiteboard-previews.js';
import { currentWhiteboard, whiteboardMaterial, whiteboardScope, wbText as T } from '../core/whiteboard-state.js';
import { canEditCurrentWhiteboard, revealWhiteboardPdfPages, whiteboardCommand } from './project-whiteboard.js';
import { filePreviewPolicy } from '../shared/file-preview-policy.js';
import { whiteboardOf, WHITEBOARD_CARD_LIMIT, WHITEBOARD_PDF_PAGE_VERSION } from '../shared/project-whiteboard.js';
import { whiteboardPdfPagePositions, WHITEBOARD_PDF_PAGE_BATCH } from '../shared/whiteboard-pdf-pages.js';
import { closeModal, openModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { esc, uid } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { toast } from '../ui/toast.js';

const pagesPerGroup = 24;
const sortPages = pages => [...pages].sort((a, b) => a - b);
const groupFor = page => Math.floor((page - 1) / pagesPerGroup);
const room = () => Math.max(0, Math.min(WHITEBOARD_PDF_PAGE_BATCH, WHITEBOARD_CARD_LIMIT - whiteboardOf(currentWhiteboard()).nodes.length));
const sourceChanged = () =>
  T('The source PDF changed or is unavailable. Reopen this dialog.', 'Исходный PDF изменился или недоступен. Откройте диалог заново.');
const noRoom = () => T('There are no free card slots on this whiteboard.', 'На холсте закончились свободные места для карточек.');
const fileIdentity = file => JSON.stringify([file.id, file.storageFileId, file.storageName, file.bytes, file.mimeType]);

function pdfCard(id) {
  const node = whiteboardOf(currentWhiteboard()).nodes.find(node => node.id === id && node.type === 'material' && !node.media?.fixed);
  const source = node && whiteboardMaterial(node);
  if (source?.kind !== 'file' || filePreviewPolicy(source.item).kind !== 'pdf') return null;
  return { node, file: source.item };
}

function active() {
  const modal = S.ui.modals.at(-1);
  if (modal?.whiteboardPdfPages && modal.scope === whiteboardScope(currentWhiteboard()?.id)) return modal;
  return null;
}

function renderPicker(modal, heading) {
  const limit = room();
  const start = modal.group * pagesPerGroup + 1;
  const end = Math.min(start + pagesPerGroup - 1, modal.count);
  const selected = sortPages(modal.selected);
  const pageNumber = page => T(`Page ${page}`, `Страница ${page}`);
  const allFit = modal.count > 0 && modal.count <= limit;
  const controls =
    modal.count > pagesPerGroup
      ? `<div class="whiteboard-pdf-picker-nav"><button class="ibtn" data-a="whiteboardPdfPageGroup" data-dir="-1" aria-label="${T('Previous page numbers', 'Предыдущие номера страниц')}" ${start === 1 ? 'disabled' : ''}>${ic('chevron-left', 16)}</button><span>${start}–${end} / ${modal.count}</span><button class="ibtn" data-a="whiteboardPdfPageGroup" data-dir="1" aria-label="${T('Next page numbers', 'Следующие номера страниц')}" ${end === modal.count ? 'disabled' : ''}>${ic('chevron-right', 16)}</button></div>
      <form class="whiteboard-pdf-picker-jump" data-submit="whiteboardPdfPageJump"><label class="field"><span class="sr">${T('Page number', 'Номер страницы')}</span><input class="input" type="number" name="page" min="1" max="${modal.count}" inputmode="numeric" placeholder="${T('Page number', 'Номер страницы')}" required></label><button class="btn btn-secondary" type="submit">${T('Go to page', 'Перейти')}</button></form>`
      : '';
  const pageButton = page => {
    const checked = modal.selected.has(page);
    return `<button type="button" id="whiteboard-pdf-page-${page}" data-a="whiteboardPdfPageToggle" data-page="${page}" aria-label="${pageNumber(page)}" aria-pressed="${checked}" ${!checked && selected.length >= limit ? 'disabled' : ''}>${page}</button>`;
  };
  const ready = modal.count > 0 && !modal.loading;
  return `${heading(T('Extract PDF pages', 'Вынести страницы PDF'))}<div class="modal-b whiteboard-pdf-picker" data-keep="whiteboard-pdf-picker" translate="no">
      <p class="whiteboard-pdf-picker-file">${esc(modal.name)}</p>
      ${modal.loading ? `<p class="hint" role="status">${T('Reading page count…', 'Определяем количество страниц…')}</p>` : ''}
      ${modal.error ? `<p class="err" role="alert">${esc(modal.error)}</p>` : ''}
      ${!modal.loading && !modal.count ? `<button class="btn btn-secondary" data-a="whiteboardPdfPageRetry">${T('Try again', 'Повторить')}</button>` : ''}
      ${
        ready
          ? `<p class="hint">${T('Pages will appear next to this PDF in document order.', 'Страницы появятся рядом с PDF в порядке документа.')}</p>
        <div class="whiteboard-pdf-picker-tools">${allFit ? `<button class="btn btn-ghost" data-a="whiteboardPdfPagesAll" ${selected.length === modal.count ? 'disabled' : ''}>${T('Select all', 'Выбрать все')}</button>` : ''}<button class="btn btn-ghost" data-a="whiteboardPdfPagesClear" ${selected.length ? '' : 'disabled'}>${T('Clear selection', 'Снять выбор')}</button></div>
        ${controls}<div class="whiteboard-pdf-picker-grid" role="group" aria-label="${T('PDF pages', 'Страницы PDF')}">${Array.from({ length: end - start + 1 }, (_, i) => pageButton(start + i)).join('')}</div>
        <p class="hint whiteboard-pdf-picker-selection" role="status">${T(`Selected ${selected.length} of ${limit} available slots.`, `Выбрано ${selected.length}. Можно добавить до ${limit} стр.`)}${selected.length ? ` ${selected.join(', ')}.` : ''}</p>`
          : ''
      }
    </div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="whiteboardPdfPagesSave" ${ready && selected.length && selected.length <= limit ? '' : 'disabled'}>${T('Add cards', 'Добавить карточки')}${selected.length ? ` (${selected.length})` : ''}</button></div>`;
}

function currentSource(modal) {
  const source = pdfCard(modal.nodeId);
  if (source && source.node.target === modal.target && fileIdentity(source.file) === modal.fileKey) return source;
  return null;
}

async function load(modal) {
  const source = currentSource(modal);
  if (!source) {
    modal.error = sourceChanged();
    render();
    return;
  }
  modal.loading = true;
  modal.error = '';
  const controller = new AbortController();
  modal.controller = controller;
  const deadline = setTimeout(() => controller.abort(), 20000);
  render();
  try {
    const count = await whiteboardPdfPageCount(source.file, controller.signal);
    if (active() !== modal) return;
    if (!Number.isSafeInteger(count) || count < 1 || count > 100000) throw new Error('Invalid PDF page count.');
    if (!currentSource(modal)) {
      modal.error = sourceChanged();
      return;
    }
    const page = Math.min(count, whiteboardPreviewPage(source.node));
    modal.count = count;
    modal.group = groupFor(page);
    if (room()) modal.selected.add(page);
  } catch {
    if (active() === modal)
      modal.error = T('Unable to read this PDF. Check access and try again.', 'Не удалось прочитать PDF. Проверьте доступ и повторите попытку.');
  } finally {
    clearTimeout(deadline);
    modal.loading = false;
    if (active() === modal) render();
  }
}

A.whiteboardExtractPdfPages = el => {
  const source = pdfCard(el.dataset.id);
  if (!source || !canEditCurrentWhiteboard()) return;
  if (!room()) return toast(noRoom(), { kind: 'info' });
  const modal = {
    type: 'whiteboardTool',
    whiteboardPdfPages: true,
    scope: whiteboardScope(currentWhiteboard().id),
    nodeId: source.node.id,
    target: source.node.target,
    name: source.file.name,
    fileKey: fileIdentity(source.file),
    count: 0,
    group: 0,
    selected: new Set(),
    loading: true,
    render: renderPicker,
    beforeClose: () => modal.controller?.abort(),
  };
  openModal(modal);
  void load(modal);
};

A.whiteboardPdfPageRetry = () => {
  const modal = active();
  if (modal && !modal.loading && !modal.count) void load(modal);
};
A.whiteboardPdfPageToggle = el => {
  const modal = active();
  const page = Number(el.dataset.page);
  if (!modal || !Number.isSafeInteger(page) || page < 1 || page > modal.count) return;
  if (!modal.selected.delete(page) && modal.selected.size < room()) modal.selected.add(page);
  modal.error = '';
  render();
};
A.whiteboardPdfPagesAll = () => {
  const modal = active();
  if (!modal?.count || modal.count > room()) return;
  modal.selected = new Set(Array.from({ length: modal.count }, (_, i) => i + 1));
  modal.error = '';
  render();
};
A.whiteboardPdfPagesClear = () => {
  const modal = active();
  if (!modal) return;
  modal.selected.clear();
  modal.error = '';
  render();
};
A.whiteboardPdfPageGroup = el => {
  const modal = active();
  if (!modal?.count) return;
  modal.group = Math.max(0, Math.min(groupFor(modal.count), modal.group + (el.dataset.dir === '-1' ? -1 : 1)));
  render();
};
A.whiteboardPdfPageJump = form => {
  const modal = active();
  const page = form.elements.namedItem('page').valueAsNumber;
  if (!modal || !Number.isSafeInteger(page) || page < 1 || page > modal.count) return;
  modal.group = groupFor(page);
  render();
  document.getElementById('whiteboard-pdf-page-' + page)?.focus();
};
A.whiteboardPdfPagesSave = () => {
  const modal = active();
  if (!modal || !modal.count || modal.loading || !canEditCurrentWhiteboard()) return;
  const source = currentSource(modal);
  const pages = sortPages(modal.selected);
  if (!pages.length) return;
  const board = whiteboardOf(currentWhiteboard());
  const positions = source && pages.length <= room() ? whiteboardPdfPagePositions(board.nodes, source.node, pages.length) : null;
  if (!positions) {
    modal.error = !source
      ? sourceChanged()
      : T('Not enough space for this selection. Try fewer pages.', 'Для выбранных страниц не хватает места. Выберите меньше страниц.');
    render();
    return;
  }
  const cards = pages.map((page, i) => ({
    ...positions[i],
    id: uid('wc'),
    type: 'material',
    target: source.node.target,
    color: source.node.color,
    media: { page, fixed: true },
  }));
  if (
    !whiteboardCommand(next => {
      next.version = Math.max(next.version, WHITEBOARD_PDF_PAGE_VERSION);
      next.nodes.push(...cards);
    })
  )
    return;
  closeModal();
  revealWhiteboardPdfPages(cards);
};
