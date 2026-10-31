import { A, IN } from '../actions/actions.js';
import { D, S, save } from '../core/store.js';
import { getSessionGeneration } from '../core/api.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { isRussian, t } from '../core/i18n.js';
import { defaultSidebar, sidebarPreferences, SIDEBAR_ITEMS, validSidebar } from '../shared/sidebar-preferences.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
const T = (en, ru) => (isRussian() ? ru : en);
function form(m, H) {
  const rows = group => m.config.order.filter(id => SIDEBAR_ITEMS.find(item => item[0] === id)?.[3] === group);
  const group = (key, title) =>
    `<section class="sidebar-custom-group"><h3>${title}</h3>${rows(key)
      .map((id, i, ids) => {
        const [, label, icon] = SIDEBAR_ITEMS.find(item => item[0] === id),
          name = t(label);
        return `<div class="sidebar-custom-row"><label><input type="checkbox" data-in="sidebarVisibility" data-id="${id}" ${!m.config.hidden.includes(id) ? 'checked' : ''}>${ic(icon, 15)}<span>${esc(name)}</span></label><div><button class="ibtn" data-a="sidebarMove" data-id="${id}" data-step="-1" aria-label="${esc(T('Move up', 'Выше') + ': ' + name)}" ${i === 0 ? 'disabled' : ''}>${ic('arrow-up', 15)}</button><button class="ibtn" data-a="sidebarMove" data-id="${id}" data-step="1" aria-label="${esc(T('Move down', 'Ниже') + ': ' + name)}" ${i === ids.length - 1 ? 'disabled' : ''}>${ic('arrow-down', 15)}</button></div></div>`;
      })
      .join('')}</section>`;
  return `${H(T('Customize menu', 'Настроить меню'))}<div class="modal-b" translate="no"><p class="hint">${T('Your sidebar and mobile navigation drawer. These settings sync only for you in this workspace. Settings and quick navigation remain available.', 'Ваше боковое меню и мобильная панель навигации. Настройки синхронизируются только для вас в этом пространстве. Настройки и быстрый доступ остаются доступны.')}</p>${group('personal', T('Personal', 'Личное'))}${group('workspace', T('Workspace', 'Рабочее пространство'))}<section class="sidebar-custom-group"><h3>${T('Additional blocks', 'Дополнительные блоки')}</h3>${[
    ['counts', 'Counters and unread badges', 'Счётчики и непрочитанные'],
    ['projects', 'Project shortcuts', 'Список проектов'],
    ['teams', 'Team shortcuts', 'Список команд'],
  ]
    .map(
      ([key, en, ru]) =>
        `<label class="sidebar-custom-option"><input type="checkbox" data-in="sidebarOption" data-field="${key}" ${m.config[key] ? 'checked' : ''}>${T(en, ru)}</label>`,
    )
    .join(
      '',
    )}</section></div><div class="modal-f" translate="no"><button class="btn btn-ghost" data-a="resetSidebarDraft">${T('Reset', 'Сбросить')}</button><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="applySidebarDraft">${T('Apply', 'Применить')}</button></div>`;
}
const modal = () => {
  const m = S.ui.modals.at(-1);
  return m?.type === 'sidebarCustomize' &&
    m.owner === S.ui.currentUser?.id &&
    m.session === getSessionGeneration() &&
    m.workspace === (S.ui.activeWorkspace || D().ws.url)
    ? m
    : null;
};
export function openSidebarCustomization() {
  if (!S.ui.currentUser) return;
  openModal({
    type: 'sidebarCustomize',
    render: form,
    config: sidebarPreferences(S.prefs.sidebar),
    owner: S.ui.currentUser.id,
    session: getSessionGeneration(),
    workspace: S.ui.activeWorkspace || D().ws.url,
  });
}
IN.sidebarVisibility = el => {
  const m = modal();
  if (!m || !SIDEBAR_ITEMS.some(i => i[0] === el.dataset.id)) return;
  m.config.hidden = m.config.hidden.filter(id => id !== el.dataset.id);
  if (!el.checked) m.config.hidden.push(el.dataset.id);
};
IN.sidebarOption = el => {
  const m = modal();
  if (m && ['counts', 'projects', 'teams'].includes(el.dataset.field)) m.config[el.dataset.field] = el.checked;
};
A.sidebarMove = el => {
  const m = modal(),
    item = SIDEBAR_ITEMS.find(i => i[0] === el.dataset.id);
  if (!m || !item) return;
  const ids = m.config.order.filter(id => SIDEBAR_ITEMS.find(i => i[0] === id)?.[3] === item[3]),
    i = ids.indexOf(item[0]),
    target = ids[i + Number(el.dataset.step)];
  if (!target) return;
  const a = m.config.order.indexOf(item[0]),
    b = m.config.order.indexOf(target);
  [m.config.order[a], m.config.order[b]] = [m.config.order[b], m.config.order[a]];
  render();
};
A.resetSidebarDraft = () => {
  const m = modal();
  if (m) {
    m.config = defaultSidebar();
    render();
  }
};
A.applySidebarDraft = () => {
  const m = modal();
  if (!m || !validSidebar(m.config)) return;
  S.prefs.sidebar = JSON.stringify(m.config);
  save();
  closeModal();
};
