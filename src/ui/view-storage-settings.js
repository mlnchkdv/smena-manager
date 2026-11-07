import { A } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { getSessionGeneration } from '../core/api.js';
import { isRussian } from '../core/i18n.js';
import { knowledgeViewKeys, readScopedLayout } from '../shared/layout-preference-storage.js';
import { disclosureAttributes, resetDisclosures } from './disclosure.js';
import { render } from '../shell/render.js';
import '../styles/view-storage-settings.css';
const T = (en, ru) => (isRussian() ? ru : en);
const identity = () => ({ user: S.ui.currentUser?.id, workspace: D().ws.id || D().ws.url });
const scope = () => JSON.stringify([getSessionGeneration(), ...Object.values(identity())]);
export function viewStorageSettings() {
  const actor = identity();
  let density = '';
  try {
    density = readScopedLayout(localStorage, knowledgeViewKeys(actor.user, actor.workspace)).value?.cardDensity || '';
  } catch {
    /* Optional layout metadata. */
  }
  const inherited = S.prefs.density === 'compact' ? T('Compact', 'Компактная') : T('Comfortable', 'Свободная');
  const noteDensity = ['compact', 'comfortable'].includes(density)
    ? T('Local note spacing: ', 'Своя плотность заметок: ') + (density === 'compact' ? T('Compact', 'Компактная') : T('Comfortable', 'Свободная'))
    : T('Notes inherit settings density: ', 'Заметки наследуют общую плотность: ') + inherited;
  const result = S.ui.localViewReset?.scope === scope() ? S.ui.localViewReset : null;
  const notice = result
    ? result.ok
      ? T('View settings reset.', 'Настройки вида сброшены.')
      : result.partial
        ? T(
            'Some local options could not be restored. Reload and review the view.',
            'Часть локальных настроек не удалось восстановить. Обновите страницу и проверьте вид.',
          )
        : T(
            'The local view could not be reset. Browser storage may be unavailable.',
            'Не удалось сбросить локальный вид. Возможно, хранилище браузера недоступно.',
          )
    : '';
  const rows = [
    [
      'knowledge',
      T('Knowledge base', 'База знаний'),
      T('Cards, columns and folder panel. Named searches remain.', 'Карточки, колонки и панель папок. Именованные поиски сохраняются.'),
    ],
    ['files', T('Files', 'Файлы'), T('Layout and folder display on this device.', 'Компоновка и отображение папок на этом устройстве.')],
    [
      'other',
      T('Other views', 'Другие виды'),
      T(
        'Catalog filters, calendar modes and diagram tools. Named views remain.',
        'Фильтры каталогов, режимы календаря и инструменты диаграмм. Именованные виды сохраняются.',
      ),
    ],
    ['disclosures', T('Expanded blocks', 'Раскрытые блоки'), T('Collapse secondary panels in this tab.', 'Свернуть дополнительные панели в этой вкладке.')],
  ];
  return `<details class="sblock view-storage-settings" ${disclosureAttributes('view-storage')} translate="no"><summary>${T('Where view settings are saved', 'Где сохраняются настройки вида')}</summary><dl><dt>${T('Account · current workspace', 'Аккаунт · текущее пространство')}</dt><dd>${T('Theme, density, menu and named diagram views sync across your devices.', 'Тема, плотность, меню и именованные виды диаграмм синхронизируются между устройствами.')}</dd><dt>${T('This device · current workspace', 'Это устройство · текущее пространство')}</dt><dd>${T('Panel sizes, local note spacing, columns and catalog layouts.', 'Размеры панелей, своя плотность заметок, колонки и компоновка каталогов.')} ${noteDensity}</dd><dt>${T('This tab', 'Эта вкладка')}</dt><dd>${T('Open panels and folder history. File filters also survive a refresh of this tab.', 'Открытые панели и история папок. Фильтры файлов сохраняются и после обновления этой вкладки.')}</dd></dl><div class="view-reset-rows">${rows.map(([section, title, description]) => `<div class="view-reset-row"><div><strong>${title}</strong><p class="hint">${description}</p></div><button class="btn btn-secondary btn-sm" data-a="resetLocalView" data-section="${section}" aria-label="${T('Reset: ', 'Сбросить: ') + title}">${T('Reset', 'Сбросить')}</button></div>`).join('')}</div>${notice ? `<p class="hint" role="status">${notice}</p>` : ''}</details>`;
}
A.resetLocalView = async el => {
  const section = el.dataset.section,
    owner = identity(),
    captured = scope();
  const allowed = () => captured === scope() && S.ui.route === 'settings' && (S.ui.params.sec || S.ui.settings || 'appearance') === 'appearance';
  if (!['knowledge', 'files', 'other', 'disclosures'].includes(section) || !allowed()) return;
  let ok = false,
    partial = false;
  try {
    if (section === 'disclosures') resetDisclosures('view-storage');
    else {
      const { resetDeviceViews } = await import('../shared/device-view-reset.js');
      if (!allowed()) return;
      resetDeviceViews(localStorage, owner.user, owner.workspace, section);
      window.dispatchEvent(new CustomEvent('smena:device-view-reset', { detail: { ...owner, section } }));
    }
    ok = true;
  } catch (error) {
    partial = !!error.rollbackFailed;
  }
  if (allowed()) {
    S.ui.localViewReset = { scope: captured, ok, partial };
    render();
  }
};
