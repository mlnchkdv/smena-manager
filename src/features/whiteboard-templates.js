import { A } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { currentWhiteboard, whiteboardScope, wbText as T } from '../core/whiteboard-state.js';
import { canEditWhiteboard } from '../shared/whiteboards.js';
import { validWhiteboard, whiteboardOf } from '../shared/project-whiteboard.js';
import { createWhiteboardTemplate, whiteboardTemplatePosition } from '../shared/whiteboard-templates.js';
import { pasteWhiteboardSelection } from '../shared/whiteboard-selection.js';
import { whiteboardCommand } from './project-whiteboard.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { esc, uid } from '../core/utils.js';
import { ic } from '../core/icons.js';
const kinds = ['brainstorm', 'decision', 'plan'];
const labels = () => ({
  brainstorm: T('Brainstorm', 'Сбор идей'),
  decision: T('Decision map', 'Карта решения'),
  plan: T('Now and next', 'Сейчас и далее'),
  question: T('Question', 'Вопрос'),
  questionBody: T('Define a focused question.', 'Сформулируйте конкретный вопрос.'),
  idea: T('Idea', 'Идея'),
  ideaBody: T('Add one idea per card.', 'Одна идея на карточку.'),
  decisionNode: T('Decision', 'Решение'),
  decisionBody: T('What needs to be decided?', 'Что нужно решить?'),
  optionA: T('Option A', 'Вариант A'),
  optionB: T('Option B', 'Вариант B'),
  optionBody: T('Benefits, risks and evidence.', 'Польза, риски и основания.'),
  now: T('Now', 'Сейчас'),
  next: T('Next', 'Далее'),
  action: T('Next action', 'Следующее действие'),
  actionBody: T('Describe an outcome and a clear next step.', 'Опишите результат и конкретный следующий шаг.'),
});
const active = () => {
  const m = S.ui.modals.at(-1);
  return m?.boardTemplates && m.scope === whiteboardScope(m.project) && currentWhiteboard()?.id === m.project ? m : null;
};
const writable = () => {
  const document = currentWhiteboard();
  return document && !document.archived && canEditWhiteboard(D(), document, D().me, S.ui.currentUser?.role) ? document : null;
};
A.whiteboardTemplates = () => {
  const document = writable();
  if (!document) return;
  openModal({
    type: 'whiteboardTool',
    boardTemplates: true,
    project: document.id,
    scope: whiteboardScope(document.id),
    template: '',
    render: (m, H) => {
      const names = labels(),
        descriptions = [
          T('One question and three ideas.', 'Один вопрос и три идеи.'),
          T('A decision and two alternatives.', 'Решение и два варианта.'),
          T('Two ordered frames with next actions.', 'Две рамки по порядку со следующими действиями.'),
        ],
        icons = ['lightbulb', 'git-branch', 'columns-2'];
      return `${H(T('Canvas templates', 'Шаблоны холста'))}<div class="modal-b" translate="no"><p class="hint">${T('Add a starting structure next to your cards. Existing content stays unchanged. Undo removes the whole addition.', 'Добавьте структуру рядом с вашими карточками. Содержимое останется на месте. Отмена уберёт всё добавление целиком.')}</p><div class="whiteboard-template-options">${kinds.map((kind, i) => `<button class="whiteboard-template-option" data-a="whiteboardTemplatePick" data-kind="${kind}" aria-pressed="${m.template === kind}">${ic(icons[i], 22)}<span><strong>${esc(names[kind])}</strong><span>${descriptions[i]}</span></span></button>`).join('')}</div>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button><span class="sp"></span><button class="btn btn-primary" data-a="whiteboardTemplateApply" ${m.template ? '' : 'disabled'}>${T('Add to canvas', 'Добавить на холст')}</button></div>`;
    },
  });
};
A.whiteboardTemplatePick = el => {
  const m = active();
  if (m && kinds.includes(el.dataset.kind)) {
    m.template = el.dataset.kind;
    m.error = '';
    render();
  }
};
A.whiteboardTemplateApply = () => {
  const m = active(),
    document = writable();
  if (!m || !document || !kinds.includes(m.template)) return;
  if (!validWhiteboard(document.whiteboard)) {
    m.error = T('Reload the canvas before adding a template.', 'Обновите холст перед добавлением шаблона.');
    return render();
  }
  const fragment = createWhiteboardTemplate(m.template, { idFactory: uid, labels: labels() }),
    board = whiteboardOf(document),
    position = whiteboardTemplatePosition(board, fragment),
    result = position && pasteWhiteboardSelection(board, fragment, uid, position.dx, position.dy);
  if (!result) {
    m.error = T(
      'Not enough room or card capacity. Move cards closer, remove unused cards or use another canvas.',
      'Недостаточно места или превышен лимит карточек. Сдвиньте карточки ближе, уберите ненужные или используйте другой холст.',
    );
    return render();
  }
  if (!whiteboardCommand(next => Object.assign(next, result.board))) return;
  const first = result.board.nodes.find(node => result.ids.includes(node.id) && node.type === 'group');
  closeModal();
  if (first) A.whiteboardLocate({ dataset: { id: first.id } });
};
