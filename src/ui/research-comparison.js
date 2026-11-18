import { esc } from '../core/utils.js';
import { rw } from './research-copy.js';
import { compareResearchRuns } from '../shared/research-comparison.js';

const reason = code =>
  ({
    scope: rw('Different projects', 'Разные проекты'),
    state: rw('Both runs must be completed', 'Оба запуска должны быть выполнены'),
    profile: rw('Different profiles', 'Разные профили'),
    experimentId: rw('Different experiments', 'Разные эксперименты'),
    datasetVersion: rw('Different or unspecified dataset versions', 'Разные или неуказанные версии датасета'),
    protocolVersion: rw('Different or unspecified evaluation protocols', 'Разные или неуказанные протоколы оценки'),
    conditions: rw('Evaluation conditions differ', 'Условия оценки различаются'),
    missing: rw('Measurement missing', 'Нет измерения'),
    sample: rw('Sample count differs', 'Разное число образцов'),
    author: rw('Author claim: kept separate', 'Утверждение автора: отдельно'),
    hardware: rw('Different hardware', 'Разное оборудование'),
  })[code] || code;
const value = metric => (metric?.status === 'measured' ? esc(String(metric.value) + ' ' + metric.unit) : esc(metric?.reason || rw('Missing', 'Нет данных')));
export function researchComparisonHtml(m) {
  const selected = m.records || [];
  return `<div class="modal-b research-form" translate="no"><p>${rw('Select two to four runs. The first selected run is the baseline.', 'Выберите от двух до четырёх запусков. Первый выбранный — базовый.')}</p><div class="research-form-section">${m.rows.map(row => `<button class="btn btn-secondary" data-a="researchPickCompare" data-id="${esc(row.id)}" aria-pressed="${m.ids.includes(row.id)}">${esc(row.title)}${m.ids.includes(row.id) ? ' ✓' : ''}</button>`).join('') || `<p>${rw('No runs yet. Plan a run from an experiment first.', 'Запусков пока нет. Сначала запланируйте запуск из эксперимента.')}</p>`}</div>${m.error ? `<p role="alert">${esc(m.error)}</p>` : ''}${m.busy ? `<p role="status">${rw('Loading runs…', 'Загружаем запуски…')}</p>` : ''}${selected
    .slice(1)
    .map(candidate => {
      const comparison = compareResearchRuns(selected[0], candidate);
      return `<section><h3>${esc(selected[0].title)} → ${esc(candidate.title)}</h3><p>${comparison.compatible ? rw('Same evaluation conditions. Differences do not prove causation.', 'Одинаковые условия оценки. Различия не доказывают причинность.') : comparison.reasons.map(reason).map(esc).join(' · ')}</p>${comparison.metrics.map(metric => `<dl class="research-properties"><div><dt>${esc(metric.key)} · ${esc(metric.scope || '')}</dt><dd>${value(metric.before)} → ${value(metric.after)}<br>${metric.comparable ? rw('Difference', 'Разница') + ': ' + esc(String(metric.delta) + ' ' + metric.unit) : esc(reason(metric.reason))}</dd></div></dl>`).join('')}<details><summary>${rw('Configuration differences', 'Различия конфигурации')} · ${comparison.configDiff.length}</summary><pre class="research-code">${esc(JSON.stringify(comparison.configDiff, null, 2))}</pre></details></section>`;
    })
    .join('')}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${rw('Close', 'Закрыть')}</button></div>`;
}
