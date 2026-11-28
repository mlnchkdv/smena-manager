import { isRussian } from '../core/i18n.js';
const narrow = matchMedia('(max-width: 640px)');
export function updateCompactSearch() {
  for (const field of document.querySelectorAll('#bookmark-search,#knowledge-search,.toolbar input[data-in="viewQ"]')) {
    const wrap = field.parentElement;
    const bar = wrap.parentElement;
    field.dataset.fullPlaceholder ??= field.placeholder;
    field.placeholder = narrow.matches ? (isRussian() ? 'Поиск' : 'Search') : field.dataset.fullPlaceholder;
    wrap.classList.add('compact-search-field');
    bar.classList.add('compact-search-bar');
    if (!wrap.querySelector('.compact-search-done')) {
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'btn btn-ghost compact-search-done';
      done.textContent = isRussian() ? 'Готово' : 'Done';
      done.addEventListener('click', () => {
        done.blur();
      });
      wrap.append(done);
    }
  }
}
narrow.addEventListener('change', updateCompactSearch);
