import { ic } from '../core/icons.js';
import { whiteboardShapePicker } from '../ui/whiteboard-shape-picker.js';
import { syncWhiteboardPreviews, whiteboardPreviewPage } from '../core/whiteboard-previews.js';
import { resizedWhiteboardNode, snapWhiteboardResize } from '../shared/whiteboard-resize.js';
import { resizeWhiteboardGroup, groupResizeNodes } from '../shared/whiteboard-group-resize.js';
import { refreshWhiteboardMinimap } from '../ui/whiteboard-minimap.js';
import { writeLayoutPreference } from '../core/view-layout-preferences.js';
import {
  whiteboardSelectionNodes,
  whiteboardSelectionInRect,
  whiteboardSelectionOffset,
  copyWhiteboardSelection,
  pasteWhiteboardSelection,
  arrangeWhiteboardSelection,
  expandWhiteboardSelection,
  groupWhiteboardSelection,
  ungroupWhiteboardSelection,
  movableWhiteboardNodes,
  setWhiteboardPositionLock,
  reorderWhiteboardLayers,
  moveWhiteboardLayer,
  whiteboardLayerUnits,
  setWhiteboardLayerHidden,
} from '../shared/whiteboard-selection.js';
import './whiteboard-history.js';
import './whiteboard-portable.js';
import './whiteboard-tools.js';
import './whiteboard-extract.js';
import './whiteboard-pdf-pages.js';
import './whiteboard-image-editor.js';
import './whiteboard-presentation.js';
import './whiteboard-templates.js';
import { mountWhiteboardAssetInputs } from './whiteboard-assets.js';
import { A, IN } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { queryFileCatalog } from '../core/api.js';
import { whiteboardScope, whiteboardState, whiteboardLabel, whiteboardMaterial, whiteboardNavigationMode, wbText as T } from '../core/whiteboard-state.js';
import { whiteboardMediaPosition, parseWhiteboardTime, formatWhiteboardTime } from '../shared/whiteboard-media.js';
import { filePreviewPolicy } from '../shared/file-preview-policy.js';
import { workspaceSyncState } from '../core/workspace-sync.js';
import { canEditWhiteboard } from '../shared/whiteboards.js';
import { currentWhiteboard } from '../core/whiteboard-state.js';
import { entityAllowed } from '../shared/relations.js';
import {
  BOARD_COLORS,
  BOARD_SHAPES,
  LEGACY_BOARD_SHAPES,
  BOARD_LINE_STYLES,
  BOARD_ENDINGS,
  whiteboardEdgeEnd,
  whiteboardOf,
  validWhiteboard,
  whiteboardBounds,
  removeWhiteboardNode,
  whiteboardLockedIds,
  whiteboardVisibleBoard,
} from '../shared/project-whiteboard.js';
import { esc, uid } from '../core/utils.js';
import { render } from '../shell/render.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { mutate, toast } from '../ui/toast.js';
import { ensureFileIdentities } from './file-catalog-demand.js';
import { whiteboardEdges, whiteboardCard } from '../views/project-whiteboard.js';
import { savedWhiteboardGroups } from '../ui/whiteboard-group-selection.js';
import { mountWhiteboardLayerDrag } from '../ui/whiteboard-layers-panel.js';
import { ensureKnowledgeBody } from '../core/knowledge-bodies.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeDisplayParts } from '../shared/knowledge-frontmatter.js';
import { overlayAboveDiagram } from '../ui/diagram-focus.js';
import { syncDiagramWindow } from '../ui/diagram-window.js';
import { whiteboardPickCandidates } from '../shared/whiteboard-picking.js';
import { whiteboardConnection, reconnectWhiteboardEdge } from '../shared/whiteboard-connect.js';
import { whiteboardInsertionPoint } from '../shared/whiteboard-insertion.js';
import { whiteboardPastedContent, whiteboardMaterialPositions } from '../shared/whiteboard-content.js';
import { whiteboardNodeCamera } from '../shared/whiteboard-camera.js';
import { patchWhiteboardContext } from '../shared/whiteboard-context.js';
import { whiteboardNavigationHint } from '../ui/whiteboard-context.js';
import { refreshWhiteboardOverview } from '../ui/whiteboard-overview.js';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
A.whiteboardReadCard = async el => {
  const p = current(),
    scope = whiteboardScope(p?.id);
  const node = whiteboardOf(p).nodes.find(node => node.id === el.dataset.id);
  if (!p || !node) return;
  const m = {
    type: 'whiteboardReader',
    nodeId: node.id,
    scope,
    render: (m, H) => {
      const card = whiteboardScope(current()?.id) === m.scope ? whiteboardOf(current()).nodes.find(node => node.id === m.nodeId) : null;
      const source = card?.type === 'material' ? whiteboardMaterial(card) : null;
      return `${H(card ? whiteboardLabel(card) : T('Card unavailable', 'Карточка недоступна'))}<div class="modal-b whiteboard-card-reader" translate="no">${m.busy ? `<p role="status">${T('Loading text…', 'Загружаем текст…')}</p>` : m.error ? `<p role="alert">${T('Unable to load the source. Close and retry, or open the material.', 'Не удалось загрузить источник. Закройте и повторите или откройте материал.')}</p>` : ''}${card ? (source?.kind === 'note' && typeof source.item.formatted_markdown === 'string' ? `<article class="knowledge-body">${renderKnowledgeMarkdown(knowledgeDisplayParts(source.item).body, { plainText: source.item.sourceFormat === 'text' })}</article>` : whiteboardCard(card, false, true)) : `<p>${T('The card was removed or access changed.', 'Карточка удалена или доступ изменился.')}</p>`}${source ? `<button class="btn btn-secondary" data-a="openRelatedEntity" data-key="${esc(card.target)}">${T('Open source material', 'Открыть исходный материал')}</button>` : ''}</div>`;
    },
  };
  const source = node.type === 'material' ? whiteboardMaterial(node) : null;
  if (source?.kind === 'file' && filePreviewPolicy(source.item).kind) return A.whiteboardOpenMedia({ dataset: { id: node.id } });
  if (source?.kind === 'bookmark') return A.whiteboardOpenWebsite({ dataset: { id: node.id } });
  m.busy = source?.kind === 'note' && source.item.bodyPending;
  openModal(m);
  if (m.busy) {
    await ensureKnowledgeBody(source.item).catch(() => {
      m.error = true;
    });
    m.busy = false;
    if (S.ui.modals.includes(m)) render();
  }
};
const colors = () => [
  T('Neutral', 'Нейтральный'),
  T('Violet', 'Фиолетовый'),
  T('Blue', 'Синий'),
  T('Green', 'Зелёный'),
  T('Amber', 'Янтарный'),
  T('Rose', 'Розовый'),
];
const current = currentWhiteboard;
const visibleBoard = () => whiteboardVisibleBoard(whiteboardOf(current()));
const editable = p =>
  p && !p.archived && !whiteboardState(p.id).presentationId && canEditWhiteboard(D(), p, D().me, S.ui.currentUser?.role) && !workspaceSyncState().hasConflict;
