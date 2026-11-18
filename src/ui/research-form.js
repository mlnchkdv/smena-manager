import { esc } from '../core/utils.js';
import { rw, researchKind, researchProfile } from './research-copy.js';
import { RESEARCH_KINDS, RESEARCH_PROFILES } from '../shared/research.js';
import { researchEvidenceForm } from './research-evidence.js';
import { researchMetricsForm } from './research-metrics.js';

const field = (key, label, value = '', type = 'text') =>
  `<label class="field">${esc(label)}<input class="input" type="${type}" data-in="researchField" data-field="${key}" value="${esc(value ?? '')}" maxlength="${key === 'title' ? 240 : 8000}"></label>`;
const select = (key, label, value, options, blank = true) =>
  `<label class="field">${esc(label)}<select class="select" data-in="researchField" data-field="${key}">${blank ? `<option value="">${rw('Choose…', 'Выберите…')}</option>` : ''}${options.map(([id, title]) => `<option value="${esc(id)}" ${value === id ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></label>`;
const json = (key, label, value) =>
  `<label class="field">${esc(label)}<textarea class="textarea research-json" rows="4" data-in="researchRaw" data-field="${key}" spellcheck="false">${esc(value || '{}')}</textarea></label>`;
export function researchFormFields(m) {
  const { record } = m,
    data = record.data,
    kind = record.kind;
  const references = (k, key, label) =>
    select(
      key,
      label,
      data[key],
      (m.references || []).filter(row => row.kind === k).map(row => [row.id, row.title]),
    );
  const template = !m.original
    ? `<label class="field">${rw('Template', 'Шаблон')}<select class="select" data-in="researchTemplate">${RESEARCH_KINDS.map(id => `<option value="${id}" ${kind === id ? 'selected' : ''}>${esc(researchKind(id))}</option>`).join('')}</select></label>`
    : '';
  let fields = '';
  if (kind === 'experiment')
    fields =
      field('hypothesis', rw('What are we testing?', 'Что проверяем?'), data.hypothesis) +
      field('baseline', rw('Baseline', 'С чем сравниваем?'), data.baseline) +
      field('factor', rw('What changes?', 'Что изменяем?'), data.factor) +
      field('criterion', rw('Success criterion agreed before results', 'Критерий успеха до получения результата'), data.criterion);
  if (kind === 'source')
    fields =
      field('sourceUrl', rw('Primary source URL', 'Адрес первоисточника'), data.sourceUrl, 'url') +
      field('sourceVersion', rw('Paper / repository version', 'Версия статьи / репозитория'), data.sourceVersion) +
      select('readDepth', rw('Reading depth', 'Глубина чтения'), data.readDepth, [
        ['not_read', rw('Not read', 'Не прочитано')],
        ['abstract', rw('Abstract only', 'Только аннотация')],
        ['full', rw('Full text', 'Полный текст')],
        ['supplement', rw('Text and supplement', 'Текст и дополнения')],
      ]) +
      field('license', rw('License / rights', 'Лицензия / права'), data.license);
  if (kind === 'dataset')
    fields =
      field('sourceVersion', rw('Dataset version label', 'Обозначение версии датасета'), data.sourceVersion) +
      field('split', rw('Split rule / manifest ID', 'Правило split / ID manifest'), data.split) +
      field('license', rw('License / rights', 'Лицензия / права'), data.license) +
      json('manifest', rw('Dataset manifest (JSON)', 'Manifest датасета (JSON)'), m.rawManifest);
  if (kind === 'protocol')
    fields =
      field('split', rw('Evaluation split', 'Разбиение оценки'), data.split) +
      field('evaluationResolution', rw('Evaluation resolution', 'Разрешение оценки'), data.evaluationResolution) +
      json('config', rw('Metric definitions and evaluation settings (JSON)', 'Определения метрик и настройки оценки (JSON)'), m.rawConfig);
  if (kind === 'run')
    fields =
      references('experiment', 'experimentId', rw('Experiment', 'Эксперимент')) +
      select(
        'profile',
        rw('Run profile', 'Профиль запуска'),
        data.profile,
        RESEARCH_PROFILES.map(id => [id, researchProfile(id)]),
        false,
      ) +
      `<details ${m.original && data.state !== 'planned' ? '' : 'open'}><summary>${rw('Inputs and reproducibility', 'Входы и воспроизводимость')}</summary><div class="research-form-section">${references('dataset', 'datasetId', rw('Dataset version', 'Версия датасета'))}${references('protocol', 'protocolId', rw('Evaluation protocol', 'Протокол оценки'))}${field('codeRevision', rw('Code commit / release', 'Commit / версия кода'), data.codeRevision)}${field('weightsRevision', rw('Weights revision / SHA-256, if applicable', 'Версия / SHA-256 весов, если применимо'), data.weightsRevision)}${field('seed', rw('Seed, if applicable', 'Seed, если применимо'), data.seed, 'number')}${field('hardware', rw('Hardware and environment', 'Оборудование и среда'), typeof data.hardware === 'string' ? data.hardware : '')}${json('config', rw('Effective configuration (JSON)', 'Эффективная конфигурация (JSON)'), m.rawConfig)}</div></details>${m.references?.length >= 100 ? `<p class="hint">${rw('The first 100 related records are listed. Use the project search to find older material.', 'Показаны первые 100 связанных записей. Найдите старые материалы поиском проекта.')}</p>` : ''}`;
  if (kind === 'run' && m.original && data.state !== 'planned') fields = `<fieldset disabled>${fields}</fieldset>`;
  if (['failed', 'cancelled'].includes(m.nextState || data.state))
    fields += field('reason', rw('Why did this run stop?', 'Почему остановлен запуск?'), data.reason);
  if (m.nextState) fields = `<p role="status">${rw('Save to change the state to', 'Сохранение изменит состояние на')}: ${esc(m.nextState)}</p>` + fields;
  if (kind === 'review')
    fields =
      field('periodFrom', rw('Reporting period starts', 'Начало отчётного периода'), data.periodFrom, 'date') +
      field('periodTo', rw('Period ends, exclusive', 'Конец периода, не включительно'), data.periodTo, 'date') +
      field('timeZone', rw('Report time zone', 'Часовой пояс отчёта'), data.timeZone) +
      select('coverage', rw('Actual coverage', 'Фактический охват'), data.coverage, [
        ['not_run', rw('Not checked', 'Не проверено')],
        ['partial', rw('Partial', 'Частичный')],
        ['complete', rw('Complete for declared sources', 'Полный по заявленным источникам')],
        ['blocked', rw('Blocked', 'Проверка заблокирована')],
      ]);
  if (kind === 'article' || kind === 'handoff')
    fields =
      references('experiment', 'experimentId', rw('Related experiment', 'Связанный эксперимент')) +
      field('conclusion', rw('Verified conclusion / current state', 'Проверенный вывод / текущее состояние'), data.conclusion) +
      field('nextStep', rw('Next action', 'Следующий шаг'), data.nextStep);
  if (kind === 'run') fields += researchMetricsForm(m);
  fields += researchEvidenceForm(m);
  return `${template}${field('title', rw('Title', 'Название'), record.title)}${fields}<label class="field">${rw('Notes', 'Описание')}<textarea class="textarea" rows="6" data-in="researchField" data-field="body" maxlength="64000">${esc(record.body || '')}</textarea></label>${m.original && kind === 'run' && ['completed', 'failed', 'cancelled'].includes(data.state) ? field('amendment', rw('Reason for this correction', 'Причина этого исправления'), data.amendment) : ''}`;
}
