import { RESEARCH_LIMITS, validResearchMetric } from './research.js';

export const RESEARCH_TEMPLATE_VERSION = 1;
export const RESEARCH_TEMPLATE_SECTIONS = Object.freeze({
  observation: [
    ['Observation', 'Наблюдение'],
    ['Evidence or source', 'Доказательство или источник'],
    ['Question to check', 'Вопрос для проверки'],
  ],
  source: [
    ['What the authors claim', 'Что заявляют авторы'],
    ['What we checked', 'Что проверили мы'],
    ['Limits and project relevance', 'Ограничения и значение для проекта'],
  ],
  dataset: [
    ['Origin and rights', 'Происхождение и права'],
    ['Preparation', 'Подготовка'],
    ['Train / validation / test', 'Train / validation / test'],
    ['Known limitations', 'Известные ограничения'],
  ],
  experiment: [
    ['Question', 'Вопрос'],
    ['Controlled change', 'Контролируемое изменение'],
    ['Plan', 'План'],
    ['Risks and next step', 'Риски и следующий шаг'],
  ],
  run: [
    ['Execution notes', 'Ход выполнения'],
    ['Observed result', 'Наблюдаемый результат'],
    ['Errors and limitations', 'Ошибки и ограничения'],
  ],
  protocol: [
    ['Evaluation inputs', 'Входы оценки'],
    ['Metric implementations and units', 'Реализации метрик и единицы'],
    ['Resolution, masks and aggregation', 'Разрешение, маски и агрегация'],
    ['Comparison rules', 'Правила сравнения'],
  ],
  article: [
    ['Conclusion and confidence', 'Вывод и степень подтверждения'],
    ['Method and conditions', 'Метод и условия'],
    ['Results and evidence', 'Результаты и доказательства'],
    ['Limitations', 'Ограничения'],
    ['Decision and next experiment', 'Решение и следующий эксперимент'],
  ],
  review: [
    ['Reporting period and coverage', 'Период обзора и охват'],
    ['Sources actually checked', 'Фактически проверенные источники'],
    ['New results and revisions', 'Новые результаты и версии'],
    ['Unverified areas', 'Непроверенные области'],
  ],
  handoff: [
    ['Completed work and evidence', 'Выполненная работа и доказательства'],
    ['Pending or uncertain operations', 'Незавершённые или неопределённые операции'],
    ['Inputs and exact versions', 'Входы и точные версии'],
    ['Next action', 'Следующее действие'],
  ],
});
export const RESEARCH_PROFILE_METRICS = Object.freeze({
  dataset_preparation: [
    ['selected_frames', 'count'],
    ['registered_cameras', 'count'],
    ['preparation_seconds', 's'],
    ['reprojection_median', 'px'],
  ],
  scene_optimization: [
    ['active_train_seconds', 's'],
    ['peak_vram', 'MiB'],
    ['psnr', 'dB'],
    ['ssim', 'ratio'],
    ['lpips', 'distance'],
  ],
  pretrained_inference: [
    ['weights_load_seconds', 's'],
    ['cold_inference_seconds', 's'],
    ['warm_inference_seconds', 's'],
    ['peak_vram', 'MiB'],
    ['psnr', 'dB'],
    ['ssim', 'ratio'],
    ['lpips', 'distance'],
  ],
  finetuning: [
    ['active_train_seconds', 's'],
    ['gpu_hours', 'h'],
    ['peak_vram', 'MiB'],
    ['psnr', 'dB'],
    ['ssim', 'ratio'],
    ['lpips', 'distance'],
  ],
  foundation_training: [
    ['active_train_seconds', 's'],
    ['gpu_hours', 'h'],
    ['peak_vram', 'MiB'],
  ],
  rendering: [
    ['frame_time_p50', 'ms'],
    ['frame_time_p95', 'ms'],
    ['time_to_first_frame', 's'],
  ],
  geometry_evaluation: [
    ['depth_rmse', 'm'],
    ['chamfer', 'm'],
    ['f_score', 'ratio'],
  ],
  conversion: [
    ['bytes_before', 'B'],
    ['bytes_after', 'B'],
    ['encode_seconds', 's'],
    ['decode_seconds', 's'],
  ],
});
export function researchMetricDefaults(profile, reason = 'Not measured yet') {
  return (RESEARCH_PROFILE_METRICS[profile] || []).map(([key, unit]) => ({ key, unit, value: null, status: 'missing', reason, scope: 'run', origin: 'team' }));
}
export function protocolResearchMetrics(config, reason = 'Not measured yet') {
  if (!Array.isArray(config?.metrics)) return [];
  const units = new Map(Object.values(RESEARCH_PROFILE_METRICS).flat());
  const rows = new Map();
  for (const item of config.metrics.slice(0, RESEARCH_LIMITS.metrics)) {
    const { key, unit, scope = 'run', aggregation } = typeof item === 'string' ? { key: item, unit: units.get(item) } : item || {};
    const metric = { key, unit, scope, ...(aggregation ? { aggregation } : {}), status: 'missing', value: null, reason, origin: 'team' };
    if (validResearchMetric(metric)) rows.set([key, unit, scope, aggregation || ''].join('\u001f'), metric);
  }
  return [...rows.values()];
}
export function researchTemplate(kind, { russian = false, ownerId = '', now = new Date().toISOString() } = {}) {
  const sections = RESEARCH_TEMPLATE_SECTIONS[kind];
  if (!sections) throw new TypeError('Unknown research template.');
  return {
    kind,
    title: '',
    body: sections.map(pair => '## ' + pair[russian ? 1 : 0] + '\n\n').join('\n'),
    tags: [],
    data: {
      templateId: 'research-' + kind,
      templateVersion: String(RESEARCH_TEMPLATE_VERSION),
      ...(ownerId ? { ownerId } : {}),
      ...(kind === 'run'
        ? {
            state: 'planned',
            profile: 'scene_optimization',
            config: {},
            metrics: researchMetricDefaults('scene_optimization', russian ? 'Ещё не измерено' : 'Not measured yet'),
          }
        : {}),
      ...(kind === 'review' ? { timeZone: 'UTC', periodFrom: now.slice(0, 10), periodTo: now.slice(0, 10), coverage: 'not_run' } : {}),
    },
  };
}
export function repeatResearchRun(source, options = {}) {
  if (source?.kind !== 'run') throw new TypeError('A run is required.');
  const template = researchTemplate('run', options),
    data = structuredClone(source.data);
  for (const key of [
    'startedAt',
    'finishedAt',
    'reason',
    'amendment',
    'artifacts',
    'evidence',
    'conclusion',
    'decision',
    'nextStep',
    'pending',
    'compatibility',
  ])
    delete data[key];
  return {
    ...template,
    title: source.title + (options.russian ? ' · повтор' : ' · repeat'),
    tags: [...(source.tags || [])],
    data: {
      ...data,
      ownerId: options.ownerId || data.ownerId || '',
      state: 'planned',
      baselineRunId: source.id,
      metrics: researchMetricDefaults(data.profile, options.russian ? 'Ещё не измерено' : 'Not measured yet'),
    },
  };
}
