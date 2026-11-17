/* =====================================================================
   I18N: the app keeps stable English keys internally and localizes the
   rendered UI. This lets every existing view opt into a new locale without
   coupling project data, routes, or action identifiers to translated text.
   ===================================================================== */
import { S } from './store.js';
import { countLabel } from '../shared/count-label.js';
import { activityMoveExtra, activityCycleExtra } from '../shared/activity-copy.js';

export const LANGUAGES = [
  ['English (US)', 'English (US)'],
  ['English (UK)', 'English (UK)'],
  ['Русский', 'Русский'],
];

export const locale = () => (S.prefs.lang === 'Русский' ? 'ru-RU' : S.prefs.lang === 'English (UK)' ? 'en-GB' : 'en-US');
export const isRussian = () => locale() === 'ru-RU';

const RU = { Language: 'Язык', 'Toggle theme': 'Тема' };
const registeredLabels = {};
let russianPending,
  russianState = 'idle';
export const russianLabelsState = () => russianState;
export function loadRussianLabels() {
  if (russianState === 'ready') return Promise.resolve();
  if (!russianPending) russianState = 'loading';
  return (russianPending ||= import('./i18n-ru.js')
    .then(module => {
      Object.assign(RU, module.RU, registeredLabels);
      russianState = 'ready';
    })
    .catch(error => {
      russianState = 'failed';
      throw error;
    }));
}

const CONTROL_LABELS = {
  lang: 'Язык',
  spell: 'Проверка орфографии',
  motion: 'Анимация',
  tz: 'Часовой пояс',
  dateFmt: 'Формат даты',
  weekStart: 'Первый день недели',
  timeFmt: 'Формат времени',
  defaultTab: 'Представление проекта по умолчанию',
  showDoneBoard: 'Показывать выполненные задачи на досках',
  permCreate: 'Разрешить участникам создавать проекты',
  permGuests: 'Разрешить участникам приглашать гостей',
  permPublic: 'Разрешить публичные ссылки',
  email_mention: 'Письма об упоминаниях',
  email_assign: 'Письма о назначениях',
  email_comment: 'Письма о комментариях',
  email_update: 'Письма об изменении статуса задач',
  email_due: 'Письма о сроках',
  email_digest: 'Ежедневная сводка по эл. почте',
  push_mention: 'Уведомления об упоминаниях',
  push_assign: 'Уведомления о назначениях',
  push_comment: 'Уведомления о комментариях',
  push_update: 'Уведомления об изменении статуса задач',
  push_due: 'Напоминания о сроках',
  mention_all: 'Упоминания в комментариях и описаниях',
  mention_team: 'Упоминания команды',
  mention_ws: 'Упоминания рабочего пространства',
  assign_self: 'Назначение задачи',
  assign_status: 'Изменение статуса задачи',
  comment_assigned: 'Комментарий к назначенной задаче',
  assign_over: 'Просроченная задача',
  home: 'Страница при запуске',
  openTasks: 'Способ открытия задач',
  confirmDel: 'Подтверждение удаления задач',
  due: 'Срок выполнения',
  start: 'Дата начала',
  globe: 'Веб-сайт',
  smartphone: 'Мобильное приложение',
  megaphone: 'Маркетинг',
  rocket: 'Запуск',
  component: 'Компоненты',
  'building-2': 'Организация',
  'layout-grid': 'Сетка',
  palette: 'Дизайн',
  code: 'Код',
  briefcase: 'Работа',
  target: 'Цель',
  layers: 'Слои',
  zap: 'Быстро',
  heart: 'Личное',
  folder: 'Папка',
  sparkles: 'Другое',
  amber: 'Янтарный',
  green: 'Зелёный',
  slate: 'Серый',
};

