export const RESEARCH_STATE_LABELS = {
  planned: ['Planned', 'Запланирован'],
  running: ['Running', 'Выполняется'],
  completed: ['Completed', 'Выполнен'],
  failed: ['Failed', 'Ошибка'],
  cancelled: ['Cancelled', 'Отменён'],
};

export const RESEARCH_QUESTION_LABELS = {
  hypothesis: ['Hypothesis', 'Гипотеза'],
  baseline: ['Baseline', 'Базовый вариант'],
  criterion: ['Success criterion', 'Критерий успеха'],
  factor: ['Changed factor', 'Изменяемый фактор'],
  conclusion: ['Conclusion', 'Вывод'],
  decision: ['Decision and basis', 'Решение и основание'],
  nextStep: ['Next step', 'Следующий шаг'],
};

export function researchReportMarkdown(record, runs = [], russian = false, { includeTitle = true } = {}) {
  const w = (en, ru) => (russian ? ru : en);
  const rows = runs.length ? runs : record.kind === 'run' ? [record] : [];
  return `${includeTitle ? `# ${record.title}\n\n` : ''}${w('Research record', 'Запись исследования')}: ${record.id} · v${record.revision}\n\n${w('Review', 'Проверка')}: ${record.review?.status === 'reviewed' ? w('Reviewed', 'Проверено') : w('Draft — not reviewed', 'Черновик — не проверено')}\n\n${record.body || ''}\n\n## ${w('Question and decision', 'Вопрос и решение')}\n\n${Object.entries(
    RESEARCH_QUESTION_LABELS,
  )
    .filter(([key]) => typeof record.data[key] === 'string' && record.data[key].trim())
    .map(([key, label]) => `- ${w(...label)}: ${record.data[key]}`)
    .join(
      '\n',
    )}\n\n## ${w('Recorded runs', 'Зафиксированные запуски')}\n\n${rows.map(run => `### ${run.title}\n\nID: ${run.id} · v${run.revision} · ${w(...(RESEARCH_STATE_LABELS[run.data.state] || ['Not recorded', 'Не указан']))}\n\n${w('Code revision', 'Версия кода')}: ${run.data.codeRevision || w('Not specified', 'Не указано')}\n\n${(run.data.metrics || []).map(metric => `- ${metric.key}: ${metric.status === 'measured' ? `${metric.value} ${metric.unit} · n=${metric.n} · ${metric.aggregation} · ${metric.origin === 'author' ? w('Author claim', 'Утверждение автора') : w('Team measurement', 'Замер команды')}` : `${metric.status === 'not_applicable' ? w('Not applicable', 'Не применимо') : w('Missing', 'Нет данных')}: ${metric.reason}`} · ${metric.scope || ''}`).join('\n')}\n\n${w('Conclusion', 'Вывод')}: ${run.data.conclusion || w('Not recorded', 'Не записан')}`).join('\n\n') || w('No run results recorded.', 'Результаты запусков не записаны.')}\n\n## ${w('Evidence and limitations', 'Доказательства и ограничения')}\n\n${
    [record, ...runs]
      .flatMap(item => item.data.artifacts || [])
      .map(file => `- ${file.name || file.fileId} · ${file.fileId} · ${file.bytes ?? '?'} B · SHA-256: ${file.sha256 || w('unavailable', 'недоступна')}`)
      .join('\n') || w('No evidence files attached.', 'Файлы-основания не прикреплены.')
  }\n\n${w('Missing measurements are not zero. Author claims are not team measurements. This export does not publish files.', 'Отсутствующие измерения не равны нулю. Утверждения авторов не являются измерениями команды. Экспорт не публикует файлы.')}\n`;
}
