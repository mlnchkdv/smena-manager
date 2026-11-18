import { isRussian, locale, registerRussianLabels } from '../core/i18n.js';
import { S } from '../core/store.js';
import { resolveTimeZone } from '../shared/calendar-time.js';
registerRussianLabels({ Research: 'Исследования' });
export const rw = (en, ru) => (isRussian() ? ru : en);
export const researchDate = (value, time = false) =>
  time
    ? new Date(value).toLocaleString(locale(), { timeZone: resolveTimeZone(S.prefs.tz) })
    : new Date(value).toLocaleDateString(locale(), { timeZone: resolveTimeZone(S.prefs.tz) });
const kinds = {
  observation: ['Observation', 'Наблюдение'],
  source: ['Source', 'Источник'],
  dataset: ['Dataset version', 'Версия датасета'],
  experiment: ['Experiment', 'Эксперимент'],
  run: ['Run', 'Запуск'],
  protocol: ['Evaluation protocol', 'Протокол оценки'],
  article: ['Research article', 'Мини-статья'],
  review: ['Research digest', 'Обзор исследований'],
  handoff: ['Handoff', 'Передача работы'],
};
const states = {
  planned: ['Planned', 'Запланирован'],
  running: ['Running', 'Выполняется'],
  completed: ['Completed', 'Выполнен'],
  failed: ['Failed', 'Ошибка'],
  cancelled: ['Cancelled', 'Отменён'],
};
const profiles = {
  dataset_preparation: ['Dataset preparation', 'Подготовка датасета'],
  scene_optimization: ['Scene optimization', 'Оптимизация сцены'],
  pretrained_inference: ['Pretrained inference', 'Готовая модель · inference'],
  finetuning: ['Finetuning', 'Дообучение'],
  rendering: ['Rendering', 'Рендеринг'],
  geometry_evaluation: ['Geometry evaluation', 'Оценка геометрии'],
  conversion: ['Conversion and compression', 'Конвертация и сжатие'],
  foundation_training: ['Foundation training', 'Обучение базовой модели'],
};
export const researchKind = kind => (kinds[kind] ? rw(...kinds[kind]) : kind);
export const researchState = state => (states[state] ? rw(...states[state]) : state);
export const researchProfile = profile => (profiles[profile] ? rw(...profiles[profile]) : profile);
export function researchFailure(error) {
  const messages = {
    RESEARCH_SECRET_BLOCKED: [
      'Remove credentials or private keys before saving. Keep secrets in your execution environment.',
      'Уберите пароли, токены и приватные ключи. Храните секреты в среде выполнения.',
    ],
    RESEARCH_SOURCE_INVALID: [
      'Use a complete HTTP or HTTPS source URL without credentials.',
      'Укажите полный HTTP- или HTTPS-адрес источника без учётных данных.',
    ],
    RESEARCH_PERIOD_INVALID: [
      'Check the report period and IANA time zone. The end date is exclusive.',
      'Проверьте период и часовой пояс IANA. Конечная дата в период не входит.',
    ],
    RESEARCH_SEED_REQUIRED: ['Record the seed before this stochastic run starts.', 'Укажите seed до начала этого стохастического запуска.'],
    RESEARCH_WEIGHTS_REQUIRED: ['Record the input weights revision or SHA-256 before starting.', 'До начала укажите версию или SHA-256 входных весов.'],
    RESEARCH_EXPORT_LIMIT: [
      'This report is too large. Export a single run or a smaller experiment.',
      'Отчёт слишком большой. Экспортируйте отдельный запуск или меньший эксперимент.',
    ],
    RESEARCH_REVIEW_INCOMPLETE: ['Add the record description before requesting review.', 'Добавьте описание записи перед проверкой.'],
    RESEARCH_EVIDENCE_UNAVAILABLE: [
      'A linked file is unavailable in this project. Choose it again.',
      'Связанный файл недоступен в проекте. Выберите его заново.',
    ],
    RESEARCH_EVIDENCE_CHANGED: [
      'The linked file checksum changed. Check the file before attaching it again.',
      'Контрольная сумма файла изменилась. Проверьте файл перед повторным прикреплением.',
    ],
    RESEARCH_METRIC_EVIDENCE_REQUIRED: [
      'A measured result needs scope, sample count, aggregation, protocol and an attached evidence file.',
      'Измерению нужны область оценки, число образцов, агрегация, протокол и прикреплённый файл-основание.',
    ],
    RESEARCH_METRIC_PROTOCOL_MISMATCH: [
      'Team measurements must refer to this run’s evaluation protocol.',
      'Измерения команды должны ссылаться на протокол оценки этого запуска.',
    ],
    RESEARCH_PLAN_INCOMPLETE: [
      'Choose a profile, experiment, dataset and protocol; specify code, hardware and a JSON configuration.',
      'Выберите профиль, эксперимент, датасет и протокол; укажите код, оборудование и конфигурацию JSON.',
    ],
    RESEARCH_CRITERION_REQUIRED: [
      'First fill in the experiment hypothesis, baseline and success criterion.',
      'Сначала укажите в эксперименте гипотезу, базовый вариант и критерий успеха.',
    ],
    RESEARCH_REFERENCE_UNAVAILABLE: [
      'A linked record is unavailable in this project. Choose an active record.',
      'Связанная запись недоступна в этом проекте. Выберите действующую запись.',
    ],
    RESEARCH_METRICS_REQUIRED: ['Add measured metrics or explain why they are missing.', 'Добавьте измеренные метрики или укажите причины их отсутствия.'],
    RESEARCH_MEMBER_UNAVAILABLE: ['The selected member has no access to this project.', 'Выбранный участник не имеет доступа к проекту.'],
    RESEARCH_METRIC_INVALID: [
      'Check metric values, units and reasons for missing measurements.',
      'Проверьте значения метрик, единицы и причины отсутствия измерений.',
    ],
    RESEARCH_STALE: [
      'This record changed. Reload it before editing; your draft is still open.',
      'Запись изменилась. Обновите её перед правкой; ваш черновик остаётся открытым.',
    ],
    RESEARCH_FORBIDDEN: ['Your project access does not allow this action.', 'Права проекта не позволяют выполнить это действие.'],
    RESEARCH_PROJECT_NOT_FOUND: ['The project is unavailable or access changed.', 'Проект недоступен или права изменились.'],
    RESEARCH_INTEGRITY: [
      'The saved record could not be verified. Retry without replacing it.',
      'Не удалось проверить сохранённую запись. Повторите загрузку, не заменяя её.',
    ],
    RESEARCH_STATE_TRANSITION: ['This transition is unavailable. A repeat needs a new run.', 'Такой переход недоступен. Для повторения создайте новый запуск.'],
    RESEARCH_PLAN_LOCKED: [
      'Inputs and configuration are fixed after starting. Create another run for changes.',
      'После старта входы и конфигурация зафиксированы. Для изменений создайте другой запуск.',
    ],
    RESEARCH_AMENDMENT_REQUIRED: ['Explain the correction to the completed run.', 'Укажите причину исправления завершённого запуска.'],
    RESEARCH_REASON_REQUIRED: ['Explain why the run failed or was cancelled.', 'Укажите причину ошибки или отмены запуска.'],
    RESEARCH_SELF_REVIEW: ['A different project reviewer must check this record.', 'Эту запись должен проверить другой рецензент проекта.'],
    RESEARCH_LIMIT: [
      'The research storage limit was reached. Export your records and contact the workspace owner.',
      'Достигнут лимит журнала. Экспортируйте записи и обратитесь к владельцу пространства.',
    ],
  };
  return messages[error?.code]
    ? rw(...messages[error.code])
    : rw(
        'Could not complete the action. Your draft is kept; retry when connected.',
        'Не удалось выполнить действие. Черновик сохранён в окне; повторите при восстановлении связи.',
      );
}
