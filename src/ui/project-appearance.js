import { A, IN } from '../actions/actions.js';
import { PCOLORS } from '../core/constants.js';
import { S, pColor } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { isRussian, t } from '../core/i18n.js';
import { render } from '../shell/render.js';
import { colorPalette } from './color-palette.js';
import { normalizeProjectColor } from '../shared/project-appearance.js';

const ICONS = [
  ['globe', 'Globe', 'Глобус'],
  ['smartphone', 'Phone', 'Телефон'],
  ['megaphone', 'Megaphone', 'Мегафон'],
  ['rocket', 'Rocket', 'Ракета'],
  ['component', 'Components', 'Компоненты'],
  ['building-2', 'Office', 'Офис'],
  ['layout-grid', 'Grid', 'Сетка'],
  ['palette', 'Palette', 'Палитра'],
  ['code', 'Code', 'Код'],
  ['briefcase', 'Briefcase', 'Портфель'],
  ['target', 'Target', 'Цель'],
  ['layers', 'Layers', 'Слои'],
  ['zap', 'Lightning', 'Молния'],
  ['heart', 'Heart', 'Сердце'],
  ['folder', 'Folder', 'Папка'],
  ['sparkles', 'Sparkles', 'Искры'],
  ['server', 'Server', 'Сервер'],
  ['database', 'Database', 'База данных'],
  ['bot', 'Robot', 'Робот'],
  ['shield', 'Shield', 'Щит'],
  ['upload-cloud', 'Upload', 'Загрузка'],
  ['network', 'Network', 'Сеть'],
  ['chart-gantt', 'Chart', 'График'],
  ['calendar', 'Calendar', 'Календарь'],
  ['list-checks', 'Tasks', 'Задачи'],
  ['library', 'Library', 'Библиотека'],
  ['files', 'Files', 'Файлы'],
  ['link', 'Link', 'Ссылка'],
  ['search', 'Search', 'Поиск'],
  ['settings', 'Settings', 'Настройки'],
  ['users', 'People', 'Люди'],
  ['graduation-cap', 'Education', 'Образование'],
  ['crown', 'Crown', 'Корона'],
  ['flag', 'Flag', 'Флаг'],
  ['compass', 'Compass', 'Компас'],
  ['navigation', 'Navigation', 'Навигация'],
  ['map-pin', 'Location', 'Место'],
  ['lightbulb', 'Idea', 'Идея'],
  ['flask-conical', 'Research', 'Исследования'],
  ['wrench', 'Tools', 'Инструменты'],
  ['hammer', 'Hammer', 'Молоток'],
  ['leaf', 'Leaf', 'Лист'],
  ['sun', 'Sun', 'Солнце'],
  ['moon', 'Moon', 'Луна'],
  ['cookie', 'Cookie', 'Печенье'],
  ['shopping-bag', 'Shopping', 'Покупки'],
  ['box', 'Box', 'Коробка'],
  ['truck', 'Delivery', 'Доставка'],
  ['gift', 'Gift', 'Подарок'],
  ['key-round', 'Key', 'Ключ'],
  ['lock', 'Lock', 'Замок'],
  ['terminal', 'Terminal', 'Терминал'],
  ['monitor-smartphone', 'Devices', 'Устройства'],
  ['monitor', 'Monitor', 'Монитор'],
  ['message-square', 'Message', 'Сообщение'],
  ['mail', 'Mail', 'Почта'],
  ['video', 'Video', 'Видео'],
  ['camera', 'Camera', 'Камера'],
  ['music', 'Music', 'Музыка'],
  ['headphones', 'Headphones', 'Наушники'],
  ['gamepad-2', 'Games', 'Игры'],
  ['house', 'House', 'Дом'],
  ['activity', 'Activity', 'Активность'],
  ['infinity', 'Infinity', 'Бесконечность'],
];
const EXTRA_COLORS = [
  ['#E06C5F', 'Coral', 'Коралловый'],
  ['#D97732', 'Orange', 'Оранжевый'],
  ['#D4A72C', 'Gold', 'Золотой'],
  ['#A3A537', 'Olive', 'Оливковый'],
  ['#78A541', 'Lime', 'Лаймовый'],
  ['#239B75', 'Emerald', 'Изумрудный'],
  ['#43A6A2', 'Aqua', 'Аквамарин'],
  ['#3199B3', 'Cyan', 'Голубой'],
  ['#5CA9D5', 'Sky', 'Небесный'],
  ['#7486C9', 'Periwinkle', 'Барвинковый'],
  ['#AD78C4', 'Lavender', 'Лавандовый'],
  ['#CB6BA5', 'Pink', 'Розовый'],
  ['#B34D4D', 'Red', 'Красный'],
  ['#9A735A', 'Brown', 'Коричневый'],
  ['#7B786C', 'Stone', 'Каменный'],
  ['#393D45', 'Graphite', 'Графитовый'],
];

