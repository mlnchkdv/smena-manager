import { writeFile } from 'node:fs/promises';

// Public copy is deliberately independent of workspace data and credentials.
const copy = {
  ru: {
    title: 'Smena — проекты, знания и материалы команды в одном пространстве',
    description:
      'Планируйте проекты, храните знания и файлы, сохраняйте страницы, собирайте идеи на холстах и находите связи в графе. Узнайте, как работает Smena.',
    skip: 'К содержимому',
    nav: ['Возможности', 'Как это работает', 'Начать работу'],
    login: 'Войти',
    eyebrow: 'РАБОЧЕЕ ПРОСТРАНСТВО КОМАНДЫ',
    headline: 'От первой идеи<br>до общего результата.',
    lead: 'Проекты, знания и материалы рядом. Smena помогает команде планировать работу, сохранять контекст и превращать идеи в понятные действия.',
    enter: 'Войти в пространство',
    discuss: 'Обсудить запуск команды',
    access: 'Для сотрудников — вход через Google после добавления администратором. Для новых команд — знакомство и обсуждение настройки.',
    demo: 'Посмотрите на работу в контексте',
    demoNote: 'Интерактивная демонстрация · Все данные вымышлены',
    demoTabs: ['Проекты', 'Файлы', 'Знания', 'Закладки', 'Холсты', 'Граф'],
    demoText: [
      'Одна задача — разные представления. Доска помогает видеть поток работы, список — быстро разбирать детали.',
      'Фотографии, видео и документы — в папках проекта. Очередь показывает ход загрузки и доступные действия.',
      'Заметка хранит решение, его причины и ссылки на материалы. Версии помогают вернуться к прежнему тексту.',
      'Сохраните источник и читаемую копию страницы: контекст останется, даже если оригинал изменится.',
      'Разложите материалы на холсте, измените размеры карточек и соедините идеи с задачами.',
      'Найдите связи между материалами. Фильтры и фокус помогают исследовать нужный фрагмент.',
    ],
    project: 'Запуск продукта',
    plan: 'К выполнению',
    work: 'В работе',
    done: 'Готово',
    tasks: ['Собрать вопросы команды', 'Подготовить первый сценарий', 'Согласовать решение'],
    fileTitle: 'Материалы проекта',
    fileNames: ['Интервью.mp4', 'Фотографии.zip', 'Описание.md'],
    fileStatus: ['Загружено', 'В очереди', 'Загружено'],
    noteTitle: 'Почему мы выбрали этот сценарий',
    noteType: 'Решение',
    noteBody: 'Начинаем с одного понятного пути: от запроса пользователя до готовой задачи. Дополнительные настройки открываем по необходимости.',
    noteLinks: 'Связано: исследование · прототип · план запуска',
    bookmarkTitle: 'Исследование: удобные рабочие процессы',
    bookmarkState: 'Копия страницы сохранена',
    bookmarkBody: 'Ссылка на источник, краткое описание, теги и читаемая копия — вместе.',
    canvasNodes: ['Вопрос команды', 'Решение', 'Следующий шаг'],
    graphNames: ['Проект', 'Заметка', 'Файл', 'Задача', 'Источник'],
    workflowTitle: 'Контекст движется вместе с работой.',
    workflowLead: 'Не нужно заново объяснять, откуда взялась задача и где лежат исходные материалы.',
    steps: [
      ['Соберите', 'Сохраните файлы и ссылки, импортируйте заметки.'],
      ['Осмыслите', 'Запишите решение, разложите идеи на холсте, найдите связи.'],
      ['Сделайте', 'Создайте задачи, назначьте ответственных и следите за сроками.'],
      ['Сохраните опыт', 'Вернитесь к версиям и источникам для следующего проекта.'],
    ],
    featureTitle: 'Инструменты, которые работают вместе.',
    featureLead: 'От ежедневных задач до командной памяти. Откройте подробности нужного раздела.',
    features: [
      [
        '01',
        'Проекты и задачи',
        'Видно, что делать дальше и кто отвечает за результат.',
        [
          ['Разные представления', 'Доска, список, таблица, календарь и хронология помогают выбирать подходящий способ планирования.'],
          ['Детали задачи', 'Исполнители, сроки, приоритеты, подзадачи и зависимости сохраняют договорённости рядом с работой.'],
          ['Обзор команды', 'Портфель проектов, просроченные задачи, загрузка участников и этапы помогают замечать риски и переходить к деталям.'],
          [
            'Обсуждение и история',
            'Комментарии, упоминания и активность дают контекст изменений. Уведомления зависят от настройки команды и личных предпочтений.',
          ],
        ],
      ],
      [
        '02',
        'Файлы и медиа',
        'Рабочие материалы в понятной структуре, с просмотром внутри приложения.',
        [
          ['Папки и поиск', 'Организуйте файлы по проектам и папкам, ищите по названию и фильтруйте по типу. Переносите материалы по одному или группой.'],
          [
            'Большие загрузки',
            'Пакетная очередь, прогресс, пауза и повтор помогают загружать фото и длинные видео. Возобновление после перезапуска зависит от браузера и разрешения на доступ к исходному файлу.',
          ],
          [
            'Предпросмотр',
            'Открывайте поддерживаемые изображения, видео, аудио, PDF и текст. HTML доступен в безопасном статическом просмотре без скриптов; оригинал можно скачать.',
          ],
          [
            'Версии и восстановление',
            'История файлов, корзина и инструменты копирования помогают исправлять ошибки. Хранение материалов использует Google Drive, настроенный для команды.',
          ],
        ],
      ],
      [
        '03',
        'База знаний',
        'Решения и инструкции можно найти и использовать повторно.',
        [
          ['Заметки с контекстом', 'Markdown, папки, теги, типы и свойства заметок. Шаблоны упрощают повторяющиеся записи.'],
          ['Поиск и подборки', 'Полнотекстовый поиск, фильтры, сохранённые запросы и умные подборки помогают найти нужный материал.'],
          [
            'Связи и версии',
            'Ссылки между материалами и обратные ссылки соединяют знания с работой. История версий помогает сравнивать и восстанавливать текст.',
          ],
          [
            'Импорт и переносимость',
            'Импортируйте MD/TXT, экспортируйте материалы и сохраняйте выбранные данные для работы офлайн. Доступность офлайн зависит от сохранённого набора и браузера.',
          ],
        ],
      ],
      [
        '04',
        'Закладки и источники',
        'Полезная страница не теряется среди сообщений.',
        [
          ['Быстрое сохранение', 'Вставьте URL: Smena попробует заполнить название и описание. Поля можно отредактировать, добавить теги и папку.'],
          [
            'Читаемая копия',
            'Откройте страницу в просмотрщике и сохраните её текст и таблицы. До 10 копий на закладку; скрипты, изображения и интерактивные элементы в копию не входят.',
          ],
          ['Командная обработка', 'Статус прочтения общий для пространства, избранное — личное. Отмечайте полезное и возвращайтесь к источникам позже.'],
        ],
      ],
      [
        '05',
        'Холсты и граф',
        'Два способа увидеть общую картину: собрать её вручную или исследовать связи.',
        [
          [
            'Свободная композиция',
            'Текст, материалы, фигуры, группы и рамки на отдельном холсте. Перетаскивайте карточки, меняйте размер за края, масштабируйте и соединяйте.',
          ],
          ['От схемы к действию', 'Связывайте холст с проектом, используйте шаблоны, историю и экспорт. Материалы можно превращать в заметки и задачи.'],
          ['Граф связей', 'Исследуйте связи заметок, задач, файлов и других материалов. Используйте фильтры, фокус и сохранённые виды.'],
          [
            'Управление сложностью',
            'Упрощённый вид и переключение физики помогают выбрать удобный режим графа. Большие наборы показываются в пределах доступного бюджета отображения.',
          ],
        ],
      ],
      [
        '06',
        'Пространства, доступ и интеграции',
        'Команда управляет своей средой и тем, кому доступны материалы.',
        [
          [
            'Отдельные пространства',
            'Создавайте рабочие пространства, переключайтесь между ними и настраивайте меню под себя. Доступ к чужим пространствам не возникает автоматически.',
          ],
          [
            'Роли и публичные ссылки',
            'Управляйте ролями участников. Для файлов, папок и заметок можно выдавать отдельные публичные ссылки, задавать срок и отзывать доступ.',
          ],
          [
            'API и MCP',
            'Подключайте совместимые клиенты, включая Codex. Чтение и запись заметок, чтение и загрузка файлов ограничиваются правами участника и токена. Инструкция подключения доступна отдельно.',
          ],
          [
            'Развёртывание для команды',
            'Smena можно развернуть на сервере команды с Google-входом и Google Drive. Домен, хранение, резервные копии и интеграции требуют настройки. Встроенный платный ИИ-провайдер не включён по умолчанию.',
          ],
        ],
      ],
    ],
    startTitle: 'Как начать работу',
    employee: 'Я сотрудник',
    employeeText: 'Если команда уже работает в Smena, отдельная регистрация не нужна.',
    employeeSteps: [
      'Попросите администратора добавить ваш Google-аккаунт в команду.',
      'Войдите и выберите доступное рабочее пространство.',
      'Откройте «Мои задачи» или нужный проект. Материалы ищите в файлах и базе знаний.',
    ],
    team: 'Я выбираю инструмент для команды',
    teamText: 'Обсудим ваши процессы и подходящий способ развёртывания. Открытой регистрации и опубликованного тарифа пока нет.',
    teamSteps: [
      'Опишите размер команды и основные рабочие сценарии.',
      'Определите, где хранить данные и какие интеграции нужны.',
      'Согласуйте настройку и проверку на небольшом пилотном проекте.',
    ],
    faqTitle: 'Перед началом — несколько ответов',
    faq: [
      [
        'Можно ли посмотреть возможности без входа?',
        'Да. Эта страница и демонстрация публичны. Рабочие проекты и материалы доступны только авторизованным участникам, кроме отдельно выданных публичных ссылок.',
      ],
      [
        'Это замена сразу всем инструментам?',
        'Smena объединяет основные рабочие сценарии. Сложный монтаж, полноценные дизайн-макеты и специализированные инструменты остаются во внешних приложениях; результаты можно хранить и связывать здесь.',
      ],
      [
        'Где хранятся файлы и кто управляет доступом?',
        'Текущая конфигурация использует Google Drive и сервер приложения. Администратор команды управляет доступом. Перед запуском для другой команды необходимо согласовать аккаунт хранения, резервирование и права.',
      ],
      [
        'Автоматически ли возобновится загрузка после закрытия браузера?',
        'Это возможно в поддерживаемом браузере при сохранённом разрешении на исходный файл. В остальных случаях приложение попросит снова выбрать файл. Действуют ограничения размера и очереди конкретного развёртывания.',
      ],
      [
        'Входит ли ИИ в приложение?',
        'Есть API и MCP для подключения внешних совместимых клиентов. Провайдер, его оплата и доступ к данным настраиваются отдельно. Права интеграции можно ограничить для каждого участника.',
      ],
    ],
    finalTitle: 'Меньше поиска контекста.<br>Больше совместной работы.',
    finalText: 'Начните с одного проекта и соберите рядом всё, что помогает его сделать.',
    footer: 'Проекты · знания · материалы',
    about: 'О сервисе и Google',
    privacy: 'Конфиденциальность',
    terms: 'Условия',
    guide: 'Подключение MCP',
    language: 'English',
    other: '/product-en.html',
    mailSubject: 'Smena — запуск пространства для команды',
  },
  en: {
    title: 'Smena — team projects, knowledge and materials in one workspace',
    description: 'Plan projects, keep knowledge and files, save web pages, map ideas on whiteboards and explore connections in a graph. See how Smena works.',
    skip: 'Skip to content',
    nav: ['Features', 'How it works', 'Get started'],
    login: 'Sign in',
    eyebrow: 'A WORKSPACE FOR YOUR TEAM',
    headline: 'From the first idea<br>to a shared result.',
    lead: 'Keep projects, knowledge and materials together. Smena helps your team plan work, preserve context and turn ideas into clear next steps.',
    enter: 'Open your workspace',
    discuss: 'Discuss your team setup',
    access: 'Employees sign in with Google after an administrator adds them. New teams can get in touch to discuss their setup.',
    demo: 'See work in context',
    demoNote: 'Interactive demo · All data is illustrative',
    demoTabs: ['Projects', 'Files', 'Knowledge', 'Bookmarks', 'Whiteboards', 'Graph'],
    demoText: [
      'One task, different perspectives. Use a board to see the flow of work or a list to review details.',
      'Keep photos, videos and documents in project folders. The upload queue shows progress and available actions.',
      'A note keeps the decision, its reasoning and source links together. Versions help you recover earlier text.',
      'Save a source and a readable page copy so its context survives changes to the original.',
      'Arrange materials on a whiteboard, resize cards and connect ideas to tasks.',
      'Explore connections between materials. Filters and focus keep the relevant part in view.',
    ],
    project: 'Product launch',
    plan: 'To do',
    work: 'In progress',
    done: 'Done',
    tasks: ['Collect team questions', 'Build the first workflow', 'Agree on the decision'],
    fileTitle: 'Project materials',
    fileNames: ['Interview.mp4', 'Photos.zip', 'Overview.md'],
    fileStatus: ['Uploaded', 'Queued', 'Uploaded'],
    noteTitle: 'Why we chose this workflow',
    noteType: 'Decision',
    noteBody: 'Start with one clear path: from a user request to an actionable task. Reveal additional settings when they become useful.',
    noteLinks: 'Linked: research · prototype · launch plan',
    bookmarkTitle: 'Research: useful team workflows',
    bookmarkState: 'Page copy saved',
    bookmarkBody: 'A source link, a short description, tags and a readable page copy — together.',
    canvasNodes: ['Team question', 'Decision', 'Next step'],
    graphNames: ['Project', 'Note', 'File', 'Task', 'Source'],
    workflowTitle: 'Context travels with the work.',
    workflowLead: 'Keep the reasoning behind a task and its source materials within reach.',
    steps: [
      ['Collect', 'Save files and links, import notes.'],
      ['Make sense', 'Record decisions, map ideas and explore connections.'],
      ['Deliver', 'Create tasks, assign owners and track deadlines.'],
      ['Keep the learning', 'Return to versions and sources for your next project.'],
    ],
    featureTitle: 'Tools that work together.',
    featureLead: 'From daily tasks to team memory. Expand the details that matter to you.',
    features: [
      [
        '01',
        'Projects and tasks',
        'Know the next step and who owns the outcome.',
        [
          ['Multiple views', 'Choose boards, lists, tables, calendars or timelines to suit the way you plan.'],
          ['Task details', 'Assignees, due dates, priorities, subtasks and dependencies keep agreements next to the work.'],
          ['Team overview', 'A project portfolio, overdue tasks, member workload and milestones help surface risks and open the relevant details.'],
          ['Discussion and history', 'Comments, mentions and activity explain changes. Notifications depend on team configuration and personal preferences.'],
        ],
      ],
      [
        '02',
        'Files and media',
        'Organize working materials and preview them inside the app.',
        [
          ['Folders and search', 'Organize files by project and folder, search names and filter by type. Move materials individually or in batches.'],
          [
            'Large uploads',
            'Batch queues, progress, pause and retry help with photos and long videos. Resuming after a browser restart depends on browser support and permission to access the source file.',
          ],
          [
            'Previews',
            'Open supported images, video, audio, PDF and text. HTML uses a safe static preview without scripts; the original remains downloadable.',
          ],
          [
            'Versions and recovery',
            'File history, Trash and copying tools help recover from mistakes. Materials use the Google Drive storage configured for your team.',
          ],
        ],
      ],
      [
        '03',
        'Knowledge base',
        'Find and reuse decisions and instructions.',
        [
          ['Notes with context', 'Markdown, folders, tags, note types and properties. Templates simplify recurring records.'],
          ['Search and collections', 'Full-text search, filters, saved searches and smart collections help you find the right material.'],
          ['Links and versions', 'Material links and backlinks connect knowledge to work. Version history helps compare and restore text.'],
          [
            'Import and portability',
            'Import MD/TXT, export materials and keep selected data for offline use. Offline availability depends on the saved pack and browser.',
          ],
        ],
      ],
      [
        '04',
        'Bookmarks and sources',
        'Useful pages stay within reach.',
        [
          ['Quick capture', 'Paste a URL: Smena will try to fill in its title and description. Edit the details, add tags and choose a folder.'],
          [
            'Readable page copies',
            'Open the reader and save public page text and tables. Up to 10 copies per bookmark; copies exclude scripts, images and interactive elements.',
          ],
          ['Team reading', 'Reading status is shared across the workspace; favorites are personal. Keep useful sources for later.'],
        ],
      ],
      [
        '05',
        'Whiteboards and graph',
        'Build a visual view by hand or explore existing connections.',
        [
          [
            'Free arrangement',
            'Use text, materials, shapes, groups and frames on a dedicated whiteboard. Drag cards, resize their edges, zoom and connect ideas.',
          ],
          ['From diagram to action', 'Link a whiteboard to a project, use templates, history and export. Turn materials into notes and tasks.'],
          ['A graph of connections', 'Explore links between notes, tasks, files and other materials. Use filters, focus and saved views.'],
          [
            'Manage complexity',
            'A simplified view and a physics toggle let you choose a comfortable graph mode. Large sets are displayed within the available rendering budget.',
          ],
        ],
      ],
      [
        '06',
        'Workspaces, access and integrations',
        'Your team controls its environment and who can access materials.',
        [
          ['Separate workspaces', 'Create workspaces, switch between them and personalize the menu. Other workspaces do not become accessible automatically.'],
          ['Roles and public links', 'Manage member roles. Issue separate public links for files, folders and notes, set expiry dates and revoke access.'],
          [
            'API and MCP',
            'Connect compatible clients, including Codex. Reading and editing notes, reading and uploading files are limited by both member permissions and token scopes. A separate connection guide is available.',
          ],
          [
            'Team deployment',
            'Smena can run on your team’s server with Google sign-in and Google Drive. Domain, storage, backups and integrations require setup. A paid hosted AI provider is not included by default.',
          ],
        ],
      ],
    ],
    startTitle: 'Start with your team',
    employee: 'I am a team member',
    employeeText: 'If your team already uses Smena, you do not need a separate registration.',
    employeeSteps: [
      'Ask your administrator to add your Google account to the team.',
      'Sign in and choose an available workspace.',
      'Open My tasks or a project. Find materials in Files and the knowledge base.',
    ],
    team: 'I am choosing a tool for a team',
    teamText: 'Let’s discuss your workflows and deployment. Open registration and a published pricing plan are not available yet.',
    teamSteps: [
      'Tell us about your team size and main workflows.',
      'Decide where to keep data and which integrations you need.',
      'Agree on setup and validate it with a small pilot project.',
    ],
    faqTitle: 'A few answers before you begin',
    faq: [
      [
        'Can I explore without signing in?',
        'Yes. This page and demo are public. Working projects and materials require membership, except for individually issued public links.',
      ],
      [
        'Does this replace every specialized tool?',
        'Smena brings core work together. Advanced editing, full design files and specialized workflows remain in external apps; you can keep and link their results here.',
      ],
      [
        'Where are files stored and who controls access?',
        'The current configuration uses Google Drive and an application server. Team administrators manage access. A deployment for another team needs an agreed storage account, backup plan and permissions.',
      ],
      [
        'Will uploads resume automatically after I close the browser?',
        'Supported browsers can resume when they retain permission to access the source file. Otherwise, the app asks you to select it again. File and queue limits depend on deployment configuration.',
      ],
      [
        'Is AI built into the app?',
        'API and MCP support external compatible clients. The provider, its billing and data access are configured separately. Integration permissions can be limited per member.',
      ],
    ],
    finalTitle: 'Less searching for context.<br>More work together.',
    finalText: 'Start with one project and bring everything that helps deliver it into reach.',
    footer: 'Projects · knowledge · materials',
    about: 'Service and Google',
    privacy: 'Privacy',
    terms: 'Terms',
    guide: 'Connect MCP',
    language: 'Русский',
    other: '/product.html',
    mailSubject: 'Smena — team workspace setup',
  },
};
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const ids = ['projects', 'files', 'knowledge', 'bookmarks', 'whiteboards', 'graph'];
function demo(c, index) {
  if (index === 0)
    return `<div class="demo-board">${[c.plan, c.work, c.done].map((s, i) => `<div class="demo-column"><span>${s}</span><div class="demo-task"><span class="task-dot dot-${i}"></span><strong>${c.tasks[i]}</strong><small>${c.project}</small></div></div>`).join('')}</div>`;
  if (index === 1)
    return `<div class="demo-files"><strong>${c.fileTitle}</strong>${c.fileNames.map((n, i) => `<div class="demo-file"><span class="file-glyph" aria-hidden="true">${['MP4', 'ZIP', 'MD'][i]}</span><strong>${n}</strong><span>${c.fileStatus[i]}</span></div>`).join('')}</div>`;
  if (index === 2)
    return `<article class="demo-note"><span class="type-pill">${c.noteType}</span><h3>${c.noteTitle}</h3><p>${c.noteBody}</p><small>${c.noteLinks}</small></article>`;
  if (index === 3)
    return `<article class="demo-bookmark"><div class="demo-web-image" aria-hidden="true"><span></span><span></span><span></span></div><div><small>example.org / research</small><h3>${c.bookmarkTitle}</h3><p>${c.bookmarkBody}</p><span class="saved-state">✓ ${c.bookmarkState}</span></div></article>`;
  if (index === 4)
    return `<div class="demo-canvas"><svg viewBox="0 0 700 260" aria-hidden="true"><path d="M150 90L350 160L570 90"/></svg>${c.canvasNodes.map((n, i) => `<div class="canvas-node node-${i}"><span>0${i + 1}</span><strong>${n}</strong><i aria-hidden="true"></i></div>`).join('')}</div>`;
  return `<div class="demo-graph"><svg viewBox="0 0 700 260" role="img" aria-label="${esc(c.demoText[5])}"><g class="graph-lines"><path d="M350 120L160 55M350 120L150 205M350 120L555 55M350 120L555 205M160 55L150 205"/></g>${[
    [350, 120],
    [160, 55],
    [150, 205],
    [555, 55],
    [555, 205],
  ]
    .map(
      ([x, y], i) =>
        `<g><circle cx="${x}" cy="${y}" r="${i === 0 ? 22 : 12}" class="graph-color-${i}"/><text x="${x}" y="${y + 37}" text-anchor="middle">${c.graphNames[i]}</text></g>`,
    )
    .join('')}</svg></div>`;
}
function page(lang, c) {
  const route = lang === 'ru' ? '/product.html' : '/product-en.html';
  const mail = `mailto:hello@smena.agency?subject=${encodeURIComponent(c.mailSubject)}`;
  const ctas = `<a class="button primary" href="/">${c.enter}<span aria-hidden="true">↗</span></a><a class="button secondary" href="${mail}">${c.discuss}</a>`;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${c.title}</title><meta name="description" content="${esc(c.description)}"><meta name="theme-color" content="#f8f7f3"><meta property="og:type" content="website"><meta property="og:title" content="${esc(c.title)}"><meta property="og:description" content="${esc(c.description)}"><meta property="og:url" content="https://smena.team${route}"><meta property="og:image" content="https://smena.team/product-share.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><link rel="canonical" href="https://smena.team${route}"><link rel="alternate" hreflang="ru" href="https://smena.team/product.html"><link rel="alternate" hreflang="en" href="https://smena.team/product-en.html"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/product.css"><script src="/product.js" defer></script></head>
<body><a class="skip-link" href="#main">${c.skip}</a><header class="site-header"><a class="brand" href="${route}" aria-label="Smena"><img src="/favicon.svg" width="36" height="36" alt=""><span>SMENA<span class="brand-period">.</span></span></a><nav aria-label="${lang === 'ru' ? 'Навигация по странице' : 'Page navigation'}"><a href="#features">${c.nav[0]}</a><a href="#workflow">${c.nav[1]}</a><a href="#start">${c.nav[2]}</a></nav><div class="header-actions"><a class="language" href="${c.other}" lang="${lang === 'ru' ? 'en' : 'ru'}" hreflang="${lang === 'ru' ? 'en' : 'ru'}">${c.language}</a><a class="button small secondary" href="/">${c.login} <span aria-hidden="true">↗</span></a></div></header>
<main id="main"><section class="hero wrap"><p class="eyebrow">${c.eyebrow}</p><h1>${c.headline}</h1><p class="hero-lead">${c.lead}</p><div class="cta-row">${ctas}</div><p class="access-note">${c.access}</p><div class="hero-foot"><span>01 — 06</span><a href="#demo">${c.demo} <span aria-hidden="true">↓</span></a></div></section>
<section class="demo-section wrap" id="demo" aria-labelledby="demo-heading"><div class="section-caption"><h2 id="demo-heading">${c.demo}</h2><p>${c.demoNote}</p></div><div class="workbench"><div class="workbench-bar"><span class="workbench-brand" aria-hidden="true">S</span><strong>${c.project}</strong><span class="workbench-status" aria-hidden="true">●</span></div><div class="demo-tabs" aria-label="${lang === 'ru' ? 'Раздел демонстрации' : 'Demo section'}">${c.demoTabs.map((t, i) => `<a id="tab-${ids[i]}" href="#panel-${ids[i]}">${t}</a>`).join('')}</div><div class="demo-panels">${ids.map((id, i) => `<section id="panel-${id}" class="demo-panel" aria-labelledby="tab-${id}">${demo(c, i)}<p class="demo-description">${c.demoText[i]}</p></section>`).join('')}</div></div></section>
<section class="workflow wrap" id="workflow"><div class="section-intro"><p class="eyebrow">${lang === 'ru' ? 'ОДИН РАБОЧИЙ ПРОЦЕСС' : 'ONE CONNECTED WORKFLOW'}</p><h2>${c.workflowTitle}</h2><p>${c.workflowLead}</p></div><ol class="workflow-steps">${c.steps.map(([h, p], i) => `<li><span>0${i + 1}</span><h3>${h}</h3><p>${p}</p></li>`).join('')}</ol></section>
<section class="features wrap" id="features"><div class="section-intro"><p class="eyebrow">${lang === 'ru' ? 'ВОЗМОЖНОСТИ' : 'CAPABILITIES'}</p><h2>${c.featureTitle}</h2><p>${c.featureLead}</p></div>${c.features.map(([number, title, lead, details]) => `<section class="feature-row"><div class="feature-heading"><span class="feature-number">${number}</span><h3>${title}</h3><p>${lead}</p></div><div class="feature-details">${details.map(([h, p]) => `<details><summary>${h}<span aria-hidden="true">+</span></summary><p>${p}</p></details>`).join('')}</div></section>`).join('')}</section>
<section class="start-section" id="start"><div class="wrap"><p class="eyebrow">${lang === 'ru' ? 'ПЕРВЫЙ ШАГ' : 'YOUR FIRST STEP'}</p><h2>${c.startTitle}</h2><div class="start-paths"><article><span class="path-label">01</span><h3>${c.employee}</h3><p>${c.employeeText}</p><ol>${c.employeeSteps.map(s => `<li>${s}</li>`).join('')}</ol><a class="button primary" href="/">${c.enter} <span aria-hidden="true">↗</span></a></article><article><span class="path-label">02</span><h3>${c.team}</h3><p>${c.teamText}</p><ol>${c.teamSteps.map(s => `<li>${s}</li>`).join('')}</ol><a class="button secondary" href="${mail}">${c.discuss}</a><a class="contact-link" href="mailto:hello@smena.agency">hello@smena.agency</a></article></div></div></section>
<section class="faq wrap"><h2>${c.faqTitle}</h2><div>${c.faq.map(([q, a]) => `<details><summary>${q}<span aria-hidden="true">+</span></summary><p>${a}</p></details>`).join('')}</div></section><section class="final-cta wrap"><p class="eyebrow">SMENA.TEAM</p><h2>${c.finalTitle}</h2><p>${c.finalText}</p><div class="cta-row">${ctas}</div></section></main><footer class="site-footer wrap"><div><a class="brand" href="${route}">SMENA.</a><p>${c.footer}</p></div><nav aria-label="${lang === 'ru' ? 'Справочные ссылки' : 'Reference links'}"><a href="/about.html">${c.about}</a><a href="${lang === 'ru' ? '/mcp-setup.html' : '/mcp-setup-en.html'}">${c.guide}</a><a href="/privacy.html">${c.privacy}</a><a href="/terms.html">${c.terms}</a><a href="mailto:hello@smena.agency">hello@smena.agency</a></nav><small>© 2026 Smena Manager</small></footer></body></html>`;
}
for (const [lang, c] of Object.entries(copy))
  await writeFile(new URL(`../public/product${lang === 'en' ? '-en' : ''}.html`, import.meta.url), page(lang, c), 'utf8');
