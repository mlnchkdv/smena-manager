import { A, IN, confirmDlg } from '../actions/actions.js';
import { D, S, proj } from '../core/store.js';
import { whiteboardScope, whiteboardState, wbText as T } from '../core/whiteboard-state.js';
import { whiteboardOf } from '../shared/project-whiteboard.js';
import { parseWhiteboardImport, exportJsonCanvas } from '../shared/whiteboard-portable.js';
import { pasteWhiteboardSelection } from '../shared/whiteboard-selection.js';
import { entityAllowed } from '../shared/relations.js';
import { canEditProject } from '../shared/project-access.js';
import { whiteboardCommand } from './project-whiteboard.js';
import { getWhiteboardVersions } from '../core/api.js';
import { ensureFileIdentities } from './file-catalog-demand.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { esc, uid } from '../core/utils.js';
import { toast } from '../ui/toast.js';
const current = () => (S.ui.route === 'project' && S.ui.params.tab === 'whiteboard' ? proj(S.ui.params.id) : null);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const active = () => {
  const m = S.ui.modals.at(-1);
  return m?.boardImport && current()?.id === m.project && m.scope === whiteboardScope(m.project) ? m : null;
};
const warning = key =>
  ({
    colors: T('Unsupported colors become neutral.', 'Неподдерживаемые цвета станут нейтральными.'),
    backgrounds: T('Frame background images are omitted.', 'Фоновые изображения рамок не переносятся.'),
    files: T('File paths are kept as text. Attachments are not uploaded.', 'Пути файлов сохранятся как текст. Вложения не загружаются.'),
    links: T('External URLs are kept as text cards.', 'Внешние URL сохранятся как текстовые карточки.'),
    doubleArrows: T('Two-ended arrows become a single arrow.', 'Двусторонние стрелки станут односторонними.'),
    sides: T('Connections attach automatically; fixed sides are omitted.', 'Стороны соединения выбираются автоматически.'),
    access: T(
      'Unavailable material references become text placeholders without copied content.',
      'Недоступные материалы станут текстовыми указателями без копирования содержимого.',
    ),
  })[key] || key;
function form(m, H) {
  return `${H(T('Import whiteboard', 'Импорт холста'))}<div class="modal-b" translate="no"><p>${esc(m.file)} · ${esc(m.format)}</p><p>${m.board.nodes.length} ${T('cards', 'карточек')} · ${m.board.edges.length} ${T('connections', 'связей')}</p><p class="hint">${T('Destination project', 'Проект назначения')}: ${esc(current()?.name || '')}</p>${m.warnings.length ? `<ul>${m.warnings.map(w => `<li>${esc(warning(w))}</li>`).join('')}</ul>` : ''}<label class="field"><span>${T('Import mode', 'Режим импорта')}</span><select class="select" aria-label="${T('Import mode', 'Режим импорта')}" data-in="whiteboardImportMode"><option value="append" ${m.mode === 'append' ? 'selected' : ''}>${T('Add to current board', 'Добавить к текущему холсту')}</option><option value="replace" ${m.mode === 'replace' ? 'selected' : ''}>${T('Replace current board', 'Заменить текущий холст')}</option></select></label><p class="hint">${T('Up to 200 cards and 400 connections. Coordinates ±50,000; card width 160–2,000 and height 100–2,000. Replacement saves the current board in history.', 'До 200 карточек и 400 связей. Координаты ±50 000; ширина 160–2000, высота 100–2000. При замене текущий холст сохраняется в истории.')}</p></div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="applyWhiteboardImport">${T('Import', 'Импортировать')}</button></div>`;
}
A.whiteboardImport = () => {
  const p = current();
  if (!p || p.archived || !canEditProject(p, D().me, S.ui.currentUser?.role)) return;
  const scope = whiteboardScope(p.id),
    base = structuredClone(whiteboardOf(p));
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.canvas,application/json';
  input.addEventListener(
    'change',
    async () => {
      const file = input.files?.[0];
      if (!file) return;
      const validScope = () => current()?.id === p.id && scope === whiteboardScope(p.id);
      try {
        if (file.size > 1048576) throw new Error('limit');
        const result = parseWhiteboardImport(await file.text());
        if (!validScope()) return;
        const files = result.board.nodes.filter(n => n.type === 'material' && n.target.startsWith('file:')).map(n => n.target.slice(5));
        if (files.length) await ensureFileIdentities(files);
        if (!validScope()) return;
        for (const n of result.board.nodes)
          if (n.type === 'material' && !entityAllowed(D(), n.target, { role: S.ui.currentUser?.role, memberId: D().me })) {
            const target = n.target;
            Object.assign(n, { type: 'text', title: T('Unavailable material', 'Недоступный материал'), text: target });
            delete n.target;
            if (!result.warnings.includes('access')) result.warnings.push('access');
          }
        const data = await getWhiteboardVersions(p.id);
        if (!validScope()) return;
        openModal({ type: 'whiteboardTool', boardImport: true, render: form, project: p.id, scope, base, data, ...result, file: file.name, mode: 'append' });
      } catch {
        if (validScope())
          toast(
            T(
              'Could not import. Use valid Smena JSON or JSON Canvas within the displayed board limits (file up to 1 MiB).',
              'Не удалось импортировать. Нужен Smena JSON или JSON Canvas в пределах лимитов холста (файл до 1 МиБ).',
            ),
            { kind: 'err' },
          );
      }
    },
    { once: true },
  );
  input.click();
};
IN.whiteboardImportMode = el => {
  const m = active();
  if (m && ['append', 'replace'].includes(el.value)) m.mode = el.value;
};
A.applyWhiteboardImport = () => {
  const m = active();
  if (!m) return;
  const ready = () =>
    current()?.id === m.project &&
    m.scope === whiteboardScope(m.project) &&
    workspaceSyncIsClean(S.data) &&
    same(whiteboardOf(current()), m.base) &&
    same(m.base, m.data.board);
  const run = () => {
    if (!ready())
      return toast(T('The board changed or is not saved. Reopen the import.', 'Холст изменился или не сохранён. Откройте импорт заново.'), { kind: 'info' });
    const result = pasteWhiteboardSelection(
      m.mode === 'replace' ? { version: 1, nodes: [], edges: [] } : whiteboardOf(current()),
      m.board,
      uid,
      m.mode === 'replace' ? 0 : 40,
      m.mode === 'replace' ? 0 : 40,
    );
    if (!result) return toast(T('The combined board exceeds its limits.', 'Объединённый холст превышает лимиты.'), { kind: 'err' });
    if (whiteboardCommand(next => Object.assign(next, result.board), null, m.mode === 'replace' ? m.data.baseHash : null)) {
      Object.assign(whiteboardState(), { fit: true, selected: '', selection: [] });
      closeModal();
    }
  };
  if (m.mode === 'replace')
    confirmDlg({
      title: T('Replace this whiteboard?', 'Заменить этот холст?'),
      body: T(
        'The current board will be saved in history. Linked materials remain unchanged.',
        'Текущий холст сохранится в истории. Связанные материалы не изменятся.',
      ),
      ok: T('Replace', 'Заменить'),
      run,
    });
  else run();
};
A.whiteboardExportCanvas = () => {
  const p = current();
  if (!p) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportJsonCanvas(whiteboardOf(p)), null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'whiteboard.canvas';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
