import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { shortcutPresentation } from '../shared/shortcut-presentation.js';
export function shortcut(input) {
  const { keys, separator } = shortcutPresentation(input);
  const join = separator === 'then' ? t('then') : separator;
  return `<span class="shortcut-reference-keys" aria-label="${esc(keys.join(' ' + join + ' '))}">${keys.map((key, i) => `${i ? `<span class="shortcut-separator" aria-hidden="true">${esc(join)}</span>` : ''}<kbd aria-hidden="true">${esc(key)}</kbd>`).join('')}</span>`;
}
