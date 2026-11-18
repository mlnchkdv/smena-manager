import { esc } from '../core/utils.js';
import { rw } from './research-copy.js';
import { compareResearchRuns } from '../shared/research-comparison.js';

const reason = code =>
  ({
    scope: rw('Different projects', 'Разные проекты'),
    state: rw('Both runs must be completed', 'Оба запуска должны быть выполнены'),
    profile: rw('Different profiles', 'Разные профили'),
    experimentId: rw('Different experiments', 'Разные эксперименты'),
    datasetVersion: rw('Dataset versions differ', 'Версии датасета различаются'),
    protocolVersion: rw('Protocol versions differ', 'Версии протокола различаются'),
    conditions: rw('Evaluation conditions differ', 'Условия оценки различаются'),
    missing: rw('Measurement missing', 'Нет измерения'),
    sample: rw('Sample count differs', 'Разное число образцов'),
    author: rw('Author claim: kept separate', 'Утверждение автора: отдельно'),
    hardware: rw('Different hardware', 'Разное оборудование'),
  })[code] || code;
const value = metric => (metric?.status === 'measured' ? esc(String(metric.value) + ' ' + metric.unit) : esc(metric?.reason || rw('Missing', 'Нет данных')));
const configValue = value => esc(value == null ? '—' : typeof value === 'string' ? value : JSON.stringify(value));

function comparisonReason(code, base, candidate) {
  if (!['datasetVersion', 'protocolVersion'].includes(code)) return reason(code);
  const missing = [base, candidate].filter(run => !run.data[code]?.ref?.sha256);
  if (!missing.length) return reason(code);
  const label = code === 'datasetVersion' ? rw('Dataset version', 'Версия датасета') : rw('Protocol version', 'Версия протокола');
  return `${label} · ${missing.every(run => run.data.state === 'planned') ? rw('Recorded when the run starts', 'Будет зафиксирована при запуске') : rw('Version was not recorded', 'Версия не зафиксирована')}`;
}

export function researchComparisonHtml(m) {
  const [base, ...candidates] = m.ids.map(id => m.records.get(id));
  const loading = (m.rows === null && !m.error) || m.ids.some(id => m.requests.has(id));
  const options = (m.rows || [])
    .map(row => {
      const index = m.ids.indexOf(row.id);
      return `<button class="btn btn-secondary" data-a="researchPickCompare" data-id="${esc(row.id)}" aria-pressed="${index !== -1}" ${index === -1 && m.ids.length === 4 ? 'disabled' : ''}>${index === -1 ? '' : `${String.fromCharCode(65 + index)} · `}${esc(row.title)}</button>`;
    })
    .join('');
  const breakdown = !base
    ? ''
    : candidates
        .map((candidate, index) => {
          if (!candidate) return '';
          const comparison = compareResearchRuns(base, candidate);
          const reasons = comparison.reasons.map(code => comparisonReason(code, base, candidate));
          return `<section><h3>A · ${esc(base.title)} → ${String.fromCharCode(66 + index)} · ${esc(candidate.title)}</h3><p>${comparison.compatible ? rw('Same evaluation conditions. Differences do not prove causation.', 'Одинаковые условия оценки. Различия не доказывают причинность.') : reasons.map(esc).join(' · ')}</p>${comparison.metrics.map(metric => `<dl class="research-properties"><div><dt>${esc(metric.key)} · ${esc(metric.scope || '')}</dt><dd>${value(metric.before)} → ${value(metric.after)}<br>${metric.comparable ? rw('Difference', 'Разница') + ': ' + esc(String(metric.delta) + ' ' + metric.unit) : esc(reason(metric.reason))}</dd></div></dl>`).join('')}${comparison.configDiff.length ? `<details open><summary>${rw('Configuration differences', 'Различия конфигурации')} · ${comparison.configDiff.length}</summary><dl class="research-properties">${comparison.configDiff.map(diff => `<div><dt><code>${esc(diff.key)}</code></dt><dd>${configValue(diff.before)} → ${configValue(diff.after)}</dd></div>`).join('')}</dl></details>` : ''}</section>`;
        })
        .join('');
  return `<div class="modal-b research-form" translate="no"><p>${rw('Select two to four runs. The first selected run is the baseline.', 'Выберите от двух до четырёх запусков. Первый выбранный — базовый.')}</p><div class="research-form-section">${options}${m.rows?.length === 0 ? `<p>${rw('No runs yet. Plan a run from an experiment first.', 'Запусков пока нет. Сначала запланируйте запуск из эксперимента.')}</p>` : ''}</div>${m.error ? `<div role="alert">${esc(m.error)} <button class="btn btn-secondary" data-a="researchRetryCompare">${rw('Retry', 'Повторить')}</button></div>` : ''}${loading ? `<p role="status">${rw('Loading runs…', 'Загружаем запуски…')}</p>` : ''}${breakdown}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${rw('Close', 'Закрыть')}</button></div>`;
}