const TEMPLATE_TEXT_RU = {
  'Blank project': 'Пустой проект',
  'Start from scratch': 'Начать с нуля',
  'Product Development': 'Разработка продукта',
  'Discovery to launch': 'От исследования до запуска',
  Website: 'Веб-сайт',
  'IA, design, build, launch': 'Структура, дизайн, разработка и запуск',
  'Marketing Campaign': 'Маркетинговая кампания',
  'Brief, assets, channels': 'Бриф, материалы и каналы',
  'Design Project': 'Дизайн-проект',
  'Discovery to handoff': 'От исследования до передачи в разработку',
  'Software Development': 'Разработка ПО',
  'Spec, build, ship': 'Спецификация, разработка и выпуск',
  'Personal Project': 'Личный проект',
  'Plan your own goals': 'Планируйте личные цели',
  'Website Launch': 'Запуск сайта',
  'Define problem statement': 'Сформулировать проблему',
  'User research plan': 'План исследования пользователей',
  'Write PRD': 'Подготовить требования к продукту',
  'Design exploration': 'Проработать варианты дизайна',
  'Build MVP': 'Разработать MVP',
  'Beta launch': 'Запустить бета-версию',
  'Sitemap & information architecture': 'Карта сайта и информационная архитектура',
  Wireframes: 'Вайрфреймы',
  'Visual design': 'Визуальный дизайн',
  'Build page templates': 'Разработать шаблоны страниц',
  'Content migration': 'Перенести контент',
  'QA & launch': 'Тестирование и запуск',
  'Campaign brief': 'Бриф кампании',
  'Audience research': 'Исследование аудитории',
  'Creative assets': 'Креативные материалы',
  'Channel plan': 'План каналов',
  'Launch campaign': 'Запустить кампанию',
  'Performance report': 'Отчёт о результатах',
  'Discovery workshop': 'Вводный воркшоп',
  Moodboard: 'Мудборд',
  'Concept directions': 'Концептуальные направления',
  Refinement: 'Доработка',
  'Developer handoff': 'Передача в разработку',
  'Technical spec': 'Техническая спецификация',
  'Set up repo & CI': 'Настроить репозиторий и CI',
  'Implement core API': 'Реализовать основное API',
  'Write tests': 'Написать тесты',
  'Code review': 'Провести ревью кода',
  'Deploy to staging': 'Развернуть на тестовом окружении',
  'Brain dump ideas': 'Собрать идеи',
  'Pick top 3 priorities': 'Выбрать три главных приоритета',
  'Schedule focus time': 'Запланировать время для фокусной работы',
  'Weekly review': 'Еженедельный обзор',
};

export const templateText = value => (isRussian() ? TEMPLATE_TEXT_RU[value] || value : value);
export const workspaceRoleLabel = role =>
  t({ owner: 'Owner', admin: 'Administrator', viewer: 'Guest', guest: 'Guest' }[String(role || '').toLowerCase()] || 'Member');

const pluralRu = (value, one, few, many) => {
  const count = Number(value);
  if (count % 10 === 1 && count % 100 !== 11) return `${count} ${one}`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return `${count} ${few}`;
  return `${count} ${many}`;
};

