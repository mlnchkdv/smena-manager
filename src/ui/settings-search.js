import { searchSettings } from '../shared/settings-search.js';
import { A, IN } from '../actions/actions.js';
import { S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { isRussian, t } from '../core/i18n.js';
import { go, render } from '../shell/render.js';
const copy = (en, ru) => (isRussian() ? ru : en);
IN.settingsQuery = el => {
  S.ui.settingsQuery = el.value.slice(0, 120);
  render();
};
A.clearSettingsQuery = el => {
  const inputId = el.closest('.settings-search')?.querySelector('input')?.id;
  S.ui.settingsQuery = '';
  render();
  if (inputId) document.getElementById(inputId)?.focus({ preventScroll: true });
};
A.findSetting = el => {
  S.ui.settingsQuery = '';
  go('settings', { sec: el.dataset.sec });
  requestAnimationFrame(() => document.querySelector('.set-in h1')?.focus({ preventScroll: true }));
};
export function settingsSearch(navigation, id) {
  const query = S.ui.settingsQuery || '';
  const rows = searchSettings(navigation, query, t);
  const scope = key =>
    ['workspace', 'data-transfer', 'members', 'teams', 'permissions'].includes(key)
      ? copy('Workspace', 'Пространство')
      : key === 'security'
        ? copy('Account', 'Аккаунт')
        : key === 'projects'
          ? copy('Personal and shared', 'Личное и общее')
          : copy('Personal', 'Личное');
  return `<div class="settings-search"><label class="sr" for="${id}">${copy('Search settings', 'Поиск по настройкам')}</label><input id="${id}" class="input" type="search" data-in="settingsQuery" value="${esc(query)}" placeholder="${copy('Search settings', 'Поиск по настройкам')}" aria-controls="${id}-results">${query ? `<button class="btn btn-ghost btn-sm" data-a="clearSettingsQuery" translate="no">${copy('Clear search', 'Очистить поиск')}</button><div id="${id}-results" class="settings-search-results" role="region" aria-label="${copy('Settings results', 'Найденные настройки')}"><p class="hint" role="status" translate="no">${rows.length ? copy('Results', 'Найдено') + ': ' + rows.length : copy('No settings found. Try another word.', 'Настройки не найдены. Попробуйте другое слово.')}</p>${rows.map(row => `<button class="settings-search-result" data-a="findSetting" data-sec="${row.key}"><strong>${esc(t(row.name))}</strong><span translate="no">${esc(t(row.group))} · ${scope(row.key)}</span></button>`).join('')}</div>` : ''}</div>`;
}
