import { isRussian, t } from '../core/i18n.js';
import { esc } from '../core/utils.js';
import { RELATION_TYPES } from '../shared/relations.js';
import { disclosureAttributes } from './disclosure.js';

export function relationRollupView(rollup, labels, key) {
  if (!rollup) return '';
  const ru = isRussian();
  const origin = { manual: ru ? 'Вручную' : 'Manual', wiki: ru ? 'Из текста' : 'From text', automatic: ru ? 'Из проекта или холста' : 'Project or canvas' };
  const counts = rows => rows.map(row => `<div><dt>${esc(row.label)}</dt><dd>${row.count}</dd></div>`).join('');
  return `<details class="relation-rollup" ${disclosureAttributes('relations-rollup:' + key)}><summary translate="no">${ru ? 'Сводка связей' : 'Connection summary'} · ${rollup.coverage.complete ? '' : '≥'}${rollup.total}</summary><div class="relation-rollup-body" translate="no"><dl>${counts(rollup.kinds.map(row => ({ ...row, label: t(labels[row.key] || row.key) })))}</dl>${rollup.types.length ? `<p class="hint">${ru ? 'По типу связи' : 'By connection type'}</p><dl>${counts(rollup.types.map(row => ({ ...row, label: t(RELATION_TYPES[row.key] || row.key) })))}</dl>` : ''}<p class="hint">${ru ? 'Прямые связи с доступными материалами, включая архив. Каждый материал считается один раз; строки типов могут пересекаться.' : 'Direct links to accessible materials, including archived items. Each material is counted once; type rows can overlap.'}</p>${rollup.origins.length ? `<p class="hint">${ru ? 'Происхождение' : 'Provenance'}: ${rollup.origins.map(row => `${esc(origin[row.key] || row.key)} ${row.count}`).join(' · ')}</p>` : ''}${rollup.author?.name ? `<p class="hint">${ru ? 'Автор материала' : 'Material author'}: <span>${esc(rollup.author.name)}</span></p>` : ''}${!rollup.coverage.complete ? `<p class="hint relation-coverage" role="status">${ru ? 'Ссылки в некоторых старых или очень больших заметках ещё не полностью проиндексированы. Сводка показывает известные связи, а не полный итог.' : 'Links in some older or very dense notes are not fully indexed. This summary shows known connections, not a complete total.'}</p>` : ''}</div></details>`;
}
