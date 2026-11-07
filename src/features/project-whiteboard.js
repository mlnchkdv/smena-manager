import { ic } from '../core/icons.js';
import { resizedWhiteboardNode, snapWhiteboardResize } from '../shared/whiteboard-resize.js';
import { resizeWhiteboardGroup, groupResizeNodes } from '../shared/whiteboard-group-resize.js';
import { refreshWhiteboardMinimap } from '../ui/whiteboard-minimap.js';
import { writeLayoutPreference } from '../core/view-layout-preferences.js';
import { whiteboardSelectionNodes, copyWhiteboardSelection, pasteWhiteboardSelection, arrangeWhiteboardSelection } from '../shared/whiteboard-selection.js';
import './whiteboard-history.js';
import './whiteboard-portable.js';
import './whiteboard-tools.js';
import { A, IN } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { queryFileCatalog } from '../core/api.js';
import { whiteboardScope, whiteboardState, whiteboardLabel, whiteboardMaterial, wbText as T } from '../core/whiteboard-state.js';
import { whiteboardMediaPosition, parseWhiteboardTime, formatWhiteboardTime } from '../shared/whiteboard-media.js';
import { workspaceSyncState } from '../core/workspace-sync.js';
import { canEditWhiteboard } from '../shared/whiteboards.js';
import { currentWhiteboard } from '../core/whiteboard-state.js';
import { entityAllowed } from '../shared/relations.js';
import { BOARD_COLORS, whiteboardOf, validWhiteboard, whiteboardBounds, removeWhiteboardNode } from '../shared/project-whiteboard.js';
import { esc, uid } from '../core/utils.js';
import { render } from '../shell/render.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { mutate, toast } from '../ui/toast.js';
import { ensureFileIdentities } from './file-catalog-demand.js';
import { whiteboardEdges } from '../views/project-whiteboard.js';
import { overlayAboveDiagram } from '../ui/diagram-focus.js';
import { syncDiagramWindow } from '../ui/diagram-window.js';
import { whiteboardPickCandidates } from '../shared/whiteboard-picking.js';
import { whiteboardConnection } from '../shared/whiteboard-connect.js';
import { whiteboardInsertionPoint } from '../shared/whiteboard-insertion.js';
import { whiteboardNodeCamera } from '../shared/whiteboard-camera.js';
import { patchWhiteboardContext } from '../shared/whiteboard-context.js';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const colors = () => [
  T('Neutral', 'Нейтральный'),
  T('Violet', 'Фиолетовый'),
  T('Blue', 'Синий'),
  T('Green', 'Зелёный'),
  T('Amber', 'Янтарный'),
  T('Rose', 'Розовый'),
];
const current = currentWhiteboard;
const editable = p => p && !p.archived && canEditWhiteboard(D(), p, D().me, S.ui.currentUser?.role) && !workspaceSyncState().hasConflict;
const field = (name, label, value, type = 'text', extra = '') =>
  `<label class="field">${label}<input class="input" data-in="whiteboardField" data-field="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const colorField = m =>
  `<label class="field">${T('Color', 'Цвет')}<select class="select" data-in="whiteboardField" data-field="color" aria-label="${T('Color', 'Цвет')}">${BOARD_COLORS.map((c, i) => `<option value="${c}" ${c === m.color ? 'selected' : ''}>${colors()[i]}</option>`).join('')}</select></label>`;
function modalForm(m, H) {
  const p = current(),
    board = whiteboardOf(p);
  const title =
    m.kind === 'edge' ? T('Connection', 'Связь') : m.kind === 'material' ? T('Add material', 'Добавить материал') : T('Card settings', 'Настройки карточки');
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
      `<label class="field">${label}<select class="select" data-in="whiteboardField" data-field="${key}">${board.nodes.map(n => `<option value="${esc(n.id)}" ${m[key] === n.id ? 'selected' : ''}>${esc(whiteboardLabel(n))}</option>`).join('')}</select></label>`;
    body = `${select('from', T('From card', 'От карточки'))}${select('to', T('To card', 'К карточке'))}${field('label', T('Label', 'Подпись'), m.label, 'text', 'maxlength="120"')}${colorField(m)}<label><input type="checkbox" data-in="whiteboardField" data-field="arrow" ${m.arrow ? 'checked' : ''}> ${T('Arrow', 'Стрелка')}</label>`;
  } else {
    body = `${m.nodeType === 'material' ? `<p>${esc(whiteboardLabel(m.base))}</p>` : `${field('title', T('Title', 'Название'), m.title, 'text', 'maxlength="120" autofocus')}${m.nodeType !== 'group' ? `<label class="field">${T('Text', 'Текст')}<textarea class="textarea" rows="7" data-in="whiteboardField" data-field="text" maxlength="6000">${esc(m.text)}</textarea></label>` : ''}`}${colorField(m)}<details><summary>${T('Size and position', 'Размер и положение')}</summary><div class="whiteboard-form-grid">${field('x', 'X', m.x, 'number', 'min="-50000" max="50000" step="10"')}${field('y', 'Y', m.y, 'number', 'min="-50000" max="50000" step="10"')}${field('width', T('Width', 'Ширина'), m.width, 'number', 'min="160" max="2000" step="10"')}${field('height', T('Height', 'Высота'), m.height, 'number', 'min="100" max="2000" step="10"')}</div></details>`;
  }
  if (m.kind === 'node' && m.nodeType === 'material') {
    const source = whiteboardMaterial(m.base),
      media = source?.kind === 'file' ? whiteboardMediaPosition(source.item, m.media) : null;
    if (media && ['pdf', 'video', 'audio'].includes(media.kind))
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
  return `${H(title)}<div class="modal-b" translate="no">${body}${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f" translate="no">${m.id && editable(p) ? `<button class="btn btn-ghost bad" data-a="whiteboardRemoveInModal">${T('Remove', 'Убрать')}</button>` : ''}<span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button>${m.kind !== 'material' && editable(p) ? `<button class="btn btn-primary" data-a="whiteboardSave">${T('Save', 'Сохранить')}</button>` : ''}</div>`;
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
export function whiteboardCommand(edit, restoreToken, replaceBaseHash) {
  const p = current();
  if (!editable(p)) {
    toast(T('Editing is unavailable. Check access or synchronization.', 'Редактирование недоступно. Проверьте доступ и синхронизацию.'), { kind: 'err' });
    return false;
  }
  const before = structuredClone(whiteboardOf(p)),
    next = structuredClone(before),
    state = whiteboardState();
  edit(next);
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
function revealNode(node) {
  const s = whiteboardState(),
    box = document.querySelector('.whiteboard-viewport')?.getBoundingClientRect();
  s.selected = node.id;
  s.selection = [node.id];
  if (!box) return;
  s.zoom = Math.max(0.2, Math.min(s.zoom, (box.width - 32) / node.width, (box.height - 32) / node.height));
  s.x = box.width / 2 - (node.x + node.width / 2) * s.zoom;
  s.y = box.height / 2 - (node.y + node.height / 2) * s.zoom;
  s.fit = false;
  s.autoFit = false;
}
function newCard(type, point) {
  if (!editable(current())) return;
  const position = point || insertion();
  openTool({
    kind: 'node',
    nodeType: type,
    title: '',
    text: '',
    color: type === 'group' ? 'blue' : 'neutral',
    ...position,
    width: type === 'group' ? 600 : 260,
    height: type === 'group' ? 400 : 180,
  });
}
A.whiteboardNewText = () => newCard('text');
A.whiteboardNewFrame = () => newCard('group');
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
      base: structuredClone(node),
    });
  }
};
IN.whiteboardField = el => {
  const m = activeModal();
  if (!m) return;
  m[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
};
A.whiteboardSave = () => {
  const m = activeModal(),
    p = current();
  if (!m || !editable(p)) return;
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
  let item;
  if (m.kind === 'edge') item = { id: m.id || uid('we'), from: m.from, to: m.to, label: m.label.trim(), arrow: m.arrow, color: m.color };
  else {
    item = { id: m.id || uid('wc'), type: m.nodeType, x: m.x, y: m.y, width: m.width, height: m.height, color: m.color };
    if (m.nodeType === 'material') {
      item.target = old.target;
      const source = whiteboardMaterial(old),
        kind = source?.kind === 'file' ? whiteboardMediaPosition(source.item, old.media).kind : null;
      if (kind === 'pdf' && m.mediaPage !== '' && m.mediaPage !== 0) item.media = { page: m.mediaPage };
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
  }
  if (
    command(next => {
      if (item.media) next.version = 2;
      next[collection] = old ? next[collection].map(n => (n.id === old.id ? item : n)) : [...next[collection], item];
    })
  ) {
    if (collection === 'nodes') revealNode(item);
    else whiteboardState().selected = '';
    closeModal();
  }
};
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
  A.previewFile({
    dataset: {
      id: source.id,
      ...(position.page ? { page: String(position.page) } : {}),
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
  const node = { id: uid('wc'), type: 'material', target: key, ...insertion(), width: 260, height: 180, color: 'violet' };
  if (command(board => board.nodes.push(node))) {
    revealNode(node);
    closeModal();
  }
};
const command = whiteboardCommand;
const selectedIds = () => {
  const s = whiteboardState();
  return (s.selection?.length ? s.selection : s.selected ? [s.selected] : []).filter(id => whiteboardOf(current()).nodes.some(n => n.id === id));
};
A.whiteboardSelect = (el, event) => {
  const s = whiteboardState(),
    id = el.dataset.id;
  if (Date.now() < (s.tapOpenUntil || 0)) return;
  if (s.connectFrom) return finishConnection(s.connectFrom, id);
  s.selectedEdge = '';
  if (event?.shiftKey || event?.ctrlKey || event?.metaKey) {
    const ids = new Set(selectedIds());
    ids.has(id) ? ids.delete(id) : ids.add(id);
    s.selection = [...ids];
    s.selected = s.selection[0] || '';
  } else {
    if (!s.multiSelect || !selectedIds().includes(id)) s.selection = [id];
    s.selected = id;
  }
  render();
};
function openCardChooser(ids) {
  const p = current();
  if (!p) return;
  openModal({
    type: 'whiteboardTool',
    project: p.id,
    scope: whiteboardScope(p.id),
    kind: 'pick',
    ids,
    query: '',
    render: (m, H) => {
      const available = whiteboardOf(current() || {}).nodes.filter(n => (!m.ids || m.ids.includes(n.id)) && (!m.onlyFrames || n.type === 'group'));
      const matches = available.filter(n => `${whiteboardLabel(n)} ${n.text || ''}`.toLocaleLowerCase().includes(m.query.trim().toLocaleLowerCase()));
      const kindPicker = m.ids
        ? ''
        : `<div class="whiteboard-pick-kinds" role="group" aria-label="${T('Card types', 'Типы карточек')}"><button class="btn btn-secondary btn-sm" data-a="whiteboardPickKind" data-kind="all" aria-pressed="${!m.onlyFrames}">${T('All cards', 'Все карточки')}</button><button class="btn btn-secondary btn-sm" data-a="whiteboardPickKind" data-kind="frames" aria-pressed="${!!m.onlyFrames}">${ic('square-dashed', 14)}${T('Frames', 'Рамки')}</button></div>`;
      return `${H(T('Choose card', 'Выбрать карточку'))}<div class="modal-b">${kindPicker}<label class="field">${T('Search cards', 'Поиск карточек')}<input class="input" id="whiteboard-pick-query" data-in="whiteboardPickQuery" value="${esc(m.query)}" autofocus></label><p class="hint" role="status" aria-live="polite">${T(`Found: ${matches.length} / ${available.length}`, `Найдено: ${matches.length} / ${available.length}`)}</p><div class="whiteboard-card-choices">${matches.map(n => `<button class="whiteboard-card-choice" data-a="whiteboardPickCard" data-id="${esc(n.id)}" aria-pressed="${selectedIds().includes(n.id)}"><strong>${selectedIds().includes(n.id) ? ic('check', 14) : ''}${esc(whiteboardLabel(n))}</strong><small>${T(n.type === 'group' ? 'Frame' : n.type === 'material' ? 'Linked material' : 'Text card', n.type === 'group' ? 'Рамка' : n.type === 'material' ? 'Связанный материал' : 'Текстовая карточка')}</small>${n.text ? `<span>${esc(n.text.slice(0, 160))}${n.text.length > 160 ? '…' : ''}</span>` : ''}</button>`).join('') || `<p>${T('No matching cards.', 'Карточки не найдены.')}</p>`}</div></div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button></div>`;
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
  render();
};
A.whiteboardPickCard = el => {
  const m = activeModal();
  if (m?.kind !== 'pick' || !whiteboardOf(current()).nodes.some(n => n.id === el.dataset.id && (!m.ids || m.ids.includes(n.id)))) return;
  const id = el.dataset.id;
  const locate = m.onlyFrames;
  closeModal();
  A.whiteboardSelect({ dataset: { id } });
  if (locate) A.whiteboardLocate({ dataset: { id } });
};
IN.whiteboardSelection = el => {
  const s = whiteboardState(),
    ids = new Set(selectedIds());
  s.selectedEdge = '';
  el.checked ? ids.add(el.dataset.id) : ids.delete(el.dataset.id);
  s.selection = [...ids];
  s.selected = s.selection[0] || '';
  render();
};
A.whiteboardToggleSelection = () => {
  whiteboardState().multiSelect = !whiteboardState().multiSelect;
  render();
};
A.whiteboardDeselect = () => {
  const s = whiteboardState();
  s.selected = '';
  s.selection = [];
  s.selectedEdge = '';
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
A.whiteboardPaste = async () => {
  const p = current();
  if (!editable(p)) return;
  const scope = whiteboardScope(p.id);
  let fragment = clipboard?.scope === JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url]) ? clipboard.board : null;
  try {
    const value = fragment ? null : JSON.parse(await navigator.clipboard.readText());
    if (value?.format === 'smena-whiteboard-selection' && value.version === 1) fragment = value.board;
  } catch {
    /* optional clipboard */
  }
  if (!fragment && clipboard?.scope === JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url])) fragment = clipboard.board;
  if (current()?.id !== p.id || scope !== whiteboardScope(p.id) || !editable(current())) return;
  if (!fragment || !validWhiteboard(fragment))
    return toast(T('Copy cards first or use a valid selection.', 'Сначала скопируйте карточки или используйте корректное выделение.'), { kind: 'info' });
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
};
A.whiteboardArrange = el => {
  if (!['left', 'right', 'top', 'bottom', 'center-x', 'center-y', 'distribute-x', 'distribute-y'].includes(el.dataset.mode)) return;
  if (command(next => Object.assign(next, arrangeWhiteboardSelection(next, selectedIds(), el.dataset.mode)))) render();
};
A.whiteboardToggleFocus = () => {
  whiteboardState().focus = !whiteboardState().focus;
  syncDiagramWindow();
  render();
  document.querySelector('[data-a="whiteboardToggleFocus"]')?.focus();
};
A.whiteboardToggleOutline = () => {
  whiteboardState().outline = !whiteboardState().outline;
  render();
};
A.whiteboardTogglePan = () => {
  const s = whiteboardState();
  s.navigationMode = s.navigationMode === 'scroll' ? 'move' : 'scroll';
  render();
};
IN.whiteboardNavigation = el => {
  if (!['scroll', 'pan', 'move'].includes(el.value)) return;
  whiteboardState().navigationMode = el.value;
  render();
  document.querySelector('[data-in="whiteboardNavigation"] + .select-btn')?.focus({ preventScroll: true });
};
IN.whiteboardOutlineQuery = el => {
  whiteboardState().outlineQuery = el.value;
  render();
};
A.whiteboardLocate = el => {
  const node = whiteboardOf(current()).nodes.find(n => n.id === el.dataset.id);
  if (!node) return;
  const s = whiteboardState();
  Object.assign(s, { selected: node.id, selection: [node.id], outline: false, fit: false, autoFit: false });
  render();
  requestAnimationFrame(() => {
    const box = document.querySelector('.whiteboard-viewport')?.getBoundingClientRect();
    if (!box || s !== whiteboardState()) return;
    const camera = whiteboardNodeCamera(node, box);
    if (!camera) return;
    Object.assign(s, camera);
    paintView();
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
  const board = whiteboardOf(current());
  if (!editable(current())) return;
  if (board.nodes.length < 2) return toast(T('Add two cards first.', 'Сначала добавьте две карточки.'), { kind: 'info' });
  const from = whiteboardState().selected || board.nodes[0].id;
  openTool({
    kind: 'edge',
    from,
    to: selectedIds().find(id => id !== from) || board.nodes.find(n => n.id !== from).id,
    label: '',
    arrow: true,
    color: 'neutral',
  });
};
function finishConnection(from, to) {
  const s = whiteboardState();
  s.connectFrom = '';
  if (editable(current()) && to && to !== from) {
    let result;
    command(board => {
      result = whiteboardConnection(board, from, to, uid('we'));
      if (result?.created) board.edges.push(result.edge);
    });
    if (!result) toast(T('The cards changed or the connection limit was reached.', 'Карточки изменились или достигнут лимит связей.'), { kind: 'info' });
  }
  render();
}
A.whiteboardConnectStart = el => {
  if (!editable(current()) || Date.now() < (whiteboardState().connectSuppressUntil || 0)) return;
  const s = whiteboardState();
  s.connectFrom = s.connectFrom === el.dataset.id ? '' : el.dataset.id;
  render();
};
A.whiteboardCancelConnect = () => {
  whiteboardState().connectFrom = '';
  render();
};
A.whiteboardEditEdge = el => {
  const edge = whiteboardOf(current()).edges.find(e => e.id === el.dataset.id);
  if (edge) openTool({ kind: 'edge', ...edge, base: structuredClone(edge) });
};
A.whiteboardSelectEdge = el => {
  if (!whiteboardOf(current()).edges.some(edge => edge.id === el.dataset.id)) return;
  Object.assign(whiteboardState(), { selectedEdge: el.dataset.id, selected: '', selection: [] });
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
  const s = whiteboardState(),
    node = whiteboardOf(current()).nodes.find(n => n.id === s.selected);
  const box = document.querySelector('.whiteboard-viewport')?.getBoundingClientRect();
  if (!node || !box) return;
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
  const b = whiteboardBounds(whiteboardOf(current())),
    s = whiteboardState();
  s.zoom = Math.max(0.2, Math.min(1, (box.width - 64) / b.width, (box.height - 64) / b.height));
  s.x = (box.width - b.width * s.zoom) / 2 - b.x * s.zoom;
  s.y = (box.height - b.height * s.zoom) / 2 - b.y * s.zoom;
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
function openWhiteboardCard(id) {
  const node = whiteboardOf(current()).nodes.find(node => node.id === id);
  if (!node) return;
  if (node.type === 'material') A.openRelatedEntity({ dataset: { key: node.target } });
  else if (editable(current())) A.whiteboardEdit({ dataset: { id } });
}
document.addEventListener('keyup', event => {
  if (event.code === 'Space') stopSpacePan();
});
window.addEventListener('blur', stopSpacePan);
let cameraSize, cameraOwner;
const pointers = new Map(),
  mounted = new WeakSet(),
  hydrations = new Set();
function resetPreview() {
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
  const svg = document.querySelector('.whiteboard-edges');
  if (svg) svg.outerHTML = whiteboardEdges(whiteboardOf(current()));
}
function down(e) {
  if (e.button !== 0) return;
  if (e.target.closest('[data-board-edge]') && !spacePan) return;
  const resize = e.target.closest('[data-board-resize]');
  const connector = e.target.closest('[data-board-connect]');
  if (whiteboardState().navigationMode === 'scroll' && !resize && !connector && !spacePan) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const s = whiteboardState(),
    box = viewport.getBoundingClientRect();
  if (spacePan) {
    gesture = { kind: 'pan', x: e.clientX, y: e.clientY, panX: s.x, panY: s.y };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (editable(current()) && (connector || (s.connectFrom && !e.target.closest('button:not([data-board-drag]),a')))) {
    gesture = { kind: 'connect', from: connector?.dataset.boardConnect || s.connectFrom, scope: s.scope, x: e.clientX, y: e.clientY, moved: false };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (pointers.size === 2) {
    resetPreview();
    const [a, b] = [...pointers.values()];
    gesture = {
      kind: 'pinch',
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      zoom: s.zoom,
      anchorX: ((a.x + b.x) / 2 - box.left - s.x) / s.zoom,
      anchorY: ((a.y + b.y) / 2 - box.top - s.y) / s.zoom,
    };
    e.preventDefault();
    viewport.setPointerCapture(e.pointerId);
    return;
  }
  if (resize && editable(current())) {
    if (resize.dataset.boardGroupResize) {
      const ids = selectedIds(),
        board = structuredClone(whiteboardOf(current()));
      gesture = {
        kind: 'groupResize',
        board,
        ids,
        nodes: groupResizeNodes(board, ids, !!s.resizeContents),
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
    const node = whiteboardOf(current()).nodes.find(n => n.id === resize.closest('[data-board-id]')?.dataset.boardId);
    if (!node) return;
    gesture = { kind: 'resize', node: structuredClone(node), direction: resize.dataset.boardResize, x: e.clientX, y: e.clientY, zoom: s.zoom, scope: s.scope };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (s.zoom < 0.65 && !e.target.closest('.whiteboard-navigation,.whiteboard-minimap')) {
    gesture = { kind: 'pan', x: e.clientX, y: e.clientY, panX: s.x, panY: s.y };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  const handle = e.target.closest('[data-board-drag]');
  if (handle && s.navigationMode === 'pan') {
    gesture = { kind: 'pan', x: e.clientX, y: e.clientY, panX: s.x, panY: s.y };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (handle && (e.shiftKey || e.ctrlKey || e.metaKey)) {
    pointers.delete(e.pointerId);
    return;
  }
  if (handle && editable(current())) {
    s.selectedEdge = '';
    if (!selectedIds().includes(handle.dataset.boardDrag)) s.selection = [handle.dataset.boardDrag];
    const nodes = whiteboardSelectionNodes(whiteboardOf(current()), s.selection?.length ? s.selection : [handle.dataset.boardDrag]);
    s.selected = handle.dataset.boardDrag;
    gesture = { kind: 'move', nodeId: handle.dataset.boardDrag, nodes: structuredClone(nodes), x: e.clientX, y: e.clientY, scope: s.scope, dx: 0, dy: 0 };
  } else if (!e.target.closest('button,a,.whiteboard-card')) gesture = { kind: 'pan', x: e.clientX, y: e.clientY, panX: s.x, panY: s.y };
  else {
    pointers.delete(e.pointerId);
    return;
  }
  viewport.setPointerCapture(e.pointerId);
  e.preventDefault();
}
function move(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const s = whiteboardState(),
    g = gesture;
  if (!g) return;
  if (g.kind === 'connect') {
    if (g.scope !== s.scope) return;
    g.moved ||= Math.hypot(e.clientX - g.x, e.clientY - g.y) > 5;
    const box = viewport.getBoundingClientRect(),
      board = whiteboardOf(current());
    const ids = whiteboardPickCandidates(
      board.nodes.filter(n => n.id !== g.from),
      { x: e.clientX - box.left, y: e.clientY - box.top },
      s,
    );
    g.to = ids[0] || '';
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
    const svg = viewport.querySelector('.whiteboard-edges');
    if (svg) svg.outerHTML = whiteboardEdges(g.next);
    return;
  }
  if (g.kind === 'resize') {
    if (g.scope !== s.scope) return;
    let dx = Math.round((e.clientX - g.x) / g.zoom / 10) * 10,
      dy = Math.round((e.clientY - g.y) / g.zoom / 10) * 10;
    const lockAspect = s.resizeAspect && g.direction.length === 2;
    const snapped =
      s.resizeGuides && !lockAspect ? snapWhiteboardResize(g.node, g.direction, dx, dy, whiteboardOf(current()).nodes, 6 / g.zoom) : { dx, dy, guides: [] };
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
        const board = whiteboardOf(current()),
          svg = viewport?.querySelector('.whiteboard-edges');
        if (svg) svg.outerHTML = whiteboardEdges({ ...board, nodes: board.nodes.map(n => (n.id === g.node.id ? g.next : n)) });
      });
    return;
  }
  if (g.kind === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()],
      box = viewport.getBoundingClientRect();
    s.zoom = Math.max(0.2, Math.min(2.5, (g.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, g.distance)));
    s.x = (a.x + b.x) / 2 - box.left - g.anchorX * s.zoom;
    s.y = (a.y + b.y) / 2 - box.top - g.anchorY * s.zoom;
    paintView();
    return;
  }
  if (g.kind === 'pan') {
    g.moved ||= Math.hypot(e.clientX - g.x, e.clientY - g.y) > 5;
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
    g.dx = Math.round((e.clientX - g.x) / s.zoom / 10) * 10;
    g.dy = Math.round((e.clientY - g.y) / s.zoom / 10) * 10;
    g.dx = Math.max(...g.nodes.map(n => -50000 - n.x), Math.min(...g.nodes.map(n => 50000 - n.x), g.dx));
    g.dy = Math.max(...g.nodes.map(n => -50000 - n.y), Math.min(...g.nodes.map(n => 50000 - n.y), g.dy));
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
        const svg = viewport?.querySelector('.whiteboard-edges');
        if (svg) svg.outerHTML = whiteboardEdges({ ...board, nodes: board.nodes.map(n => (ids.has(n.id) ? { ...n, x: n.x + g.dx, y: n.y + g.dy } : n)) });
      });
  }
}
function up(e, cancel = false) {
  viewport?.querySelector('.whiteboard-guides')?.replaceChildren();
  pointers.delete(e.pointerId);
  const g = gesture;
  gesture = null;
  if (!g) return;
  if (g.kind === 'connect') {
    resetPreview();
    if (cancel || g.scope !== whiteboardState().scope) {
      whiteboardState().connectFrom = '';
      return;
    }
    whiteboardState().connectSuppressUntil = Date.now() + 350;
    if (g.moved || whiteboardState().connectFrom) {
      const box = viewport.getBoundingClientRect();
      const ids = whiteboardPickCandidates(
        whiteboardOf(current()).nodes.filter(n => n.id !== g.from),
        { x: e.clientX - box.left, y: e.clientY - box.top },
        whiteboardState(),
      );
      finishConnection(g.from, ids[0]);
    } else {
      whiteboardState().connectFrom = g.from;
      render();
    }
    return;
  }
  if (g.kind === 'pan' && g.moved) whiteboardState().overviewPanUntil = Date.now() + 300;
  if (cancel) {
    resetPreview();
    if (g.kind === 'groupResize') render();
    return;
  }
  if (g.kind === 'groupResize') {
    if (
      g.scope !== whiteboardState().scope ||
      !g.next ||
      g.nodes.some(
        node =>
          !same(
            node,
            whiteboardOf(current()).nodes.find(n => n.id === node.id),
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
    if (
      !same(
        g.node,
        whiteboardOf(current()).nodes.find(n => n.id === g.node.id),
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
  if (g.kind === 'move' && (g.dx || g.dy) && g.scope === whiteboardState().scope) {
    const board = whiteboardOf(current());
    if (
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
    command(next => {
      for (const n of next.nodes)
        if (g.nodes.some(i => i.id === n.id)) {
          n.x += g.dx;
          n.y += g.dy;
        }
    });
  } else if (g.kind === 'move' && g.scope === whiteboardState().scope) {
    // Selection is view state, including a captured pointer with zero movement.
    const s = whiteboardState(),
      last = s.lastTap;
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
        if (event.detail === 0 || s.zoom >= 0.65 || event.target.closest('.whiteboard-navigation,.whiteboard-minimap,[data-board-resize]')) return;
        if (Date.now() < (s.overviewPanUntil || 0)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const box = next.getBoundingClientRect();
        const ids = whiteboardPickCandidates(whiteboardOf(current()).nodes, { x: event.clientX - box.left, y: event.clientY - box.top }, s);
        if (!ids.length) return;
        event.preventDefault();
        event.stopPropagation();
        if (ids.length === 1) A.whiteboardSelect({ dataset: { id: ids[0] } });
        else openCardChooser(ids);
      },
      true,
    );
    next.addEventListener('pointerdown', down);
    next.addEventListener('dblclick', event => {
      if (
        overlayAboveDiagram() ||
        spacePan ||
        event.target.closest('.whiteboard-navigation,.whiteboard-minimap,[data-board-resize],[data-board-connect],[data-board-edge]')
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
        if (whiteboardState().navigationMode === 'scroll' && !e.ctrlKey && !e.metaKey) return;
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
    if (e.key === 'Escape' && current() && whiteboardState().connectFrom && !gesture) {
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
    if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'a'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key.toLowerCase() === 'c') void A.whiteboardCopy();
      else if (e.key.toLowerCase() === 'v') void A.whiteboardPaste();
      else {
        s.selection = whiteboardOf(current()).nodes.map(n => n.id);
        s.selected = s.selection[0] || '';
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
      s.selected = '';
      s.selection = [];
      render();
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
          if (node) Object.assign(node, resizedWhiteboardNode(node, direction, dx * step, dy * step, 10, { lockAspect: s.resizeAspect }));
        });
        requestAnimationFrame(() =>
          document.querySelector(`[data-board-id="${CSS.escape(id)}"] [data-board-resize="${direction}"]`)?.focus({ preventScroll: true }),
        );
        return;
      }
      command(b => {
        const ids = new Set(whiteboardSelectionNodes(b, selectedIds()).map(n => n.id));
        for (const n of b.nodes)
          if (ids.has(n.id)) {
            n.x += dx * step;
            n.y += dy * step;
          }
      });
    }
  },
  true,
);
