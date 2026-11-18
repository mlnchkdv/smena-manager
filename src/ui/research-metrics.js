import { esc } from '../core/utils.js';
import { rw } from './research-copy.js';
import { researchDisclosure } from './research-evidence.js';

export function researchMetricsHtml(record) {
  const metrics = record.data.metrics || [];
  if (!metrics.length) return '';
  return `<section><h3>${rw('Measurements', 'Измерения')}</h3><dl class="research-properties">${metrics.map(metric => `<div><dt>${esc(metric.key)}<small>${esc(metric.scope || '')} · ${esc(metric.origin === 'author' ? rw('Author claim', 'Утверждение автора') : rw('Team measurement', 'Измерение команды'))}</small></dt><dd>${metric.status === 'measured' ? esc(String(metric.value) + ' ' + metric.unit) + ` · n=${esc(metric.n)} · ${esc(metric.aggregation)}` : esc(metric.reason || rw('Not measured', 'Не измерено'))}</dd></div>`).join('')}</dl></section>`;
}

export function researchMetricsForm(m) {
  const metrics = m.record.data.metrics || [];
  const field = (i, key, label, value, type = 'text') =>
    `<label class="field">${label}<input class="input" data-in="researchMetric" data-index="${i}" data-field="${key}" type="${type}" value="${esc(value ?? '')}" ${type === 'number' ? 'step="any"' : ''} maxlength="180"></label>`;
  const select = (i, key, label, value, options) =>
    `<label class="field">${label}<select class="select" data-in="researchMetric" data-index="${i}" data-field="${key}">${options.map(([id, text]) => `<option value="${esc(id)}" ${value === id ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  return `<details ${researchDisclosure(m, 'metrics')}><summary>${rw('Measurements', 'Измерения')} · ${metrics.length}</summary><p class="hint">${rw('Keep absent values missing and explain why. Team measurements require a protocol and attached evidence.', 'Сохраняйте отсутствующие значения как «не измерено» и указывайте причину. Измерениям команды нужны протокол и прикреплённое доказательство.')}</p><div class="research-form-section">${metrics
    .map(
      (metric, i) =>
        `<details ${researchDisclosure(m, 'metric:' + i)}><summary>${esc(metric.key)} · ${metric.status === 'measured' ? esc(String(metric.value) + ' ' + metric.unit) : rw('Not measured', 'Не измерено')}</summary><div class="research-form-section">${field(i, 'key', rw('Metric', 'Метрика'), metric.key)}${field(i, 'unit', rw('Unit', 'Единица'), metric.unit)}${select(
          i,
          'status',
          rw('Measurement status', 'Статус измерения'),
          metric.status,
          [
            ['missing', rw('Not measured', 'Не измерено')],
            ['measured', rw('Measured', 'Измерено')],
            ['not_applicable', rw('Not applicable', 'Не применимо')],
          ],
        )}${
          metric.status === 'measured'
            ? field(i, 'value', rw('Value (zero is a real measurement)', 'Значение (ноль — реальное измерение)'), metric.value, 'number') +
              field(i, 'scope', rw('Evaluation scope / scene', 'Область оценки / сцена'), metric.scope || 'scene') +
              field(i, 'n', rw('Sample count', 'Число образцов'), metric.n, 'number') +
              field(i, 'aggregation', rw('Aggregation, e.g. mean or median', 'Агрегация, например mean или median'), metric.aggregation || 'mean') +
              select(i, 'evidenceId', rw('Evidence file', 'Файл-основание'), metric.evidenceId || '', [
                ['', rw('Choose attached evidence', 'Выберите прикреплённый файл')],
                ...(m.record.data.artifacts || []).map(item => [
                  item.fileId,
                  item.name || (m.files || []).find(file => file.id === item.fileId)?.name || item.fileId,
                ]),
              ]) +
              select(i, 'origin', rw('Origin', 'Происхождение'), metric.origin || 'team', [
                ['team', rw('Team measurement', 'Измерение команды')],
                ['author', rw('Source author claim', 'Утверждение автора источника')],
              ])
            : field(i, 'reason', rw('Why is the value missing?', 'Почему значения нет?'), metric.reason)
        }<button class="btn btn-ghost" data-a="researchRemoveMetric" data-index="${i}">${rw('Remove metric', 'Убрать метрику')}</button></div></details>`,
    )
    .join('')}<button class="btn btn-secondary" data-a="researchAddMetric">${rw('Add metric', 'Добавить метрику')}</button></div></details>`;
}