export const canEditCurrentWhiteboard = () => editable(current());
const field = (name, label, value, type = 'text', extra = '') =>
  `<label class="field">${label}<input class="input" data-in="whiteboardField" data-field="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const colorField = m =>
  `<label class="field">${T('Color', 'Цвет')}<select class="select" data-in="whiteboardField" data-field="color" aria-label="${T('Color', 'Цвет')}">${BOARD_COLORS.map((c, i) => `<option value="${c}" ${c === m.color ? 'selected' : ''}>${colors()[i]}</option>`).join('')}</select></label>`;
const optionField = (m, key, label, values, names) =>
  `<label class="field">${label}<select class="select" data-in="whiteboardField" data-field="${key}">${values.map((value, i) => `<option value="${value}" ${m[key] === value ? 'selected' : ''}>${names[i]}</option>`).join('')}</select></label>`;
function cardFormTitle(m) {
  if (m.id) return m.nodeType === 'material' ? T('Card settings', 'Настройки карточки') : T('Edit card', 'Редактировать карточку');
  if (m.nodeType === 'group') return T('New frame', 'Новая рамка');
  if (m.nodeType === 'shape') return T('New shape', 'Новая фигура');
  return T('New text card', 'Новая текстовая карточка');
}
function modalForm(m, H) {
  const p = current(),
    board = whiteboardOf(p);
  const title = m.kind === 'edge' ? T('Connection', 'Связь') : m.kind === 'material' ? T('Add material', 'Добавить материал') : cardFormTitle(m);
  let body;
  if (m.kind === 'material') {
    const q = m.query.trim().toLocaleLowerCase();
    const candidates = [
      ...D().knowledgeNotes.map(n => ({ key: `note:${n.id}`, title: n.title, kind: T('Note', 'Заметка') })),
      ...D()
        .tasks.filter(t => !p?.project || t.project === p.project)
        .map(t => ({ key: `task:${t.id}`, title: t.title, kind: T('Task', 'Задача') })),
      ...D().links.map(l => ({ key: `bookmark:${l.id}`, title: l.title || l.url, kind: T('Bookmark', 'Закладка') })),
      ...(D().whiteboards || [])
        .filter(b => b.id !== p?.id && !b.archived && entityAllowed(D(), `whiteboard:${b.id}`, { role: S.ui.currentUser?.role, memberId: D().me }))
        .map(b => ({ key: `whiteboard:${b.id}`, title: b.name, kind: T('Whiteboard', 'Холст') })),
      ...(m.files || []).map(f => ({ key: `file:${f.id}`, title: f.name, kind: T('File', 'Файл') })),
    ]
      .filter(c => c.title.toLocaleLowerCase().includes(q))
      .slice(0, 50);
    body = `<label class="field">${T('Search notes, tasks, bookmarks and files', 'Поиск заметок, задач, закладок и файлов')}<input class="input" autofocus data-in="whiteboardQuery" value="${esc(m.query)}"></label><p class="hint">${T('The card opens the original material. Access is checked separately. Up to 50 results; refine your search.', 'Карточка открывает оригинал. Доступ к материалу проверяется отдельно. До 50 результатов — уточните поиск.')}</p>${m.loading ? `<p role="status">${T('Searching files…', 'Ищем файлы…')}</p>` : ''}${candidates.map(c => `<button class="whiteboard-material-option" data-a="whiteboardChooseMaterial" data-key="${esc(c.key)}"><span>${esc(c.title)}</span><small>${c.kind}</small></button>`).join('') || `<p>${T('No matching materials.', 'Подходящих материалов нет.')}</p>`}<button class="btn btn-ghost btn-sm" data-a="whiteboardQueryFiles">${T('Refresh available files', 'Обновить доступные файлы')}</button>`;
  } else if (m.kind === 'edge') {
    const select = (key, label) =>
      `<label class="field">${label}<select class="select" data-in="whiteboardField" data-field="${key}">${whiteboardVisibleBoard(board)
        .nodes.map(n => `<option value="${esc(n.id)}" ${m[key] === n.id ? 'selected' : ''}>${esc(whiteboardLabel(n))}</option>`)
        .join('')}</select></label>`;
    const ends = [T('None', 'Нет'), T('Arrow', 'Стрелка'), T('Dot', 'Точка')];
    body = `<p class="hint">${T('Visual connection on this canvas. It does not create a relation between source materials.', 'Визуальная связь на этом холсте. Она не создаёт отношение между исходными материалами.')}</p><div class="whiteboard-form-grid">${select('from', T('From card', 'От карточки'))}${select('to', T('To card', 'К карточке'))}${optionField(m, 'fromEnd', T('Start', 'Начало'), BOARD_ENDINGS, ends)}${optionField(m, 'toEnd', T('End', 'Конец'), BOARD_ENDINGS, ends)}</div>${field('label', T('Label', 'Подпись'), m.label, 'text', 'maxlength="120"')}<div class="whiteboard-form-grid">${colorField(m)}${optionField(m, 'style', T('Line style', 'Стиль линии'), BOARD_LINE_STYLES, [T('Solid', 'Сплошная'), T('Dashed', 'Штриховая'), T('Dotted', 'Пунктирная')])}</div>`;
  } else {
    const material = m.nodeType === 'material';
    const locked = m.id && whiteboardLockedIds(board).has(m.id);
    const geometry = (key, label, min, max) => field(key, label, m[key], 'number', `min="${min}" max="${max}" ${locked ? 'disabled' : ''}`);
    body = `${material ? `<p class="whiteboard-form-file" translate="no">${esc(whiteboardLabel(m.base))}</p>` : `${field('title', T('Title', 'Название'), m.title, 'text', 'maxlength="120" autofocus')}${m.nodeType !== 'group' ? `<label class="field">${T('Text', 'Текст')}<textarea class="textarea" rows="4" data-in="whiteboardField" data-field="text" maxlength="6000">${esc(m.text)}</textarea></label>` : ''}`}<details class="whiteboard-card-options" ${material || m.showSize ? 'open' : ''}><summary>${T('Color, size and position', 'Цвет, размер и положение')}</summary>${colorField(m)}${locked ? `<p class="hint">${T('Position and size are locked.', 'Положение и размер зафиксированы.')}</p>` : ''}<div class="whiteboard-form-grid">${geometry('x', 'X', -50000, 50000)}${geometry('y', 'Y', -50000, 50000)}${geometry('width', T('Width', 'Ширина'), 160, 2000)}${geometry('height', T('Height', 'Высота'), 100, 2000)}</div></details>`;
  }
  if (m.kind === 'node' && m.nodeType === 'shape') body = whiteboardShapePicker(m.shape, m.shapePickerOpen ?? !m.id) + body;
  if (m.kind === 'node' && m.nodeType === 'material') {
    const source = whiteboardMaterial(m.base),
      media = source?.kind === 'file' ? whiteboardMediaPosition(source.item, m.media) : null;
    if (media && !media.fixed && ['pdf', 'video', 'audio'].includes(media.kind))
      body = `${
        media.kind === 'pdf'
          ? field('mediaPage', T('PDF page', 'Страница PDF'), m.mediaPage ?? '', 'number', 'min="1" max="100000" placeholder="1"')
          : field(
              'mediaTime',
              T('Start at (hh:mm:ss)', 'Начать с (чч:мм:сс)'),
              m.mediaTime ?? '',
              'text',
              'maxlength="16" placeholder="00:00:00" inputmode="numeric"',
            )
      }
      <p class="hint">${T('Leave blank to open the beginning. Only the position is saved; the source file and its access rules stay unchanged.', 'Оставьте пустым, чтобы открыть начало. Сохраняется только позиция; исходный файл и права доступа не меняются.')}</p>${body}`;
  }
  if (!editable(p) && m.kind !== 'material')
    body = `<p class="hint">${T('Read only', 'Только просмотр')}</p><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.kind === 'edge' ? m.label : m.base?.text || whiteboardLabel(m.base))}</p>`;
  const canSave = m.kind !== 'material' && editable(p);
  const addAnother = canSave && m.kind === 'node' && m.nodeType === 'text' && !m.id;
  return `${H(title)}<div class="modal-b whiteboard-card-form" data-keep="whiteboard-card-form" translate="no">${body}${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f whiteboard-card-form-footer" translate="no">${m.id && canSave ? `<button type="button" class="btn btn-ghost bad" data-a="whiteboardRemoveInModal">${T('Remove', 'Убрать')}</button>` : ''}<span class="sp"></span><button type="button" class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button>${addAnother ? `<button type="button" class="btn btn-secondary" data-a="whiteboardSaveNext">${T('Add another', 'Добавить ещё')}</button>` : ''}${canSave ? `<button type="button" class="btn btn-primary" data-a="whiteboardSave">${m.id ? T('Save', 'Сохранить') : T('Add', 'Добавить')}</button>` : ''}</div>`;
}
function openTool(values) {
  const p = current();
  if (!p) return;
  openModal({ type: 'whiteboardTool', render: modalForm, project: p.id, scope: whiteboardScope(p.id), ...values });
}
const activeModal = () => {
  const m = S.ui.modals.at(-1),
    p = current();
  return m?.type === 'whiteboardTool' && p?.id === m.project && m.scope === whiteboardScope(p.id) ? m : null;
};
export function whiteboardCommand(change, restoreToken, replaceBaseHash, commit) {
  const p = current();
  if (!editable(p)) {
    toast(T('Editing is unavailable. Check access or synchronization.', 'Редактирование недоступно. Проверьте доступ и синхронизацию.'), { kind: 'err' });
    return false;
  }
  const before = structuredClone(whiteboardOf(p)),
    next = structuredClone(typeof change === 'function' ? before : change),
    state = whiteboardState();
  if (typeof change === 'function') change(next);
  if (same(before, next)) return true;
  if (!validWhiteboard(next)) {
    toast(T('Board limit or invalid values. Use up to 200 cards and 400 connections.', 'Лимит холста или неверные значения. До 200 карточек и 400 связей.'), {
      kind: 'err',
    });
    return false;
  }
  const undo = state.undo,
    redo = state.redo;
  state.undo = [...undo, { before, after: structuredClone(next) }].slice(-12);
  state.redo = [];
  if (
    !mutate(() => {
      p.whiteboard = next;
      commit?.();
      if (restoreToken) p.whiteboardRestoreFrom = restoreToken;
      if (replaceBaseHash) p.whiteboardReplaceBaseHash = replaceBaseHash;
    })
  ) {
    state.undo = undo;
    state.redo = redo;
    return false;
  }
  return true;
}
const insertion = () => {
  const s = whiteboardState(),
    box = document.querySelector('.whiteboard-viewport')?.getBoundingClientRect();
  const origin = {
    x: Math.round(((box?.width || 600) / 2 - s.x) / s.zoom / 10) * 10 - 120,
    y: Math.round(((box?.height || 400) / 2 - s.y) / s.zoom / 10) * 10 - 80,
  };
  for (let i = 0; i < 200; i++) {
    const point = { x: Math.min(49000, origin.x + (i % 4) * 300), y: Math.min(49000, origin.y + Math.floor(i / 4) * 220) };
    if (
      !whiteboardOf(current()).nodes.some(
        n => n.type !== 'group' && point.x < n.x + n.width + 20 && point.x + 280 > n.x && point.y < n.y + n.height + 20 && point.y + 200 > n.y,
      )
    )
      return point;
  }
  return origin;
};
function revealNode(node, keepZoom = false, center = true) {
  const s = whiteboardState();
  s.selected = node.id;
  s.selection = [node.id];
  s.selectedEdge = '';
  if (!center) return;
  const camera = whiteboardNodeCamera(node, document.querySelector('.whiteboard-viewport')?.getBoundingClientRect(), keepZoom ? s.zoom : 1);
  if (camera) Object.assign(s, camera, { fit: false, autoFit: false });
}
function newCard(type, point, text = '') {
  if (!editable(current())) return;
  const position = point || insertion();
  openTool({
    kind: 'node',
    nodeType: type,
    title: '',
    text,
    color: type === 'group' ? 'blue' : 'neutral',
    ...position,
    width: type === 'group' ? 600 : 260,
    height: type === 'group' ? 400 : 180,
    ...(type === 'shape' ? { shape: 'rectangle' } : {}),
  });
}
A.whiteboardNewText = () => newCard('text');
export const openWhiteboardTextDraft = (text, point) => newCard('text', point, text);
A.whiteboardNewFrame = () => newCard('group');
A.whiteboardNewShape = () => newCard('shape');
A.whiteboardChooseShape = el => {
  const m = activeModal();
  if (!m || m.kind !== 'node' || m.nodeType !== 'shape' || !BOARD_SHAPES.includes(el.dataset.shape)) return;
  m.shape = el.dataset.shape;
  m.shapePickerOpen = false;
  render();
  requestAnimationFrame(() => document.querySelector('.whiteboard-shape-picker > summary')?.focus());
};
A.whiteboardEdit = el => {
  const node = whiteboardOf(current()).nodes.find(n => n.id === (el.dataset.id || whiteboardState().selected));
  if (node) {
    const { type, ...values } = node;
    openTool({
      ...values,
      mediaPage: node.media?.page ?? '',
      mediaTime: node.media?.seconds == null ? '' : formatWhiteboardTime(node.media.seconds),
      kind: 'node',
      nodeType: type,
      showSize: el.dataset.size === 'true',
      base: structuredClone(node),
    });
  }
};
IN.whiteboardField = el => {
  const m = activeModal();
  if (!m) return;
  m[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
};
function saveWhiteboardForm(addAnother = false) {
  const m = activeModal(),
    p = current();
  if (!m || !['node', 'edge'].includes(m.kind) || !editable(p)) return;
  const board = whiteboardOf(p),
    collection = m.kind === 'edge' ? 'edges' : 'nodes';
  const old = board[collection].find(n => n.id === m.id);
  if (m.id && (!old || !same(old, m.base))) {
    m.error = T(
      'This item changed in another session. Copy your text before reopening it.',
      'Этот элемент изменён в другой сессии. Скопируйте свой текст перед повторным открытием.',
    );
    render();
    return;
  }
  if (
    m.kind === 'edge' &&
    (m.from === m.to ||
      ((!old || m.from !== old.from || m.to !== old.to) && board.edges.some(edge => edge.id !== m.id && edge.from === m.from && edge.to === m.to)))
  ) {
    m.error =
      m.from === m.to
        ? T('Choose two different cards.', 'Выберите две разные карточки.')
        : T('These cards are already connected in this direction.', 'Эти карточки уже связаны в выбранном направлении.');
    render();
    return;
  }
  let item;
  if (m.kind === 'edge')
    item = {
      id: m.id || uid('we'),
      from: m.from,
      to: m.to,
      label: m.label.trim(),
      arrow: m.toEnd === 'arrow',
      color: m.color,
      fromEnd: m.fromEnd,
      toEnd: m.toEnd,
      style: m.style,
    };
  else {
    const position = old && whiteboardLockedIds(board).has(old.id) ? old : m;
    item = { id: m.id || uid('wc'), type: m.nodeType, x: position.x, y: position.y, width: position.width, height: position.height, color: m.color };
    if (old?.locked) item.locked = true;
    if (old?.hidden) item.hidden = true;
    if (m.nodeType === 'material') {
      item.target = old.target;
      const source = whiteboardMaterial(old),
        kind = source?.kind === 'file' ? whiteboardMediaPosition(source.item, old.media).kind : null;
      if (old.media?.fixed) item.media = { ...old.media };
      else if (kind === 'pdf' && m.mediaPage !== '' && m.mediaPage !== 0) item.media = { page: m.mediaPage };
      else if (['video', 'audio'].includes(kind)) {
        const seconds = parseWhiteboardTime(m.mediaTime);
        if (Number.isNaN(seconds)) {
          m.error = T('Use hours:minutes:seconds, up to 168:00:00.', 'Укажите часы:минуты:секунды, не более 168:00:00.');
          render();
          return;
        }
        if (seconds != null) item.media = { seconds };
      } else if (kind !== 'pdf' && old.media) item.media = structuredClone(old.media);
    } else Object.assign(item, { title: m.title.trim(), text: m.text || '' });
    if (m.nodeType === 'shape') item.shape = m.shape;
    if (m.nodeType === 'group' && old?.sequence != null) item.sequence = old.sequence;
  }
  if (
    command(next => {
      if (item.media) next.version = Math.max(next.version, 2);
      if (item.type === 'shape' || m.kind === 'edge') next.version = Math.max(next.version, 3);
      if (item.type === 'shape' && !LEGACY_BOARD_SHAPES.includes(item.shape)) next.version = Math.max(next.version, 5);
      next[collection] = old ? next[collection].map(n => (n.id === old.id ? item : n)) : [...next[collection], item];
    })
  ) {
    if (collection === 'nodes') revealNode(item, Boolean(old), !old || ['x', 'y', 'width', 'height'].some(key => old[key] !== item[key]));
    else selectConnection(whiteboardState(), item.id);
    closeModal();
    if (addAnother && !old && item.type === 'text') newCard('text');
  }
}
A.whiteboardSave = () => saveWhiteboardForm();
A.whiteboardSaveNext = () => saveWhiteboardForm(true);
document.addEventListener('keydown', event => {
  const target = event.target;
  if (event.key !== 'Enter' || event.isComposing || !target.closest?.('.whiteboard-card-form')) return;
  const quickSave = event.ctrlKey || event.metaKey;
  if (!quickSave && !target.matches('input[data-field="title"]')) return;
  if (!target.closest('.modal')?.querySelector('[data-a="whiteboardSave"]')) return;
  event.preventDefault();
  saveWhiteboardForm();
});
A.whiteboardAddMaterial = () => {
  if (!editable(current())) return;
  openTool({ kind: 'material', query: '', files: [], loading: false });
  void queryFiles();
};
A.whiteboardOpenMedia = el => {
  const node = whiteboardOf(current()).nodes.find(node => node.id === el.dataset.id),
    source = node && whiteboardMaterial(node);
  if (source?.kind !== 'file') return;
  const position = whiteboardMediaPosition(source.item, node.media);
  const page = position.kind === 'pdf' ? whiteboardPreviewPage(node) : null;
  A.previewFile({
    dataset: {
      id: source.id,
      ...(page ? { page: String(page) } : {}),
      ...(position.seconds != null ? { seconds: String(position.seconds) } : {}),
    },
  });
};
let queryTimer;
IN.whiteboardQuery = el => {
  const m = activeModal();
  if (!m) return;
  m.query = el.value;
  clearTimeout(queryTimer);
  render();
  queryTimer = setTimeout(() => {
    void queryFiles();
  }, 250);
};
async function queryFiles() {
  const m = activeModal();
  if (!m || m.kind !== 'material') return;
  const query = m.query,
    token = uid('read');
  m.read = token;
  m.loading = true;
  m.error = '';
  render();
  try {
    const result = await queryFileCatalog({ project: current()?.project || '', query: query.slice(0, 500), revision: S.ui.workspaceRevision, limit: 50 });
    if (activeModal() !== m || m.read !== token) return;
    await ensureFileIdentities((result.files || []).map(file => file.id));
    if (activeModal() !== m || m.read !== token) return;
    m.files = (result.files || []).map(file => D().files.find(item => item.id === file.id)).filter(Boolean);
  } catch {
    if (activeModal() === m && m.read === token)
      m.error = T('Files could not be loaded. Retry after synchronization.', 'Не удалось загрузить файлы. Повторите после синхронизации.');
  } finally {
    if (activeModal() === m && m.read === token) {
      m.loading = false;
      render();
    }
  }
}
A.whiteboardQueryFiles = () => {
  void queryFiles();
};
A.whiteboardChooseMaterial = async el => {
  const m = activeModal(),
    key = el.dataset.key;
  if (!m || !editable(current())) return;
  if (key.startsWith('file:')) {
    try {
      await ensureFileIdentities([key.slice(5)]);
    } catch {
      m.error = T('Material unavailable.', 'Материал недоступен.');
      render();
      return;
    }
  }
  if (activeModal() !== m || !entityAllowed(D(), key, { role: S.ui.currentUser?.role, memberId: D().me })) return;
  if (insertWhiteboardMaterials([key]).length) closeModal();
};
export function insertWhiteboardMaterials(keys, commit, at) {
  if (!editable(current())) return [];
  const allowed = keys.filter(key => entityAllowed(D(), key, { role: S.ui.currentUser?.role, memberId: D().me }) || (!!commit && key.startsWith('bookmark:')));
  const positions = whiteboardMaterialPositions(at || insertion(), allowed.length);
  const nodes = allowed.map((key, index) => {
    const file = key.startsWith('file:') && D().files.find(file => file.id === key.slice(5));
    const kind = file && filePreviewPolicy(file).kind;
    return {
      id: uid('wc'),
      type: 'material',
      target: key,
      ...positions[index],
      width: kind === 'pdf' ? 360 : kind === 'image' || key.startsWith('bookmark:') ? 360 : 260,
      height: kind === 'pdf' ? 460 : kind === 'image' || key.startsWith('bookmark:') ? 300 : 180,
      color: 'neutral',
    };
  });
  if (!nodes.length || !whiteboardCommand(board => board.nodes.push(...nodes), null, null, commit)) return [];
  revealNode(nodes[0]);
  render();
  return nodes;
}
const command = whiteboardCommand;
const selectedIds = () => {
  const s = whiteboardState();
  return expandWhiteboardSelection(visibleBoard(), s.selection?.length ? s.selection : s.selected ? [s.selected] : []);
};
function selectNodes(state, ids, active = ids[0] || '') {
  const selection = expandWhiteboardSelection(visibleBoard(), ids);
  Object.assign(state, { selected: selection.includes(active) ? active : selection[0] || '', selection, selectedEdge: '' });
  if (selection.length < 2) state.resizeSelection = false;
}
function toggleWhiteboardSelection(id, checked) {
  const selected = selectedIds();
  const members = expandWhiteboardSelection(visibleBoard(), [id]);
  const include = checked ?? !selected.includes(id);
  selectNodes(whiteboardState(), include ? [...selected, ...members] : selected.filter(member => !members.includes(member)));
}
A.whiteboardSelect = (el, event) => {
  const s = whiteboardState(),
    id = el.dataset.id;
  if (!visibleBoard().nodes.some(node => node.id === id)) return;
  if (s.connectFrom) return finishConnection(s.connectFrom, id);
  if (s.reconnect) return finishReconnect(s.reconnect, id);
  if (Date.now() < (s.tapOpenUntil || 0)) return;
  if (s.multiSelect || event?.shiftKey || event?.ctrlKey || event?.metaKey) toggleWhiteboardSelection(id);
  else selectNodes(s, [id]);
  render();
};
function cardChooserResults(modal) {
  const nodes = visibleBoard().nodes;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const candidates = modal.ids ? modal.ids.map(id => byId.get(id)).filter(Boolean) : nodes;
  const available = candidates.filter(node => node.id !== modal.connection?.from && (!modal.onlyFrames || node.type === 'group'));
  const query = modal.query.trim().toLocaleLowerCase();
  const matches = available
    .map(node => ({ node, label: whiteboardLabel(node) }))
    .filter(({ node, label }) => `${label} ${node.text || ''}`.toLocaleLowerCase().includes(query));
  const selected = new Set(selectedIds());
  const types = {
    group: T('Frame', 'Рамка'),
    shape: T('Shape', 'Фигура'),
    material: T('Linked material', 'Связанный материал'),
    text: T('Text card', 'Текстовая карточка'),
  };
  return {
    status: T(`Found: ${matches.length} / ${available.length}`, `Найдено: ${matches.length} / ${available.length}`),
    html:
      matches
        .map(({ node, label }) => {
          const checked = selected.has(node.id);
          return `<button class="whiteboard-card-choice" data-a="whiteboardPickCard" data-id="${esc(node.id)}" aria-pressed="${checked}"><strong>${checked ? ic('check', 14) : ''}${esc(label)}</strong><small>${types[node.type]}</small>${node.text ? `<span>${esc(node.text.slice(0, 160))}${node.text.length > 160 ? '…' : ''}</span>` : ''}</button>`;
        })
        .join('') || `<p>${T('No matching cards.', 'Карточки не найдены.')}</p>`,
  };
}

function openCardChooser(ids, connection = pendingConnection(whiteboardState())) {
  const p = current();
  if (!p) return;
  openModal({
    type: 'whiteboardTool',
    project: p.id,
    scope: whiteboardScope(p.id),
    kind: 'pick',
    ids,
    connection,
    query: '',
    render: (m, H) => {
      const { status, html } = cardChooserResults(m);
      const kindPicker =
        m.ids || m.connection
          ? ''
          : `<div class="whiteboard-pick-kinds" role="group" aria-label="${T('Card types', 'Типы карточек')}"><button class="btn btn-secondary btn-sm" data-a="whiteboardPickKind" data-kind="all" aria-pressed="${!m.onlyFrames}">${T('All cards', 'Все карточки')}</button><button class="btn btn-secondary btn-sm" data-a="whiteboardPickKind" data-kind="frames" aria-pressed="${!!m.onlyFrames}">${ic('square-dashed', 14)}${T('Frames', 'Рамки')}</button></div>`;
      const title = m.connection ? T('Choose a connection target', 'Выбрать цель связи') : T('Choose card', 'Выбрать карточку');
      return `${H(title)}<div class="modal-b" translate="no">${kindPicker}<label class="field">${T('Search cards', 'Поиск карточек')}<input class="input" id="whiteboard-pick-query" data-in="whiteboardPickQuery" value="${esc(m.query)}" autofocus></label><p class="hint" data-whiteboard-pick-status role="status">${status}</p><div class="whiteboard-card-choices">${html}</div></div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button></div>`;
    },
  });
}
A.whiteboardPickFromList = () => openCardChooser();
A.whiteboardPickKind = el => {
  const m = activeModal();
  if (m?.kind !== 'pick' || !['all', 'frames'].includes(el.dataset.kind)) return;
  m.onlyFrames = el.dataset.kind === 'frames';
  render();
};
IN.whiteboardPickQuery = el => {
  const m = activeModal();
  if (m?.kind !== 'pick') return;
  m.query = el.value;
  const dialog = el.closest('.modal');
  const { status, html } = cardChooserResults(m);
  dialog.querySelector('[data-whiteboard-pick-status]').textContent = status;
  dialog.querySelector('.whiteboard-card-choices').innerHTML = html;
};
A.whiteboardPickCard = el => {
  const m = activeModal();
  if (m?.kind !== 'pick' || !visibleBoard().nodes.some(n => n.id === el.dataset.id && (!m.ids || m.ids.includes(n.id)))) return;
  const id = el.dataset.id;
  const state = whiteboardState();
  closeModal();
  if (m.connection) {
    if (id !== m.connection.from && same(m.connection, pendingConnection(state))) completeConnection(m.connection, id);
    return;
  }
  if (m.ids) A.whiteboardSelect({ dataset: { id } });
  else A.whiteboardLocate({ dataset: { id, keepSelection: state.multiSelect ? 'true' : '' } });
};
IN.whiteboardSelection = el => {
  toggleWhiteboardSelection(el.dataset.id, el.checked);
  render();
};
A.whiteboardToggleSelection = () => {
  whiteboardState().multiSelect = !whiteboardState().multiSelect;
  render();
};
A.whiteboardDeselect = () => {
  selectNodes(whiteboardState(), []);
  render();
};
let clipboard;
A.whiteboardCopy = async () => {
  if (!current() || !selectedIds().length) return;
  const board = copyWhiteboardSelection(whiteboardOf(current()), selectedIds());
  clipboard = { scope: JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url]), board };
  try {
    await navigator.clipboard.writeText(JSON.stringify({ format: 'smena-whiteboard-selection', version: 1, board }));
  } catch {
    /* internal fallback */
  }
  toast(T('Cards copied', 'Карточки скопированы'), { kind: 'info' });
};
export async function pasteWhiteboardContent(suppliedText) {
  const p = current();
  if (!editable(p)) return;
  const scope = whiteboardScope(p.id);
  let content;
  try {
    content = whiteboardPastedContent(suppliedText ?? (await navigator.clipboard.readText()));
  } catch {
    if (clipboard?.scope === JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url])) content = { kind: 'selection', board: clipboard.board };
  }
  if (current()?.id !== p.id || scope !== whiteboardScope(p.id) || !editable(current()) || overlayAboveDiagram()) return;
  if (content?.kind === 'website') return A.whiteboardAddWebsite({ dataset: { url: content.url } });
  if (content?.kind === 'text') return openWhiteboardTextDraft(content.text);
  const fragment = content?.board;
  if (!fragment || !validWhiteboard(fragment))
    return toast(T('Copy cards, an HTTP(S) link or text up to 6,000 characters.', 'Скопируйте карточки, ссылку HTTP(S) или текст до 6000 символов.'), {
      kind: 'info',
    });
  const files = fragment.nodes
    .filter(n => n.type === 'material' && n.target.startsWith('file:') && !D().files.some(f => f.id === n.target.slice(5)))
    .map(n => n.target.slice(5));
  if (files.length) {
    try {
      await ensureFileIdentities(files);
    } catch {
      return toast(T('Could not check material access. Try again.', 'Не удалось проверить доступ к материалам. Повторите попытку.'), { kind: 'err' });
    }
    if (current()?.id !== p.id || scope !== whiteboardScope(p.id) || !editable(current())) return;
  }
  if (fragment.nodes.some(n => n.type === 'material' && !entityAllowed(D(), n.target, { memberId: D().me, role: S.ui.currentUser?.role })))
    return toast(T('A linked material is unavailable.', 'Связанный материал недоступен.'), { kind: 'err' });
  const result = pasteWhiteboardSelection(whiteboardOf(current()), fragment, uid);
  if (!result) return toast(T('Board limit or invalid coordinates.', 'Лимит холста или неверные координаты.'), { kind: 'err' });
  if (command(next => Object.assign(next, result.board))) {
    const s = whiteboardState();
    s.selection = result.ids;
    s.selected = result.ids[0] || '';
    s.multiSelect = result.ids.length > 1;
    render();
  }
}
A.whiteboardPaste = () => pasteWhiteboardContent();
A.whiteboardPositionLock = el => {
  const ids = selectedIds();
  const locked = el.dataset.locked === 'true';
  if (!ids.length || !command(board => setWhiteboardPositionLock(board, ids, locked))) return;
  const button = document.querySelector('[data-a="whiteboardPositionLock"]');
  const focus = button?.getClientRects().length ? button : document.querySelector('.whiteboard-context-menu > summary');
  focus?.focus({ preventScroll: true });
};
A.whiteboardReorderLayers = el => {
  const ids = selectedIds();
  const { direction } = el.dataset;
  const disclosure = el.closest('[data-ui-disclosure]')?.dataset.uiDisclosure;
  let changed = false;
  if (
    !command(board => {
      const order = reorderWhiteboardLayers(board, ids, direction);
      changed = order !== board.nodes;
      if (changed) board.nodes = order;
    }) ||
    !changed
  )
    return;
  if (disclosure) document.querySelector(`[data-ui-disclosure="${CSS.escape(disclosure)}"] > summary`)?.focus({ preventScroll: true });
  const status = document.querySelector('[data-whiteboard-layer-status]');
  const messages = {
    front: T('Moved to the front', 'Перемещено на передний план'),
    forward: T('Moved forward one layer', 'Перемещено на слой вперёд'),
    backward: T('Moved back one layer', 'Перемещено на слой назад'),
    back: T('Moved to the back', 'Перемещено на задний план'),
  };
  requestAnimationFrame(() => {
    if (status?.isConnected) status.textContent = messages[direction];
  });
};