export function projectAppearance(form) {
  const query = (S.ui.projectIconQuery || '').trim().toLocaleLowerCase('ru-RU');
  const icons = ICONS.filter(icon => icon.join(' ').toLocaleLowerCase('ru-RU').includes(query));
  const focused = icons.some(([id]) => id === form.icon) ? form.icon : icons[0]?.[0];
  const colors = [...Object.entries(PCOLORS).map(([id, color]) => [id, id, color]), ...EXTRA_COLORS.map(([hex, en, ru]) => [hex, isRussian() ? ru : en, hex])];
  return `<section class="project-appearance" aria-label="Project appearance"><div class="project-icon-library"><label class="label" for="project-icon-search">Icon</label><div class="project-icon-search"><input class="input" id="project-icon-search" data-in="projectIconQuery" value="${esc(S.ui.projectIconQuery || '')}" placeholder="Search icons" aria-label="Search icons">${query ? `<button type="button" class="ibtn" data-a="clearProjectIconQuery" aria-label="Clear search">${ic('x', 14)}</button>` : ''}</div><div class="iconpick project-icon-grid" role="radiogroup" aria-label="Icon">${icons.map(([id, en, ru]) => `<button type="button" role="radio" tabindex="${id === focused ? 0 : -1}" aria-checked="${form.icon === id}" class="project-icon-choice ${form.icon === id ? 'on' : ''}" data-a="pformSet" data-f="icon" data-v="${id}" aria-label="${esc(isRussian() ? ru : en)}" title="${esc(isRussian() ? ru : en)}">${ic(id, 18)}</button>`).join('') || '<p class="hint">No matching icons.</p>'}</div><span class="hint num" role="status">${icons.length} / ${ICONS.length}</span></div><div class="project-color-library"><span class="label">Color</span>${colorPalette({ label: 'Color', value: form.color, colors, action: 'projectColor' })}<div class="project-custom-color"><label class="project-color-input" for="project-custom-color"><span class="sr">Custom color</span><input type="color" id="project-custom-color" data-in="projectCustomColor" value="${pColor(form)}" aria-label="Custom color"></label><label class="sr" for="project-color-hex">HEX color</label><input class="input mono" id="project-color-hex" data-in="projectColorHex" value="${esc(form.colorDraft || pColor(form))}" maxlength="7" spellcheck="false" aria-label="HEX color" aria-invalid="${!!S.ui.errors.projectColor}" ${S.ui.errors.projectColor ? 'aria-describedby="project-color-error"' : ''}></div>${S.ui.errors.projectColor ? `<span class="err" id="project-color-error">${esc(t(S.ui.errors.projectColor))}</span>` : ''}</div></section>`;
}

IN.projectIconQuery = el => {
  S.ui.projectIconQuery = el.value;
  render();
};
A.clearProjectIconQuery = () => {
  S.ui.projectIconQuery = '';
  render();
  document.getElementById('project-icon-search')?.focus();
};
A.projectColor = el => A.pformSet({ dataset: { f: 'color', v: normalizeProjectColor(el.dataset.v) || el.dataset.v } });
IN.projectCustomColor = el => A.projectColor({ dataset: { v: el.value } });
IN.projectColorHex = el => {
  S.ui.pform.colorDraft = el.value;
  if (/^#[\da-f]{6}$/i.test(el.value)) A.projectColor({ dataset: { v: el.value.toUpperCase() } });
};

export function validateProjectAppearance(form) {
  const value = document.getElementById('project-color-hex')?.value || form.colorDraft || pColor(form);
  const hex = normalizeProjectColor(value);
  if (!hex) {
    S.ui.errors.projectColor = 'Use a HEX color such as #5A67D8.';
    render();
    document.getElementById('project-color-hex')?.focus();
    return false;
  }
  if (hex !== pColor(form).toUpperCase()) form.color = hex;
  return true;
}

document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const current = event.target.closest?.('.project-icon-choice');
  if (!current) return;
  const items = [...current.closest('.project-icon-grid').querySelectorAll('button')];
  const index = items.indexOf(current);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? items.length - 1 : 1)) % items.length;
  event.preventDefault();
  items[next].focus();
  items[next].click();
});

// Keep validation in the lazily loaded project form rather than the startup bundle.
A.validateProjectAppearance = validateProjectAppearance;