const PATTERNS = [
  [/^Access added for (.+)\. Share the project link directly\.$/u, 'Доступ добавлен для $1. Отправьте ссылку на проект напрямую.'],
  [
    /^(.+): (Owner|Admin|Administrator|Member|Guest|Viewer) → (Owner|Admin|Administrator|Member|Guest|Viewer)$/u,
    (_match, name, before, after) => `${name}: ${RU[before] || before} → ${RU[after] || after}`,
  ],
  [/^· (\d+) selected$/u, '· выбрано: $1'],
  [/^Task: (.+)$/u, 'Задача: $1'],
  [/^Subtask: (.+)$/u, 'Подзадача: $1'],
  [/^Complete subtask (.+)$/u, 'Завершить подзадачу $1'],
  [/^Reopen subtask (.+)$/u, 'Открыть заново подзадачу $1'],
  [/^(\d+) filters? will be saved with this view\.$/u, 'В представлении сохранятся фильтры: $1.'],
  [/^Workspace “(.+)”$/u, 'Пространство «$1»'],
  [/^Project “(.+)”$/u, 'Проект «$1»'],
  [/^Plan key dates and outcomes for “(.+)”\.$/u, 'Планируйте ключевые даты и результаты проекта «$1».'],
  [/^(\d+) milestones?$/u, (_match, value) => pluralRu(value, 'этап', 'этапа', 'этапов')],
  [/^Mark (.+) complete$/u, 'Отметить этап «$1» выполненным'],
  [/^Reopen (.+)$/u, 'Возобновить этап «$1»'],
  [/^“(.+)” will be removed from this project\. This cannot be undone\.$/u, 'Этап «$1» будет удалён из проекта. Это действие нельзя отменить.'],
  [/^Milestone: (.+) · Completed$/u, 'Этап: $1 · Выполнено'],
  [/^Milestone: (.+) · Overdue$/u, 'Этап: $1 · Просрочено'],
  [/^(.+) · Completed$/u, '$1 · Выполнено'],
  [/^(.+) · Overdue$/u, '$1 · Просрочено'],
  [/^Good morning, (.+)$/u, 'Доброе утро, $1'],
  [/^Good afternoon, (.+)$/u, 'Добрый день, $1'],
  [/^Good evening, (.+)$/u, 'Добрый вечер, $1'],
  [/^Sign in to (.+)$/u, 'Войдите в $1'],
  [/^Enter your Access ID to open (.+)$/u, 'Введите идентификатор доступа для входа в $1'],
  [/^Deployment setup required: (.+)$/u, 'Требуется настройка развёртывания: $1'],
  [/^Updated by (.+)$/u, 'Обновил(а): $1'],
  [/^Updated (.+)$/u, 'Обновлено $1'],
  [/^Signed in as (.+)$/u, 'Выполнен вход: $1'],
  [/^(.+) · Access ID$/u, '$1 · Идентификатор доступа'],
  [/^Add access to (.+)$/u, 'Добавить доступ к $1'],
  [/^A team called “(.+)” already exists$/u, 'Команда с названием «$1» уже существует.'],
  [/^Team member email (\d+)$/u, 'Эл. почта участника $1'],
  [/^“(.+)” moved to trash$/u, '«$1» перемещено в корзину'],
  [/^Deleted (.+)$/u, 'Удалено $1'],
  [/^“(.+)” restored\.$/u, '«$1» восстановлено.'],
  [/^“(.+)” permanently deleted\.$/u, '«$1» удалено безвозвратно.'],
  [/^(.+) will be moved to trash\.$/u, '$1 будет перемещено в корзину.'],
  [/^(.+) will be permanently deleted, including its files in Google Drive\.$/u, '$1 будет окончательно удалён вместе с файлами в Google Drive.'],
  [/^(.+) will be permanently deleted\.$/u, '$1 будет окончательно удалён.'],
  [
    /^The current state will first be saved as a separate backup, then the data will be restored to the version from (.+)\.$/u,
    'Текущее состояние будет сначала сохранено отдельной копией, затем данные будут возвращены к версии от $1.',
  ],
  [/^Access added for (\d+)\. Send the site link to the team members\.$/u, 'Доступ добавлен: $1. Отправьте участникам ссылку на сайт.'],
  [/^Link copied for (.+)\. Send it to the team member manually\.$/u, 'Ссылка для $1 скопирована. Отправьте её участнику вручную.'],
  [/^(\d+) new notifications received\.$/u, 'Получено новых уведомлений: $1.'],
  [/^(\d+) active devices$/u, 'Активных устройств: $1'],
  [
    /^(\d+) other device(?:s)? will need to sign in again\. This device will remain signed in\.$/u,
    (_match, count) =>
      `${count} ${Number(count) === 1 ? 'другому устройству' : 'другим устройствам'} потребуется войти снова. На этом устройстве сеанс сохранится.`,
  ],
  [/^(\d+) push · (\d+) email · (\d+) failed$/u, 'Push-уведомлений: $1 · писем: $2 · с ошибкой: $3'],
  [/^Deactivate (.+)\?$/u, 'Деактивировать $1?'],
  [/^Access restored for (.+)\.$/u, 'Доступ для $1 восстановлен.'],
  [/^Access suspended for (.+)\.$/u, 'Доступ для $1 приостановлен.'],
  [
    /^(.+) will not be able to sign in to the workspace until access is restored\. Assigned tasks and history will be preserved\.$/u,
    '$1 не сможет войти в рабочее пространство, пока доступ не будет восстановлен. Назначенные задачи и история сохранятся.',
  ],
  [/^— up to (.+) each$/u, '— до $1 на файл'],
  [/^File is too large\. Maximum size: (.+)\.$/u, 'Файл слишком большой. Максимальный размер: $1.'],
  [/^Uploaded (.+)$/u, 'Загружен файл «$1»'],
  [/^Moved to (.+)$/u, (_match, value) => `Перемещено в «${RU[value] || value}»`],
  [/^moved to (.+)$/u, (_match, value) => `переместил(а) в «${RU[value] || value}»`],
  [/^(.+) is at risk$/u, 'Проект «$1» под угрозой'],
  [/^Upload failed: (.+)$/u, 'Не удалось загрузить файл «$1»'],
  [/^Google Drive rejected the upload \((\d+)\)\.$/u, 'Google Диск отклонил загрузку (код $1).'],
  [/^(\d+) assigned to you$/u, '$1 назначено вам'],
  [/^(\d+) at risk$/u, '$1 под угрозой'],
  [/^\+(\d+) more$/u, 'Ещё $1'],
  [/^(\d+) members?$/u, (_match, value) => pluralRu(value, 'участник', 'участника', 'участников')],
  [/^(\d+) tasks?$/u, '$1 задач'],
  [/^(\d+) projects?$/u, (_match, value) => pluralRu(value, 'проект', 'проекта', 'проектов')],
  [/^(\d+) notes?$/u, (_match, value) => pluralRu(value, 'заметка', 'заметки', 'заметок')],
  [/^(\d+) of (\d+) notes?$/u, (_match, visible, total) => `${visible} из ${total} заметок`],
  [/^(\d+) active$/u, 'Активных: $1'],
  [/^(\d+) folders?$/u, (_match, value) => pluralRu(value, 'папка', 'папки', 'папок')],
  [/^(\d+) active · (\d+) completed$/u, '$1 активных · $2 завершено'],
  [/^(\d+) completed$/u, '$1 завершено'],
  [/^Assigned · (\d+)$/u, 'Назначено · $1'],
  [/^Completed · (\d+)$/u, 'Завершено · $1'],
  [/^(\d+) open$/u, '$1 открыто'],
  [/^(\d+) pending invite$/u, 'Ожидают приглашения: $1'],
  [/^Sort: (.+)$/u, (_match, value) => `Сортировка: ${RU[value] || value}`],
  [/^View all results for “(.+)”$/u, 'Все результаты по запросу «$1»'],
  [/^Exported (\d+) notes and (\d+) bookmarks\.$/u, 'Экспортировано заметок: $1, закладок: $2.'],
  [/^Imported (\d+) Markdown notes\. Skipped (\d+) duplicates\.$/u, 'Импортировано заметок Markdown: $1. Пропущено дублей: $2.'],
  [
    /^Imported (\d+) notes, (\d+) bookmarks, and (\d+) folders\. Skipped (\d+) duplicates\.$/u,
    'Импортировано заметок: $1, закладок: $2, папок: $3. Пропущено дублей: $4.',
  ],
  [
    /^(\d+) notes? · (\d+) folders?$/u,
    (_match, notes, folders) => `${pluralRu(notes, 'заметка', 'заметки', 'заметок')} · ${pluralRu(folders, 'папка', 'папки', 'папок')}`,
  ],
  [
    /^(\d+) bookmarks? · (\d+) folders?$/u,
    (_match, bookmarks, folders) => `${pluralRu(bookmarks, 'закладка', 'закладки', 'закладок')} · ${pluralRu(folders, 'папка', 'папки', 'папок')}`,
  ],
  [/^Group: (.+)$/u, (_match, value) => `Группа: ${RU[value] || value}`],
  [/^Status: (.+)$/u, (_match, value) => `Статус: ${RU[value] || value}`],
  [/^Priority: (.+)$/u, (_match, value) => `Приоритет: ${RU[value] || value}`],
  [/^(Backlog|To Do|In Progress|Review|Done): (\d+)$/u, (_match, value, count) => `${RU[value] || value}: ${count}`],
  [/^(Knowledge base|Bookmarks) · (\d+)$/u, (_match, value, count) => `${RU[value] || value} · ${count}`],
  [/^Add task to (.+)$/u, (_match, value) => `Добавить задачу в «${RU[value] || value}»`],
  [/^Add task on (.+)$/u, 'Добавить задачу на $1'],
  [/^Select (.+)$/u, (_match, value) => `Выбрать ${value}`],
  [/^(\d+) unread$/u, 'Непрочитанных: $1'],
  [/^(\d+) overdue$/u, 'Просрочено: $1'],
  [/^(\d+) due today · (\d+) overdue · (\d+) upcoming$/u, 'На сегодня: $1 · просрочено: $2 · предстоящих: $3'],
  [/^(\d+) people in (.+) · (\d+) pending$/u, '$1 участников в $2 · ожидают: $3'],
  [/^(\d+) people in (.+)$/u, (_match, count, workspace) => `В рабочем пространстве «${workspace}»: ${pluralRu(count, 'участник', 'участника', 'участников')}`],
  [/^Every task across (\d+) projects\.$/u, 'Все задачи в $1 проектах.'],
  [/^Health of every project in (.+)\.$/u, 'Состояние всех проектов в $1.'],
  [/^Invite to (.+)$/u, 'Пригласить в $1'],
  [/^Share “(.+)”$/u, 'Поделиться проектом «$1»'],
  [/^Permission for (.+)$/u, 'Разрешения для $1'],
  [/^Everyone at (.+)$/u, 'Все участники $1'],
  [/^(\d+) of (\d+) tasks done$/u, 'Выполнено $1 из $2 задач'],
  [/^(\d+) days? until (.+)$/u, '$1 дн. до $2'],
  [/^Ended (.+)$/u, 'Завершено $1'],
  [/^Milestone: (.+)$/u, 'Этап: $1'],
  [/^Active (.+)$/u, 'Был(а) в сети $1'],
  [/^(\d+) hours? ago$/u, '$1 ч назад'],
  [/^(.+) · Active now$/u, '$1 · Сейчас активен'],
  [/^(.+) · (\d+) hours? ago$/u, '$1 · $2 ч назад'],
  [/^(.+) · Sep (\d+)$/u, '$1 · $2 сентября'],
  [/^([\d.,]+) GB of ([\d.,]+) GB$/u, '$1 ГБ из $2 ГБ'],
  [/^([\d.,]+) of ([\d.,]+)$/u, '$1 из $2'],
  [/^(\d+) starter tasks · (.+) view$/u, (_match, count, view) => `${count} начальных задач · Представление: ${RU[view] || view}`],
  [/^(\d+) selected$/u, 'Выбрано: $1'],
  [/^(\d+) comments?$/u, (_match, count) => countLabel(count, 'comment', 'ru-RU')],
  [/^(\d+) files?$/u, '$1 файлов'],
  [/^(\d+) starter tasks?$/u, '$1 начальных задач'],
  [/^(\d+) invites? sent$/u, 'Отправлено приглашений: $1'],
  [/^Step (\d+) of (\d+)$/u, 'Шаг $1 из $2'],
  [/^Resend email in (\d+)s$/u, 'Отправить ещё раз через $1 с'],
  [/^Overdue by (\d+) days?\.$/u, 'Просрочено на $1 дн.'],
  [/^Completed (.+)\.$/u, 'Завершено $1.'],
  [/^(\d+)m ago$/u, '$1 мин назад'],
  [/^(\d+)h ago$/u, '$1 ч назад'],
  [/^(\d+)d ago$/u, '$1 дн. назад'],
  [/^(\d+) people have access to (.+)\.$/u, 'Доступ к $2: $1 чел.'],
  [/^(.+) is available$/u, '$1 доступен'],
  [/^Renews (.+) · Billed monthly$/u, 'Продление $1 · Оплата ежемесячно'],
  [/^Color (#[0-9A-Fa-f]{6})$/u, 'Цвет $1'],
  [/^Teammate email (\d+)$/u, 'Эл. почта коллеги $1'],
  [/^Open (.+)$/u, (_match, value) => `Открыть ${value}`],
  [/^Delete (.+)$/u, (_match, value) => `Удалить ${value}`],
  [/^Edit (.+)$/u, (_match, value) => `Изменить ${value}`],
  [/^Complete (.+)$/u, (_match, value) => `Завершить ${value}`],
  [/^(.+) moved$/u, '$1 переместил(а)'],
  [/^(.+) completed$/u, '$1 завершил(а)'],
  [/^(.+) commented on$/u, '$1 оставил(а) комментарий к'],
  [/^You changed priority of$/u, 'Вы изменили приоритет'],
  [/^(.+) added a file to$/u, '$1 добавил(а) файл к'],
  [/^(.+) created$/u, '$1 создал(а)'],
  [/^(.+) assigned$/u, '$1 назначил(а)'],
];

export function registerRussianLabels(labels) {
  Object.assign(registeredLabels, labels);
  Object.assign(RU, labels);
}

export function t(value) {
  if (!isRussian() || value == null) return value;
  const raw = String(value);
  const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/u);
  const lead = match?.[1] || '';
  const text = match?.[2] || raw;
  const tail = match?.[3] || '';
  if (!text) return raw;
  let translated = RU[text] || TEMPLATE_TEXT_RU[text];
  if (!translated) {
    for (const [pattern, replacement] of PATTERNS) {
      if (pattern.test(text)) {
        translated = text.replace(pattern, replacement);
        break;
      }
    }
  }
  return translated ? lead + translated + tail : raw;
}

export function activityExtra(value, verb, change = null) {
  const cycle = activityCycleExtra({ extra: value, verb, change }, isRussian() ? 'ru-RU' : 'en-US');
  if (cycle !== null) return cycle;
  const transition = activityMoveExtra({ extra: value, verb, change }, isRussian() ? 'ru-RU' : 'en-US');
  if (transition !== null) return transition;
  if (!isRussian() || !value) return value;
  const match = String(value).match(/^to (.+)$/u);
  if (!match) return t(value);
  const rawTarget = RU[match[1]] || match[1];
  const target = rawTarget.replace(/^[“"]|[”"]$/gu, '');
  if (verb === 'changed priority of') return `на «${target}»`;
  if (verb === 'assigned') return `исполнителю ${target}`;
  if (verb === 'renamed') return `в «${target}»`;
  return `в «${target}»`;
}

export const inProject = name => (isRussian() ? `в проекте «${name}»` : `in ${name}`);
export const uiCount = (count, kind) => countLabel(count, kind, isRussian() ? 'ru-RU' : 'en-US');
export const resultsCount = (shown, total, kind) => (isRussian() ? `Показано ${shown} из ${total}` : `${shown} of ${uiCount(total, kind)}`);

const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'data-tip', 'data-msg', 'data-ph'];