A.whiteboardToggleLayers = () => {
  const p = current();
  if (!p) return;
  const state = whiteboardState(p.id);
  if (state.presentationId) return;
  state.layersOpen = !state.layersOpen || state.outline;
  if (state.layersOpen) state.outline = false;
  render();
  const selector = state.layersOpen ? '#whiteboard-layers-panel [data-a="whiteboardToggleLayers"]' : '.whiteboard-navigation [data-a="whiteboardToggleLayers"]';
  document.querySelector(selector)?.focus({ preventScroll: !state.layersOpen });
};

A.whiteboardLayerVisibility = el => {
  const { id } = el.dataset;
  const hidden = el.dataset.hidden === 'true';
  if (!command(board => setWhiteboardLayerHidden(board, id, hidden))) return;
  document.querySelector(`[data-a="whiteboardLayerVisibility"][data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  announceWhiteboardLayerChange(hidden ? T('Layer hidden', 'Слой скрыт') : T('Layer shown', 'Слой показан'));
};

A.whiteboardLayerPositionLock = el => {
  const { id } = el.dataset;
  const locked = el.dataset.locked === 'true';
  if (
    !command(board => {
      const layer = whiteboardLayerUnits(board).find(item => item.id === id);
      if (layer)
        setWhiteboardPositionLock(
          board,
          layer.nodes.map(node => node.id),
          locked,
        );
    })
  )
    return;
  document.querySelector(`[data-a="whiteboardLayerPositionLock"][data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  announceWhiteboardLayerChange(
    locked ? T('Layer position locked', 'Положение слоя зафиксировано') : T('Layer position unlocked', 'Положение слоя разблокировано'),
  );
};

function announceWhiteboardLayerChange(message) {
  const status = document.querySelector('[data-whiteboard-layer-status]');
  requestAnimationFrame(() => {
    if (status?.isConnected) status.textContent = message;
  });
}

function dropWhiteboardLayer(source, target, position) {
  const p = current();
  if (!editable(p)) return;
  const board = whiteboardOf(p);
  const order = moveWhiteboardLayer(board, source, target, position);
  if (order === board.nodes) return;
  const layer = whiteboardLayerUnits(board).find(item => item.id === source);
  const state = whiteboardState(p.id);
  if (
    !command({ ...board, nodes: order }, null, null, () => {
      if (!layer.hidden)
        selectNodes(
          state,
          layer.nodes.map(node => node.id),
        );
    })
  )
    return;
  const handle = document.querySelector(`[data-layer-handle="${CSS.escape(source)}"]`);
  handle?.focus({ preventScroll: true });
  handle?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  announceWhiteboardLayerChange(T('Layer order updated', 'Порядок слоёв изменён'));
}
A.whiteboardGroupSelection = () => {
  const ids = selectedIds();
  if (command(board => groupWhiteboardSelection(board, ids, uid('wg'))))
    document.querySelector('[data-a="whiteboardUngroupSelection"]')?.focus({ preventScroll: true });
};
A.whiteboardUngroupSelection = () => {
  const ids = selectedIds();
  if (command(board => ungroupWhiteboardSelection(board, ids))) document.querySelector('[data-a="whiteboardGroupSelection"]')?.focus({ preventScroll: true });
};
A.whiteboardArrange = el => {
  if (!['left', 'right', 'top', 'bottom', 'center-x', 'center-y', 'distribute-x', 'distribute-y'].includes(el.dataset.mode)) return;
  if (command(next => Object.assign(next, arrangeWhiteboardSelection(next, selectedIds(), el.dataset.mode)))) render();
};
A.whiteboardToggleFocus = () => {
  const s = whiteboardState();
  if (s.presentationId) return A.whiteboardPresentEnd();
  s.focus = !s.focus;
  syncDiagramWindow();
  render();
  const selected = selectedIds();
  if (s.focus && !s.outline && s.zoom < 0.65 && selected.length === 1)
    requestAnimationFrame(() => {
      if (whiteboardState() === s && s.focus && !s.outline && s.selected === selected[0]) focusWhiteboardCard(selected[0]);
    });
  document.querySelector('[data-a="whiteboardToggleFocus"]')?.focus({ preventScroll: true });
};
function focusWhiteboardCard(id) {
  const node = visibleBoard().nodes.find(node => node.id === id);
  const camera = whiteboardNodeCamera(node, document.querySelector('.whiteboard-viewport')?.getBoundingClientRect());
  if (!camera) return;
  Object.assign(whiteboardState(), camera, { fit: false, autoFit: false });
  paintView();
  return true;
}
A.whiteboardFocusCard = el => focusWhiteboardCard(el.dataset.id);
A.whiteboardFocusSelection = () => {
  const state = whiteboardState();
  const fit = () => {
    const ids = selectedIds();
    if (state !== whiteboardState() || ids.length < 2 || state.outline) return;
    const nodes = whiteboardSelectionNodes(visibleBoard(), ids);
    const box = document.querySelector('.whiteboard-viewport')?.getBoundingClientRect();
    const camera = whiteboardNodeCamera(whiteboardBounds({ nodes }), box);
    if (!camera) return;
    Object.assign(state, camera, { fit: false, autoFit: false });
    paintView();
  };
  if (!state.outline) return fit();
  Object.assign(state, { outline: false, fit: false, autoFit: false });
  render();
  requestAnimationFrame(fit);
};
export function revealWhiteboardPdfPages(cards) {
  const state = whiteboardState();
  const first = cards[0];
  const intent = (state.locateIntent = uid('locate'));
  Object.assign(state, { selected: first.id, selection: [first.id], selectedEdge: '', multiSelect: false });
  render();
  requestAnimationFrame(() => {
    if (state !== whiteboardState() || state.locateIntent !== intent || state.selected !== first.id) return;
    if (state.outline) {
      const card = document.querySelector(`.whiteboard-outline [data-board-id="${CSS.escape(first.id)}"]`);
      card?.scrollIntoView({ block: 'nearest' });
      card?.querySelector('[data-board-drag]')?.focus({ preventScroll: true });
      return;
    }
    const viewport = document.querySelector('.whiteboard-viewport');
    if (!viewport) return;
    const box = viewport.getBoundingClientRect();
    const area = box.width >= 640 ? whiteboardBounds({ nodes: cards }) : first;
    const camera = whiteboardNodeCamera(area, box);
    if (camera) Object.assign(state, camera, { fit: false, autoFit: false });
    paintView();
    viewport.focus({ preventScroll: true });
  });
}
A.whiteboardToggleOutline = () => {
  whiteboardState().outline = !whiteboardState().outline;
  render();
};
A.whiteboardTogglePan = () => {
  const state = whiteboardState();
  const mode = whiteboardNavigationMode(state);
  setWhiteboardNavigation(state, state.focus ? (mode === 'pan' ? 'move' : 'pan') : mode === 'scroll' ? 'move' : 'scroll');
  render();
};
function setWhiteboardNavigation(state, mode) {
  if (state.focus) state.focusNavigationMode = mode;
  else state.navigationMode = mode;
}
IN.whiteboardNavigation = el => {
  const state = whiteboardState();
  if (!['scroll', 'pan', 'move'].includes(el.value) || (state.focus && el.value === 'scroll')) return;
  setWhiteboardNavigation(state, el.value);
  render();
  document.querySelector('[data-in="whiteboardNavigation"] + .select-btn')?.focus({ preventScroll: true });
  const live = document.getElementById('sr-live');
  if (live) live.textContent = whiteboardNavigationHint(el.value, editable(current()));
};
IN.whiteboardOutlineQuery = el => {
  whiteboardState().outlineQuery = el.value;
  render();
};
A.whiteboardLocate = el => {
  const node = visibleBoard().nodes.find(n => n.id === el.dataset.id);
  if (!node) return;
  const s = whiteboardState();
  const intent = uid('locate');
  s.locateIntent = intent;
  const ids = el.dataset.keepSelection === 'true' ? [...new Set([...selectedIds(), node.id])] : [node.id];
  selectNodes(s, ids, node.id);
  Object.assign(s, { outline: false, fit: false, autoFit: false });
  render();
  requestAnimationFrame(() => {
    if (s !== whiteboardState() || s.locateIntent !== intent || s.selected !== node.id || s.outline || !focusWhiteboardCard(node.id)) return;
    document.querySelector(`[data-board-drag="${CSS.escape(node.id)}"]`)?.focus({ preventScroll: true });
  });
};
A.whiteboardOutlineGroups = el => {
  const s = whiteboardState();
  s.collapsedGroups = Object.fromEntries(
    whiteboardOf(current())
      .nodes.filter(n => n.type === 'group')
      .map(n => [n.id, el.dataset.collapse === 'true']),
  );
  writeLayoutPreference('whiteboard-outline:' + s.id, s.collapsedGroups);
  render();
};
document.addEventListener(
  'toggle',
  event => {
    if (event.target.matches?.('details[data-board-group]') && event.target.isConnected && current() && !whiteboardState().outlineQuery) {
      const s = whiteboardState();
      (s.collapsedGroups ||= {})[event.target.dataset.boardGroup] = !event.target.open;
      writeLayoutPreference('whiteboard-outline:' + s.id, s.collapsedGroups);
    }
  },
  true,
);
A.whiteboardNewEdge = () => {
  const board = visibleBoard();
  if (!editable(current())) return;
  if (board.nodes.length < 2) return toast(T('Add two cards first.', 'Сначала добавьте две карточки.'), { kind: 'info' });
  const active = whiteboardState().selected;
  const from = board.nodes.some(node => node.id === active) ? active : board.nodes[0].id;
  openTool({
    kind: 'edge',
    from,
    to: selectedIds().find(id => id !== from) || board.nodes.find(n => n.id !== from).id,
    label: '',
    arrow: true,
    fromEnd: 'none',
    toEnd: 'arrow',
    style: 'solid',
    color: 'neutral',
  });
};
const pendingConnection = state =>
  state.reconnect ? { from: state.reconnect.from, reconnect: state.reconnect } : state.connectFrom ? { from: state.connectFrom } : null;
const selectConnection = (state, id) => Object.assign(state, { selectedEdge: id, selected: '', selection: [] });

function beginConnection(intent, candidates) {
  const p = current();
  if (!editable(p)) return;
  const board = visibleBoard();
  if (!board.nodes.some(node => node.id === intent.from)) return;
  if (board.nodes.length < 2) return toast(T('Add two cards first.', 'Сначала добавьте две карточки.'), { kind: 'info' });
  const state = whiteboardState();
  Object.assign(state, { reconnect: intent.reconnect || null, connectFrom: intent.reconnect ? '' : intent.from });
  if (candidates?.length > 1) openCardChooser(candidates, intent);
  else {
    render();
    document.querySelector('[data-a="whiteboardFindConnectionTarget"]')?.focus({ preventScroll: true });
  }
}

function completeConnection(intent, target) {
  if (intent.reconnect) finishReconnect(intent.reconnect, target);
  else finishConnection(intent.from, target);
}

function finishConnection(from, to) {
  if (!editable(current()) || !to || to === from) return;
  const nodes = visibleBoard().nodes;
  if (![from, to].every(id => nodes.some(node => node.id === id))) return;
  let result;
  const accepted = command(board => {
    result = whiteboardConnection(board, from, to, uid('we'));
    if (result?.created) board.edges.push(result.edge);
  });
  if (!accepted) return;
  if (!result) return toast(T('The cards changed or the connection limit was reached.', 'Карточки изменились или достигнут лимит связей.'), { kind: 'info' });
  const state = whiteboardState();
  state.connectFrom = '';
  selectConnection(state, result.edge.id);
  render();
}
A.whiteboardConnectStart = el => {
  if (Date.now() >= (whiteboardState().connectSuppressUntil || 0)) beginConnection({ from: el.dataset.id });
};
A.whiteboardFindConnectionTarget = () => {
  const intent = pendingConnection(whiteboardState());
  if (intent && editable(current())) openCardChooser(undefined, intent);
};
A.whiteboardCancelConnect = () => {
  whiteboardState().connectFrom = '';
  whiteboardState().reconnect = null;
  render();
};
function reconnectIntent(el) {
  const edge = visibleBoard().edges.find(edge => edge.id === el.dataset.id),
    side = el.dataset.boardReconnect;
  return edge && ['from', 'to'].includes(side) ? { id: edge.id, side, base: edge[side], from: edge[side === 'from' ? 'to' : 'from'] } : null;
}
A.whiteboardReconnectStart = el => {
  if (Date.now() < (whiteboardState().connectSuppressUntil || 0)) return;
  const intent = reconnectIntent(el);
  if (intent) beginConnection({ from: intent.from, reconnect: intent });
};
function finishReconnect(intent, target) {
  if (!editable(current()) || !target || target === intent.from) return;
  const shown = visibleBoard();
  if (!shown.edges.some(edge => edge.id === intent.id) || !shown.nodes.some(node => node.id === target)) return;
  let result;
  const accepted = command(board => {
    result = reconnectWhiteboardEdge(board, { ...intent, target });
  });
  if (!accepted) return;
  const state = whiteboardState();
  if (result?.error !== 'duplicate') state.reconnect = null;
  if (result?.error)
    toast(
      T(
        'Connection unchanged: choose another card, or reopen the updated connection.',
        'Связь не изменена: выберите другую карточку или откройте обновлённую связь.',
      ),
      { kind: 'info' },
    );
  else selectConnection(state, intent.id);
  render();
}
A.whiteboardEditEdge = el => {
  const edge = visibleBoard().edges.find(e => e.id === el.dataset.id);
  if (edge)
    openTool({
      kind: 'edge',
      ...edge,
      fromEnd: whiteboardEdgeEnd(edge, 'from'),
      toEnd: whiteboardEdgeEnd(edge, 'to'),
      style: edge.style || 'solid',
      base: structuredClone(edge),
    });
};
A.whiteboardSelectEdge = el => {
  if (!visibleBoard().edges.some(edge => edge.id === el.dataset.id)) return;
  const state = whiteboardState();
  if (pendingConnection(state)) return;
  selectConnection(state, el.dataset.id);
  render();
};
function contextEdit(el, value, base) {
  const s = whiteboardState(),
    { kind, id, field, scope } = el.dataset;
  if (scope !== s.scope || (kind === 'edge' ? s.selectedEdge !== id : s.selected !== id)) return false;
  let result;
  const accepted = command(board => {
    result = patchWhiteboardContext(board, { kind, id, field, base, value });
  });
  if (result?.error) {
    toast(T('The selection changed. Review the current value and try again.', 'Выделение изменилось. Проверьте текущее значение и повторите.'), {
      kind: 'info',
    });
    return false;
  }
  return accepted;
}
IN.whiteboardContextText = el => {
  const s = whiteboardState();
  if (el.dataset.scope !== s.scope) return;
  const key = el.dataset.kind + ':' + el.dataset.id;
  s.contextDrafts[key] = { value: el.value, base: s.contextDrafts[key]?.base ?? JSON.parse(el.dataset.base) };
  el.closest('form')
    .querySelectorAll('button')
    .forEach(button => {
      button.hidden = false;
    });
};
A.whiteboardContextApply = form => {
  const s = whiteboardState(),
    key = form.dataset.kind + ':' + form.dataset.id,
    draft = s.contextDrafts[key];
  if (!draft || form.dataset.scope !== s.scope) return;
  const input = form.querySelector('input');
  delete s.contextDrafts[key];
  if (!contextEdit(input, draft.value.trim(), draft.base)) s.contextDrafts[key] = draft;
  render();
};
A.whiteboardContextCancel = el => {
  const form = el.closest('form'),
    s = whiteboardState();
  if (form?.dataset.scope !== s.scope) return;
  delete s.contextDrafts[form.dataset.kind + ':' + form.dataset.id];
  render();
};
IN.whiteboardContextField = el => contextEdit(el, el.value, JSON.parse(el.dataset.base));
A.whiteboardContextArrow = el => {
  const base = JSON.parse(el.dataset.base);
  contextEdit(el, !base, base);
};
function removeNode(id) {
  if (command(board => removeWhiteboardNode(board, id))) {
    whiteboardState().selected = '';
    render();
  }
}
A.whiteboardDelete = () => {
  const ids = selectedIds();
  if (ids.length <= 1) return removeNode(whiteboardState().selected);
  if (command(board => ids.forEach(id => removeWhiteboardNode(board, id)))) A.whiteboardDeselect();
};
A.whiteboardRemoveInModal = () => {
  const m = activeModal();
  if (!m || !editable(current())) return;
  if (
    command(board => {
      if (m.kind === 'edge') board.edges = board.edges.filter(e => e.id !== m.id);
      else removeWhiteboardNode(board, m.id);
    })
  ) {
    whiteboardState().selected = '';
    closeModal();
  }
};
A.whiteboardDuplicate = () => {
  const node = whiteboardOf(current()).nodes.find(n => n.id === whiteboardState().selected);
  if (!node) return;
  const copy = { ...structuredClone(node), id: uid('wc'), x: Math.min(50000, node.x + 30), y: Math.min(50000, node.y + 30) };
  delete copy.locked;
  if (command(board => board.nodes.push(copy))) {
    revealNode(copy);
    render();
  }
};
function history(back) {
  const p = current(),
    s = whiteboardState(),
    from = back ? s.undo : s.redo,
    to = back ? s.redo : s.undo,
    entry = from.at(-1);
  if (!editable(p) || !entry) return;
  if (!same(whiteboardOf(p), back ? entry.after : entry.before)) {
    s.undo = [];
    s.redo = [];
    toast(T('The board changed in another session. Undo history was reset.', 'Холст изменён в другой сессии. История отмены сброшена.'), { kind: 'info' });
    render();
    return;
  }
  from.pop();
  to.push(entry);
  const restored = structuredClone(back ? entry.before : entry.after);
  s.selection = selectedIds().filter(id => restored.nodes.some(node => node.id === id));
  s.selected = s.selection.includes(s.selected) ? s.selected : s.selection[0] || '';
  s.selectedEdge = restored.edges.some(edge => edge.id === s.selectedEdge) ? s.selectedEdge : '';
  mutate(() => {
    p.whiteboard = restored;
  });
}
A.whiteboardUndo = () => history(true);
A.whiteboardRedo = () => history(false);
A.whiteboardExport = () => {
  const p = current();
  if (!p) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ format: 'smena-project-whiteboard', version: 1, project: p.id, board: whiteboardOf(p) }, null, 2)], {
      type: 'application/json',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'whiteboard.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
A.whiteboardToggleMinimap = () => {
  const state = whiteboardState();
  state.minimap = !state.minimap;
  writeLayoutPreference('whiteboard-minimap', state.minimap);
  render();
};
A.whiteboardMinimap = (el, event) => {
  if (!event?.detail) return A.whiteboardFit();
  const b = JSON.parse(el.dataset.box),
    rect = el.getBoundingClientRect(),
    viewport = document.querySelector('.whiteboard-viewport')?.getBoundingClientRect();
  if (!viewport) return;
  const s = whiteboardState();
  s.x = viewport.width / 2 - (b.x + ((event.clientX - rect.left) / rect.width) * b.width) * s.zoom;
  s.y = viewport.height / 2 - (b.y + ((event.clientY - rect.top) / rect.height) * b.height) * s.zoom;
  s.fit = s.autoFit = false;
  paintView();
};
document.addEventListener('keydown', event => {
  if (!event.target.matches?.('.whiteboard-minimap') || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const s = whiteboardState();
  s.x += event.key === 'ArrowLeft' ? 80 : event.key === 'ArrowRight' ? -80 : 0;
  s.y += event.key === 'ArrowUp' ? 80 : event.key === 'ArrowDown' ? -80 : 0;
  s.fit = s.autoFit = false;
  paintView();
});
function paintView() {
  const s = whiteboardState(),
    world = document.querySelector('.whiteboard-world');
  refreshWhiteboardMinimap(s);
  if (world) {
    world.style.transform = `translate(${s.x}px,${s.y}px) scale(${s.zoom})`;
    world.style.setProperty('--whiteboard-zoom', String(s.zoom));
    world.closest('.whiteboard-viewport').dataset.overview = String(s.zoom < 0.65);
    refreshWhiteboardOverview(s);
  }
  const scale = document.querySelector('.whiteboard-scale');
  if (scale) scale.textContent = Math.round(s.zoom * 100) + '%';
  window.dispatchEvent(new Event('smena:diagram-layout-changed'));
}
function zoomTo(next, cx, cy) {
  const s = whiteboardState(),
    box = document.querySelector('.whiteboard-viewport')?.getBoundingClientRect();
  if (!box) return;
  const x = cx ?? box.width / 2,
    y = cy ?? box.height / 2,
    z = Math.max(0.2, Math.min(2.5, next));
  s.x = x - ((x - s.x) * z) / s.zoom;
  s.y = y - ((y - s.y) * z) / s.zoom;
  s.zoom = z;
  s.fit = false;
  s.autoFit = false;
  paintView();
}
A.whiteboardZoomIn = () => zoomTo(whiteboardState().zoom * 1.25);
A.whiteboardZoomOut = () => zoomTo(whiteboardState().zoom / 1.25);
A.whiteboardResetZoom = () => zoomTo(1);
A.whiteboardToggleAspect = () => {
  const s = whiteboardState();
  writeLayoutPreference('whiteboard-resize-aspect', (s.resizeAspect = !s.resizeAspect));
  render();
};
A.whiteboardToggleGuides = () => {
  const s = whiteboardState();
  writeLayoutPreference('whiteboard-resize-guides', (s.resizeGuides = !s.resizeGuides));
  render();
};
A.whiteboardResizeFocus = () => {
  const board = whiteboardOf(current());
  const node = board.nodes.find(n => n.id === whiteboardState().selected);
  const box = document.querySelector('.whiteboard-viewport')?.getBoundingClientRect();
  if (!node || !box || whiteboardLockedIds(board).has(node.id)) return;
  const s = whiteboardState();
  s.zoom = 1;
  s.x = box.width / 2 - node.x - node.width;
  s.y = box.height / 2 - node.y - node.height;
  s.fit = s.autoFit = false;
  paintView();
  document.querySelector(`[data-board-id="${CSS.escape(node.id)}"] [data-board-resize="se"]`)?.focus({ preventScroll: true });
};
A.whiteboardGroupResize = () => {
  const s = whiteboardState();
  s.resizeSelection = !s.resizeSelection;
  render();
};
A.whiteboardGroupContents = () => {
  const s = whiteboardState();
  s.resizeContents = !s.resizeContents;
  render();
};
A.whiteboardFit = () => {
  const box = document.querySelector('.whiteboard-viewport')?.getBoundingClientRect();
  if (!box) return;
  const board = visibleBoard(),
    b = whiteboardBounds(board),
    header = board.nodes.some(n => n.type === 'group') ? (innerWidth <= 900 ? 56 : 40) : 0,
    s = whiteboardState();
  s.zoom = Math.max(0.2, Math.min(1, (box.width - 64) / b.width, (box.height - 64 - header) / b.height));
  s.x = (box.width - b.width * s.zoom) / 2 - b.x * s.zoom;
  s.y = header + (box.height - header - b.height * s.zoom) / 2 - b.y * s.zoom;
  s.fit = false;
  s.autoFit = true;
  paintView();
};
let viewport, gesture, cameraObserver, cameraFrame;
let spacePan = false;
function stopSpacePan() {
  spacePan = false;
  viewport?.removeAttribute('data-space-pan');
}
A.whiteboardOpenSelectedMaterial = () => openWhiteboardCard(whiteboardState().selected);
function openWhiteboardCard(id) {
  const node = visibleBoard().nodes.find(node => node.id === id);
  if (!node) return;
  if (node.type === 'material') {
    const source = whiteboardMaterial(node);
    if (source?.kind === 'bookmark' || (source?.kind === 'file' && filePreviewPolicy(source.item).kind)) A.whiteboardReadCard({ dataset: { id } });
    else A.openRelatedEntity({ dataset: { key: node.target } });
  } else if (editable(current())) A.whiteboardEdit({ dataset: { id } });
}
document.addEventListener('keyup', event => {
  if (event.code === 'Space') stopSpacePan();
});
window.addEventListener('blur', stopSpacePan);
let cameraSize, cameraOwner;
const pointers = new Map(),
  mounted = new WeakSet(),
  hydrations = new Set();
const canvasControl = 'button:not([data-board-drag]),a,input,textarea,select,label,[contenteditable],[data-board-edge]';
function clearMarquee() {
  const box = viewport?.querySelector('.whiteboard-marquee');
  if (box) box.hidden = true;
  viewport?.querySelectorAll('[data-marquee-selected]').forEach(card => card.removeAttribute('data-marquee-selected'));
}
function marqueeAt(g, e, state) {
  const bounds = viewport.getBoundingClientRect();
  const x = value => Math.max(0, Math.min(bounds.width, value - bounds.left));
  const y = value => Math.max(0, Math.min(bounds.height, value - bounds.top));
  const left = x(Math.min(g.x, e.clientX)),
    right = x(Math.max(g.x, e.clientX));
  const top = y(Math.min(g.y, e.clientY)),
    bottom = y(Math.max(g.y, e.clientY));
  const ids = whiteboardSelectionInRect(visibleBoard().nodes, {
    left: (left - state.x) / state.zoom,
    right: (right - state.x) / state.zoom,
    top: (top - state.y) / state.zoom,
    bottom: (bottom - state.y) / state.zoom,
  });
  return { left, top, width: right - left, height: bottom - top, ids };
}
function paintWhiteboardGeometry(board) {
  const shown = whiteboardVisibleBoard(board);
  const svg = viewport?.querySelector('.whiteboard-edges');
  if (svg) svg.outerHTML = whiteboardEdges(shown);
  const groups = viewport?.querySelector('.whiteboard-saved-groups');
  if (groups) groups.innerHTML = savedWhiteboardGroups(shown);
}
function resetPreview() {
  clearMarquee();
  const group = viewport?.querySelector('[data-group-resize-box]');
  if (group) group.style.removeProperty('translate');
  viewport?.querySelector('.whiteboard-guides')?.replaceChildren();
  viewport?.querySelectorAll('[data-connect-target]').forEach(el => el.removeAttribute('data-connect-target'));
  for (const n of whiteboardOf(current()).nodes) {
    const el = document.querySelector(`[data-board-id="${CSS.escape(n.id)}"]`);
    if (el) {
      el.style.left = n.x + 'px';
      el.style.top = n.y + 'px';
      el.style.width = n.width + 'px';
      el.style.height = n.height + 'px';
      el.removeAttribute('data-resizing');
    }
  }
  paintWhiteboardGeometry(whiteboardOf(current()));
}
function down(e) {
  if (e.button !== 0) return;
  const s = whiteboardState();
  if (!pointers.size) s.panClickUntil = 0;
  const endpoint = e.target.closest('[data-board-reconnect]');
  const resize = e.target.closest('[data-board-resize]');
  const connector = e.target.closest('[data-board-connect]');
  const moveGroup = e.target.closest('[data-board-move-group]');
  const control = e.target.closest(canvasControl);
  const mode = whiteboardNavigationMode(s);
  if (!spacePan && !resize && !connector && !endpoint && !moveGroup && (control || mode === 'scroll')) return;
  if (pointers.size >= 2 || (pointers.size && !['pan', 'move', 'marquee'].includes(gesture?.kind))) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    if (gesture?.kind === 'move') resetPreview();
    if (gesture?.kind === 'marquee') clearMarquee();
    const [a, b] = [...pointers.values()];
    const box = viewport.getBoundingClientRect();
    gesture = {
      kind: 'pinch',
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      zoom: s.zoom,
      anchorX: ((a.x + b.x) / 2 - box.left - s.x) / s.zoom,
      anchorY: ((a.y + b.y) / 2 - box.top - s.y) / s.zoom,
    };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (spacePan) {
    gesture = { kind: 'pan', x: e.clientX, y: e.clientY, panX: s.x, panY: s.y };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (endpoint && editable(current())) {
    const intent = reconnectIntent(endpoint);
    if (!intent) {
      pointers.delete(e.pointerId);
      return;
    }
    gesture = { ...intent, kind: 'reconnect', scope: s.scope, x: e.clientX, y: e.clientY, moved: false };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (connector && editable(current())) {
    gesture = { kind: 'connect', from: connector.dataset.boardConnect, scope: s.scope, x: e.clientX, y: e.clientY, moved: false };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (resize && editable(current())) {
    const board = whiteboardOf(current());
    const locked = whiteboardLockedIds(board);
    if (resize.dataset.boardGroupResize) {
      const ids = selectedIds(),
        nodes = groupResizeNodes(board, ids, !!s.resizeContents);
      if (nodes.some(node => locked.has(node.id))) {
        pointers.delete(e.pointerId);
        return;
      }
      gesture = {
        kind: 'groupResize',
        board: structuredClone(board),
        ids,
        nodes: structuredClone(nodes),
        contents: !!s.resizeContents,
        direction: resize.dataset.boardResize,
        x: e.clientX,
        y: e.clientY,
        zoom: s.zoom,
        scope: s.scope,
      };
      viewport.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    const node = board.nodes.find(n => n.id === resize.closest('[data-board-id]')?.dataset.boardId);
    if (!node || locked.has(node.id)) {
      pointers.delete(e.pointerId);
      return;
    }
    gesture = { kind: 'resize', node: structuredClone(node), direction: resize.dataset.boardResize, x: e.clientX, y: e.clientY, zoom: s.zoom, scope: s.scope };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  const handle = e.target.closest('[data-board-drag]');
  const card = e.target.closest('[data-board-id]');
  const blank = !card || (card.dataset.kind === 'group' && !handle);
  if (handle && (e.shiftKey || e.ctrlKey || e.metaKey)) {
    pointers.delete(e.pointerId);
    return;
  }
  const selected = selectedIds();
  const canMoveTitle = handle && mode === 'move' && s.zoom >= 0.65 && (!s.multiSelect || selected.includes(handle.dataset.boardDrag));
  if ((moveGroup || canMoveTitle) && !pendingConnection(s) && editable(current())) {
    const nodeId = moveGroup ? (selected.includes(s.selected) ? s.selected : selected[0]) : handle.dataset.boardDrag;
    const board = whiteboardOf(current());
    const selection = selected.includes(nodeId) ? selected : expandWhiteboardSelection(board, [nodeId]);
    const nodes = movableWhiteboardNodes(board, selection);
    if (!nodes.length) {
      pointers.delete(e.pointerId);
      return;
    }
    gesture = {
      kind: 'move',
      nodeId,
      groupHandle: !!moveGroup,
      selection,
      nodes: structuredClone(nodes),
      x: e.clientX,
      y: e.clientY,
      scope: s.scope,
      dx: 0,
      dy: 0,
    };
    viewport.setPointerCapture(e.pointerId);
  } else if ((e.shiftKey || s.multiSelect) && blank && !pendingConnection(s)) {
    gesture = { kind: 'marquee', x: e.clientX, y: e.clientY, scope: s.scope, selection: selected };
    viewport.setPointerCapture(e.pointerId);
  } else {
    gesture = { kind: 'pan', x: e.clientX, y: e.clientY, panX: s.x, panY: s.y };
    // Keep the original hit target for taps while tracking drags past the viewport edge.
    e.target.setPointerCapture(e.pointerId);
  }
  e.preventDefault();
}
function move(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const s = whiteboardState(),
    g = gesture;
  if (!g) return;
  if (g.kind === 'marquee') {
    if (s.scope !== g.scope || (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5)) return;
    g.moved = true;
    const { ids, ...rect } = marqueeAt(g, e, s);
    const box = viewport.querySelector('.whiteboard-marquee');
    box.hidden = false;
    for (const [key, value] of Object.entries(rect)) box.style[key] = `${value}px`;
    const hits = new Set(ids);
    for (const card of viewport.querySelectorAll('[data-board-id]')) card.toggleAttribute('data-marquee-selected', hits.has(card.dataset.boardId));
    return;
  }
  if (g.kind === 'connect' || g.kind === 'reconnect') {
    if (g.scope !== s.scope) return;
    g.moved ||= Math.hypot(e.clientX - g.x, e.clientY - g.y) > 5;
    const box = viewport.getBoundingClientRect(),
      board = visibleBoard();
    const ids = whiteboardPickCandidates(
      board.nodes.filter(n => n.id !== g.from),
      { x: e.clientX - box.left, y: e.clientY - box.top },
      s,
    );
    g.to = ids.length === 1 ? ids[0] : '';
    viewport.querySelectorAll('[data-connect-target]').forEach(el => el.removeAttribute('data-connect-target'));
    if (g.to) viewport.querySelector(`[data-board-id="${CSS.escape(g.to)}"]`)?.setAttribute('data-connect-target', 'true');
    const source = board.nodes.find(n => n.id === g.from),
      svg = viewport.querySelector('.whiteboard-edges');
    if (source && svg) {
      let path = svg.querySelector('.whiteboard-connect-preview');
      if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'whiteboard-connect-preview');
        svg.append(path);
      }
      const x = source.x + source.width,
        y = source.y + source.height / 2;
      path.setAttribute('d', `M${x},${y} L${(e.clientX - box.left - s.x) / s.zoom},${(e.clientY - box.top - s.y) / s.zoom}`);
    }
    return;
  }
  if (g.kind === 'groupResize') {
    if (g.scope !== s.scope) return;
    g.next = resizeWhiteboardGroup(
      g.board,
      g.ids,
      g.direction,
      Math.round((e.clientX - g.x) / g.zoom / 10) * 10,
      Math.round((e.clientY - g.y) / g.zoom / 10) * 10,
      { contents: g.contents, lockAspect: s.resizeAspect },
    );
    for (const node of groupResizeNodes(g.next, g.ids, g.contents)) {
      const el = viewport.querySelector(`[data-board-id="${CSS.escape(node.id)}"]`);
      if (el) for (const key of ['x', 'y', 'width', 'height']) el.style[{ x: 'left', y: 'top' }[key] || key] = node[key] + 'px';
    }
    const box = viewport.querySelector('[data-group-resize-box]'),
      bounds = whiteboardBounds({ nodes: groupResizeNodes(g.next, g.ids, g.contents) });
    if (box) for (const key of ['x', 'y', 'width', 'height']) box.style[{ x: 'left', y: 'top' }[key] || key] = bounds[key] + 'px';
    paintWhiteboardGeometry(g.next);
    return;
  }
  if (g.kind === 'resize') {
    if (g.scope !== s.scope) return;
    let dx = Math.round((e.clientX - g.x) / g.zoom / 10) * 10,
      dy = Math.round((e.clientY - g.y) / g.zoom / 10) * 10;
    const lockAspect = s.resizeAspect && g.direction.length === 2;
    const snapped =
      s.resizeGuides && !lockAspect ? snapWhiteboardResize(g.node, g.direction, dx, dy, visibleBoard().nodes, 6 / g.zoom) : { dx, dy, guides: [] };
    g.next = resizedWhiteboardNode(g.node, g.direction, snapped.dx, snapped.dy, snapped.guides.length ? 1 : 10, { lockAspect });
    const guideLayer = viewport.querySelector('.whiteboard-guides');
    if (guideLayer)
      guideLayer.innerHTML = snapped.guides
        .filter(
          guide =>
            Math.abs(
              guide.value -
                (guide.axis === 'x' ? g.next.x + (g.direction.includes('e') ? g.next.width : 0) : g.next.y + (g.direction.includes('s') ? g.next.height : 0)),
            ) < 1,
        )
        .map(guide =>
          guide.axis === 'x'
            ? `<i class="whiteboard-guide vertical" style="left:${guide.value}px;top:${-s.y / s.zoom}px;height:${viewport.clientHeight / s.zoom}px"></i>`
            : `<i class="whiteboard-guide horizontal" style="top:${guide.value}px;left:${-s.x / s.zoom}px;width:${viewport.clientWidth / s.zoom}px"></i>`,
        )
        .join('');
    const el = viewport.querySelector(`[data-board-id="${CSS.escape(g.node.id)}"]`);
    if (el) {
      for (const key of ['x', 'y', 'width', 'height']) el.style[{ x: 'left', y: 'top' }[key] || key] = g.next[key] + 'px';
      el.dataset.resizing = 'true';
      el.querySelector('.whiteboard-resize-size').textContent = `${g.next.width} × ${g.next.height}`;
    }
    if (!g.frame)
      g.frame = requestAnimationFrame(() => {
        g.frame = null;
        if (gesture !== g) return;
        const board = whiteboardOf(current());
        paintWhiteboardGeometry({ ...board, nodes: board.nodes.map(n => (n.id === g.node.id ? g.next : n)) });
      });
    return;
  }
  if (g.kind === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()],
      box = viewport.getBoundingClientRect();
    s.zoom = Math.max(0.2, Math.min(2.5, (g.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, g.distance)));
    s.x = (a.x + b.x) / 2 - box.left - g.anchorX * s.zoom;
    s.y = (a.y + b.y) / 2 - box.top - g.anchorY * s.zoom;
    s.fit = s.autoFit = false;
    paintView();
    return;
  }
  if (g.kind === 'pan') {
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) <= 5) return;
    g.moved = true;
    s.x = g.panX + e.clientX - g.x;
    s.y = g.panY + e.clientY - g.y;
    s.fit = false;
    s.autoFit = false;
    paintView();
    return;
  }
  if (g.kind === 'move') {
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return;
    g.moved = true;
    Object.assign(g, whiteboardSelectionOffset(g.nodes, Math.round((e.clientX - g.x) / s.zoom / 10) * 10, Math.round((e.clientY - g.y) / s.zoom / 10) * 10));
    const group = g.selection.length > 1 && viewport.querySelector('[data-group-resize-box]');
    if (group) group.style.translate = `${g.dx}px ${g.dy}px`;
    for (const n of g.nodes) {
      const el = viewport.querySelector(`[data-board-id="${CSS.escape(n.id)}"]`);
      if (el) {
        el.style.left = n.x + g.dx + 'px';
        el.style.top = n.y + g.dy + 'px';
      }
    }
    if (!g.frame)
      g.frame = requestAnimationFrame(() => {
        g.frame = null;
        if (gesture !== g) return;
        const board = whiteboardOf(current()),
          ids = new Set(g.nodes.map(n => n.id));
        paintWhiteboardGeometry({ ...board, nodes: board.nodes.map(n => (ids.has(n.id) ? { ...n, x: n.x + g.dx, y: n.y + g.dy } : n)) });
      });
  }
}
function up(e, cancel = false) {
  if (e.pointerId != null && !pointers.delete(e.pointerId)) return;
  viewport?.querySelector('.whiteboard-guides')?.replaceChildren();
  const g = gesture;
  gesture = null;
  if (!g) return;
  if (g.kind === 'marquee') {
    clearMarquee();
    const state = whiteboardState();
    if (!cancel && g.moved && g.scope === state.scope) {
      state.panClickUntil = Date.now() + 300;
      const { ids } = marqueeAt(g, e, state);
      selectNodes(state, [...new Set([...g.selection, ...ids])]);
      render();
    }
    return;
  }
  if (g.kind === 'connect' || g.kind === 'reconnect') {
    resetPreview();
    const state = whiteboardState();
    if (cancel || g.scope !== state.scope) return;
    state.connectSuppressUntil = Date.now() + 350;
    state.panClickUntil = state.connectSuppressUntil;
    const intent = g.kind === 'reconnect' ? { from: g.from, reconnect: { id: g.id, side: g.side, base: g.base, from: g.from } } : { from: g.from };
    let ids;
    if (g.moved) {
      const box = viewport.getBoundingClientRect();
      ids = whiteboardPickCandidates(
        visibleBoard().nodes.filter(n => n.id !== g.from),
        { x: e.clientX - box.left, y: e.clientY - box.top },
        state,
      );
    }
    if (ids?.length === 1) completeConnection(intent, ids[0]);
    else beginConnection(intent, ids);
    return;
  }
  if ((g.kind === 'pan' && g.moved) || g.kind === 'pinch') whiteboardState().panClickUntil = Date.now() + 300;
  if (cancel) {
    resetPreview();
    if (g.kind === 'groupResize') render();
    return;
  }
  if (g.kind === 'groupResize') {
    const board = whiteboardOf(current());
    const locked = whiteboardLockedIds(board);
    if (
      g.scope !== whiteboardState().scope ||
      !g.next ||
      !same(
        g.nodes.map(n => n.id),
        groupResizeNodes(board, g.ids, g.contents).map(n => n.id),
      ) ||
      g.nodes.some(
        node =>
          locked.has(node.id) ||
          !same(
            node,
            board.nodes.find(n => n.id === node.id),
          ),
      )
    ) {
      resetPreview();
      render();
      return;
    }
    command(board => {
      const changes = new Map(groupResizeNodes(g.next, g.ids, g.contents).map(n => [n.id, n]));
      board.nodes = board.nodes.map(n => changes.get(n.id) || n);
    });
    render();
    return;
  }
  if (g.kind === 'resize') {
    if (g.scope !== whiteboardState().scope || !g.next || same(g.node, g.next)) {
      resetPreview();
      return;
    }
    const board = whiteboardOf(current());
    if (
      whiteboardLockedIds(board).has(g.node.id) ||
      !same(
        g.node,
        board.nodes.find(n => n.id === g.node.id),
      )
    ) {
      resetPreview();
      toast(T('The card changed during the gesture. Please resize it again.', 'Карточка изменилась во время жеста. Повторите изменение размера.'), {
        kind: 'info',
      });
      return;
    }
    if (
      !command(board => {
        const node = board.nodes.find(n => n.id === g.node.id);
        Object.assign(node, { x: g.next.x, y: g.next.y, width: g.next.width, height: g.next.height });
      })
    )
      resetPreview();
    return;
  }
  const s = whiteboardState();
  if (g.kind !== 'move' || g.scope !== s.scope) return;
  if (g.moved || g.groupHandle) s.panClickUntil = Date.now() + 300;
  if (g.dx || g.dy) {
    const board = whiteboardOf(current());
    if (
      !same(
        g.nodes.map(n => n.id),
        movableWhiteboardNodes(board, g.selection).map(n => n.id),
      ) ||
      g.nodes.some(
        n =>
          !same(
            n,
            board.nodes.find(i => i.id === n.id),
          ),
      )
    ) {
      resetPreview();
      toast(T('The card changed during the gesture. Please move it again.', 'Карточка изменилась во время жеста. Повторите перемещение.'), { kind: 'info' });
      return;
    }
    const moved = new Set(g.nodes.map(node => node.id));
    selectNodes(s, g.selection, g.nodeId);
    if (
      !command(next => {
        for (const n of next.nodes)
          if (moved.has(n.id)) {
            n.x += g.dx;
            n.y += g.dy;
          }
      })
    )
      resetPreview();
  } else {
    if (g.groupHandle || g.moved) return;
    if (s.multiSelect) return A.whiteboardSelect({ dataset: { id: g.nodeId } });
    selectNodes(s, g.selection, g.nodeId);
    // Selection is view state, including a captured pointer with zero movement.
    const last = s.lastTap;
    s.lastTap = { id: g.nodeId, at: Date.now(), x: e.clientX, y: e.clientY };
    if (last?.id === g.nodeId && Date.now() - last.at < 400 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 8) {
      s.lastTap = null;
      s.tapOpenUntil = Date.now() + 350;
      openWhiteboardCard(g.nodeId);
      return;
    }
    render();
  }
}
export function mountProjectWhiteboard() {
  mountWhiteboardAssetInputs();
  syncWhiteboardPreviews();
  mountWhiteboardLayerDrag(document.querySelector('[data-whiteboard-layers]'), dropWhiteboardLayer);
  const next = document.querySelector('.whiteboard-viewport');
  if (next !== viewport) {
    stopSpacePan();
    const owner = next && whiteboardState();
    const size = next ? { width: next.clientWidth, height: next.clientHeight } : null;
    const recenter = owner && owner === cameraOwner && cameraSize && !owner.autoFit && (size.width !== cameraSize.width || size.height !== cameraSize.height);
    if (recenter) {
      owner.x += (size.width - cameraSize.width) / 2;
      owner.y += (size.height - cameraSize.height) / 2;
    }
    gesture = null;
    pointers.clear();
    viewport = next;
    cameraObserver?.disconnect();
    cancelAnimationFrame(cameraFrame);
    cameraSize = size;
    cameraOwner = owner;
    if (recenter) paintView();
    if (next) {
      cameraObserver = new ResizeObserver(() => {
        cancelAnimationFrame(cameraFrame);
        cameraFrame = requestAnimationFrame(() => {
          if (next !== viewport || !next.isConnected || whiteboardState() !== owner) return;
          const size = { width: next.clientWidth, height: next.clientHeight };
          if (!size.width || !size.height) return;
          if (owner.autoFit) A.whiteboardFit();
          else if (cameraSize) {
            owner.x += (size.width - cameraSize.width) / 2;
            owner.y += (size.height - cameraSize.height) / 2;
            paintView();
          }
          cameraSize = size;
        });
      });
      cameraObserver.observe(next);
    }
  }
  if (next && !mounted.has(next)) {
    mounted.add(next);
    next.addEventListener(
      'click',
      event => {
        const s = whiteboardState();
        if (event.detail === 0 || event.target.closest(canvasControl)) return;
        if (Date.now() < (s.panClickUntil || 0)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (s.zoom >= 0.65 && event.target.closest('[data-board-drag]')) return;
        const hit = event.target.closest('[data-board-id]');
        const frameBackground = s.multiSelect && hit?.dataset.kind === 'group' && !event.target.closest('[data-board-drag]');
        const card = frameBackground ? '' : hit?.dataset.boardId;
        const box = next.getBoundingClientRect();
        const rawIds =
          s.zoom < 0.65 && !(s.multiSelect && card)
            ? whiteboardPickCandidates(visibleBoard().nodes, { x: event.clientX - box.left, y: event.clientY - box.top }, s)
            : card
              ? [card]
              : [];
        const connection = pendingConnection(s);
        const ids = rawIds.filter(id => id !== connection?.from && (!frameBackground || id !== hit.dataset.boardId));
        if (!ids.length && (connection || s.multiSelect || event.shiftKey || (!s.selected && !s.selectedEdge))) return;
        event.preventDefault();
        event.stopPropagation();
        if (ids.length === 1) A.whiteboardSelect({ dataset: { id: ids[0] } }, event);
        else if (ids.length) openCardChooser(ids);
        else A.whiteboardDeselect();
      },
      true,
    );
    next.addEventListener('pointerdown', down);
    next.addEventListener('dblclick', event => {
      if (
        overlayAboveDiagram() ||
        spacePan ||
        whiteboardState().multiSelect ||
        event.shiftKey ||
        pendingConnection(whiteboardState()) ||
        event.target.closest('.whiteboard-navigation,.whiteboard-minimap,[data-board-resize],[data-board-connect],[data-board-edge],[data-board-reconnect]')
      )
        return;
      if (event.target.closest('button,a,input,textarea,select') && !event.target.closest('[data-board-drag]')) return;
      const id = event.target.closest('[data-board-id]')?.dataset.boardId;
      const node = whiteboardOf(current()).nodes.find(node => node.id === id);
      if (node && (node.type !== 'group' || event.target.closest('[data-board-drag]'))) {
        event.preventDefault();
        openWhiteboardCard(id);
        return;
      }
      const point = whiteboardInsertionPoint({ x: event.clientX, y: event.clientY }, next.getBoundingClientRect(), whiteboardState());
      if (point && editable(current())) {
        event.preventDefault();
        newCard('text', point);
      }
    });
    next.addEventListener('pointermove', move);
    next.addEventListener('pointerup', e => up(e));
    next.addEventListener('pointercancel', e => up(e, true));
    next.addEventListener('lostpointercapture', e => up(e, true));
    next.addEventListener(
      'wheel',
      e => {
        if (e.target.closest('.whiteboard-navigation')) return;
        if (whiteboardNavigationMode(whiteboardState()) === 'scroll' && !e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const s = whiteboardState();
        if (e.ctrlKey || e.metaKey) {
          const b = next.getBoundingClientRect();
          zoomTo(s.zoom * Math.exp(-e.deltaY * 0.003), e.clientX - b.left, e.clientY - b.top);
        } else {
          s.x -= e.deltaX;
          s.y -= e.deltaY;
          s.fit = false;
          s.autoFit = false;
          paintView();
        }
      },
      { passive: false },
    );
  }
  if (next && whiteboardState().fit) A.whiteboardFit();
  if (next) refreshWhiteboardOverview(whiteboardState());
  const p = current();
  if (!p) return;
  const ids = whiteboardOf(p)
    .nodes.filter(n => n.type === 'material' && n.target.startsWith('file:'))
    .map(n => n.target.slice(5))
    .filter(id => !D().files.some(f => f.id === id));
  const key = whiteboardScope(p.id) + JSON.stringify(ids);
  if (!ids.length || hydrations.has(key)) return;
  hydrations.add(key);
  if (hydrations.size > 30) hydrations.delete(hydrations.values().next().value);
  void ensureFileIdentities(ids)
    .then(() => {
      if (current()?.id === p.id && key.startsWith(whiteboardScope(p.id))) render();
    })
    .catch(() => {});
}
A.whiteboardRetryMaterials = () => {
  hydrations.clear();
  mountProjectWhiteboard();
};
document.addEventListener(
  'keydown',
  e => {
    if (overlayAboveDiagram()) return;
    if (e.key === 'Escape' && e.target.closest('[data-whiteboard-layers]')) return;
    if (
      current() &&
      whiteboardState().presentationId &&
      !e.target.closest('input,textarea,select,[contenteditable]') &&
      ['Escape', 'ArrowLeft', 'ArrowRight'].includes(e.key)
    ) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') A.whiteboardPresentEnd();
      else A.whiteboardPresentStep({ dataset: { dir: e.key === 'ArrowLeft' ? '-1' : '1' } });
      return;
    }
    if (e.key === 'Escape' && current() && (whiteboardState().connectFrom || whiteboardState().reconnect) && !gesture) {
      e.preventDefault();
      e.stopPropagation();
      A.whiteboardCancelConnect();
      return;
    }
    if (e.key === 'Escape' && gesture) {
      e.preventDefault();
      e.stopPropagation();
      up(e, true);
      pointers.clear();
      return;
    }
    if (
      e.key === 'Escape' &&
      current() &&
      (whiteboardState().multiSelect || selectedIds().length > 1) &&
      !e.target.closest('input,textarea,select,[contenteditable]') &&
      (e.target.closest('.project-whiteboard') || whiteboardState().focus)
    ) {
      e.preventDefault();
      e.stopPropagation();
      whiteboardState().multiSelect = false;
      A.whiteboardDeselect();
      return;
    }
    if (current() && whiteboardState().focus && !S.ui.modals.length) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        A.whiteboardToggleFocus();
        return;
      }
    }
    if (e.target.closest('.whiteboard-minimap')) return;
    if (!e.target.closest('.project-whiteboard') || e.target.closest('input,textarea,select') || S.ui.modals.length) return;
    if (e.target.closest('[contenteditable="true"],.ui-menu[open]')) return;
    if (
      e.code === 'Space' &&
      e.target.closest('.whiteboard-viewport') &&
      !e.target.closest('.whiteboard-navigation,.whiteboard-minimap') &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      e.stopPropagation();
      spacePan = true;
      viewport?.setAttribute('data-space-pan', 'true');
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && e.target.closest('.whiteboard-viewport') && editable(current())) {
      const action = { KeyT: A.whiteboardNewText, KeyF: A.whiteboardNewFrame }[e.code] || (e.key === '@' ? A.whiteboardAddMaterial : null);
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        action();
        return;
      }
    }
    const s = whiteboardState();
    if ((e.ctrlKey || e.metaKey) && ['c', 'a'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key.toLowerCase() === 'c') void A.whiteboardCopy();
      else {
        selectNodes(
          s,
          visibleBoard().nodes.map(n => n.id),
        );
        s.multiSelect = true;
        render();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      history(!e.shiftKey);
      return;
    }
    if (e.key === 'Escape') {
      A.whiteboardDeselect();
      return;
    }
    if (!e.target.closest('[data-board-drag],.whiteboard-viewport') || !s.selected || !editable(current())) return;
    const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (offsets[e.key]) {
      e.preventDefault();
      e.stopPropagation();
      const [dx, dy] = offsets[e.key],
        step = e.shiftKey ? 50 : 10;
      const resize = e.target.closest('[data-board-resize]');
      if (resize) {
        if (resize.dataset.boardGroupResize) {
          const direction = resize.dataset.boardResize;
          command(board =>
            Object.assign(
              board,
              resizeWhiteboardGroup(board, selectedIds(), direction, dx * step, dy * step, { contents: !!s.resizeContents, lockAspect: s.resizeAspect }),
            ),
          );
          render();
          requestAnimationFrame(() => document.querySelector(`[data-board-group-resize="${direction}"]`)?.focus({ preventScroll: true }));
          return;
        }
        const id = resize.closest('[data-board-id]').dataset.boardId,
          direction = resize.dataset.boardResize;
        command(b => {
          const node = b.nodes.find(n => n.id === id);
          if (node && !whiteboardLockedIds(b).has(node.id))
            Object.assign(node, resizedWhiteboardNode(node, direction, dx * step, dy * step, 10, { lockAspect: s.resizeAspect }));
        });
        requestAnimationFrame(() =>
          document.querySelector(`[data-board-id="${CSS.escape(id)}"] [data-board-resize="${direction}"]`)?.focus({ preventScroll: true }),
        );
        return;
      }
      command(b => {
        const nodes = movableWhiteboardNodes(b, selectedIds());
        const offset = whiteboardSelectionOffset(nodes, dx * step, dy * step);
        for (const n of nodes) {
          n.x += offset.dx;
          n.y += offset.dy;
        }
      });
    }
  },
  true,
);