/** Translate user-interface text in a rendered subtree without changing data values. */
export function translateElement(root) {
  if (!root || !isRussian()) return root;
  if (root.nodeType === Node.ELEMENT_NODE && (root.closest('[translate="no"]') || ['SCRIPT', 'STYLE'].includes(root.tagName))) return root;
  const attributes = el => {
    for (const attr of ATTRIBUTES) {
      if (el.hasAttribute?.(attr)) {
        const value = el.getAttribute(attr);
        const translated = t(value);
        el.setAttribute(attr, translated === value ? CONTROL_LABELS[value] || value : translated);
      }
    }
  };
  if (root.nodeType === Node.ELEMENT_NODE) attributes(root);
  if (root.tagName === 'TEXTAREA') return root;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Reject the element, not each descendant text node: user documents can
      // contain thousands of nodes and must never be walked or translated.
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.getAttribute('translate') === 'no' || ['SCRIPT', 'STYLE'].includes(node.tagName)) return NodeFilter.FILTER_REJECT;
        if (node.tagName === 'TEXTAREA') {
          attributes(node);
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
      return node.parentElement ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.ELEMENT_NODE) attributes(node);
    else node.nodeValue = t(node.nodeValue);
  }
  return root;
}

export function translateApp() {
  if (!isRussian()) return;
  translateElement(document.getElementById('app'));
  translateElement(document.getElementById('layer'));
}

export const workspaceDraftLabel = () => (isRussian() ? 'Есть несохранённые изменения' : 'Unsaved changes');

export const projectRuleConflictLabel = code =>
  code?.startsWith('AUTOMATION_')
    ? isRussian()
      ? 'Правила проекта не разрешили сохранить изменение. Черновик сохранён для проверки; серверные данные не перезаписаны.'
      : 'Project rules prevented this change. Your draft is kept for review; server data was not overwritten.'
    : t('The project process changed before saving. Your draft is kept for review; the server version was not overwritten.');
