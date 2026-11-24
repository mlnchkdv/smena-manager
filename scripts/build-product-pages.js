import { readFile, writeFile } from 'node:fs/promises';
import postcss from 'postcss';
import { productDemo as demo } from './product-demo.js';

// Public copy is deliberately independent of workspace data and credentials.
const copy = {
  ru: {
    title: 'smena.team — проекты, знания и материалы команды в одном пространстве',
    description:
      'Планируйте проекты, храните знания и файлы, сохраняйте страницы, собирайте идеи на холстах и находите связи в графе. Узнайте, как работает smena.team.',
    skip: 'К содержимому',
    nav: ['Возможности', 'Как это работает', 'Начать работу'],
    login: 'Войти',
    eyebrow: 'РАБОЧЕЕ ПРОСТРАНСТВО КОМАНДЫ',
    headline: 'От идеи<br>до результата.',
    lead: 'Ведите проекты, собирайте материалы и делитесь знаниями в одном рабочем пространстве.',
    enter: 'Войти в пространство',
    discuss: 'Обсудить запуск команды',
    access: 'Для сотрудников — вход через Google после добавления администратором. Для новых команд — знакомство и обсуждение настройки.',
    demo: 'Посмотрите на работу в контексте',
    demoNote: 'Интерактивная демонстрация · Все данные вымышлены',
    demoTabs: ['Проекты', 'Файлы', 'Знания', 'Закладки', 'Холсты', 'Граф', 'Исследования'],
    demoText: [
      'Одна задача — разные представления. Доска помогает видеть поток работы, список — быстро разбирать детали.',
      'Фотографии, видео и документы — в папках проекта. Очередь показывает ход загрузки и доступные действия.',
      'Заметка хранит решение, его причины и ссылки на материалы. Версии помогают вернуться к прежнему тексту.',
      'Сохраните источник и читаемую копию страницы: контекст останется, даже если оригинал изменится.',
      'Разложите материалы на холсте, измените размеры карточек и соедините идеи с задачами.',
      'Найдите связи между материалами. Фильтры и фокус помогают исследовать нужный фрагмент.',
      'От гипотезы и протокола до сравнения запусков и мини-статьи. Откройте каждый шаг демонстрации.',
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
    featureLead: 'От ежедневных задач до командной памяти. Посмотрите, как каждый инструмент помогает общей работе.',
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
          ['Быстрое сохранение', 'Вставьте URL: smena.team попробует заполнить название и описание. Поля можно отредактировать, добавить теги и папку.'],
          [
            'HTML-архив страницы',
            'Сохраните публичный HTML вместе со стилями, изображениями и шрифтами. Архив открывается независимо от оригинала; есть текстовый вид и скачивание HTML. До 10 активных копий; прежние версии можно убрать из активных и вернуть. Недоступные ресурсы отмечаются; содержимое, добавляемое JavaScript или требующее входа, может отсутствовать.',
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
            'smena.team можно развернуть на сервере команды с Google-входом и Google Drive. Домен, хранение, резервные копии и интеграции требуют настройки. Встроенный платный ИИ-провайдер не включён по умолчанию.',
          ],
        ],
      ],
    ],
    startTitle: 'Как начать работу',
    employee: 'Я сотрудник',
    employeeText: 'Если команда уже работает в smena.team, отдельная регистрация не нужна.',
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
      'До пилота согласуйте лимиты файлов и хранения, график копий, ответственного за восстановление, канал поддержки и порядок передачи экспорта при завершении работы. Проверьте открытие экспорта вместе.',
    ],
    faqTitle: 'Перед началом — несколько ответов',
    faq: [
      [
        'Можно ли посмотреть возможности без входа?',
        'Да. Эта страница и демонстрация публичны. Рабочие проекты и материалы доступны только авторизованным участникам, кроме отдельно выданных публичных ссылок.',
      ],
      [
        'Это замена сразу всем инструментам?',
        'smena.team объединяет основные рабочие сценарии. Сложный монтаж, полноценные дизайн-макеты и специализированные инструменты остаются во внешних приложениях; результаты можно хранить и связывать здесь.',
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
    mailSubject: 'smena.team — запуск пространства для команды',
  },
  en: {
    title: 'smena.team — team projects, knowledge and materials in one workspace',
    description:
      'Plan projects, keep knowledge and files, save web pages, map ideas on whiteboards and explore connections in a graph. See how smena.team works.',
    skip: 'Skip to content',
    nav: ['Features', 'How it works', 'Get started'],
    login: 'Sign in',
    eyebrow: 'A WORKSPACE FOR YOUR TEAM',
    headline: 'From idea<br>to delivery.',
    lead: 'Plan projects, collect materials and share knowledge in one workspace.',
    enter: 'Open your workspace',
    discuss: 'Discuss your team setup',
    access: 'Employees sign in with Google after an administrator adds them. New teams can get in touch to discuss their setup.',
    demo: 'See work in context',
    demoNote: 'Interactive demo · All data is illustrative',
    demoTabs: ['Projects', 'Files', 'Knowledge', 'Bookmarks', 'Whiteboards', 'Graph', 'Research'],
    demoText: [
      'One task, different perspectives. Use a board to see the flow of work or a list to review details.',
      'Keep photos, videos and documents in project folders. The upload queue shows progress and available actions.',
      'A note keeps the decision, its reasoning and source links together. Versions help you recover earlier text.',
      'Save a source and a readable page copy so its context survives changes to the original.',
      'Arrange materials on a whiteboard, resize cards and connect ideas to tasks.',
      'Explore connections between materials. Filters and focus keep the relevant part in view.',
      'Follow a hypothesis from the protocol through run comparison and a short article. Open each demo step.',
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
    featureLead: 'From daily tasks to team memory. See how each tool supports your shared work.',
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
          ['Quick capture', 'Paste a URL: smena.team will try to fill in its title and description. Edit the details, add tags and choose a folder.'],
          [
            'HTML page archives',
            'Save public HTML with CSS, images and fonts. Open it independently of the original, switch to text or download the HTML. Keep up to 10 active copies; store and restore older versions. Unavailable resources are reported; content added by JavaScript or requiring sign-in may be absent.',
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
            'smena.team can run on your team’s server with Google sign-in and Google Drive. Domain, storage, backups and integrations require setup. A paid hosted AI provider is not included by default.',
          ],
        ],
      ],
    ],
    startTitle: 'Start with your team',
    employee: 'I am a team member',
    employeeText: 'If your team already uses smena.team, you do not need a separate registration.',
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
      'Before the pilot, agree on file and storage limits, backup frequency, a recovery owner, support contact and export handover when the team leaves. Open a test export together.',
    ],
    faqTitle: 'A few answers before you begin',
    faq: [
      [
        'Can I explore without signing in?',
        'Yes. This page and demo are public. Working projects and materials require membership, except for individually issued public links.',
      ],
      [
        'Does this replace every specialized tool?',
        'smena.team brings core work together. Advanced editing, full design files and specialized workflows remain in external apps; you can keep and link their results here.',
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
    mailSubject: 'smena.team — team workspace setup',
  },
};
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const ids = ['projects', 'files', 'knowledge', 'bookmarks', 'whiteboards', 'graph', 'research'];
function stories(c, lang) {
  const ru = lang === 'ru';
  const rows = [
    [c.features[0], 0],
    [c.features[1], 1],
    [c.features[2], 2],
    [c.features[3], 3],
    [
      [
        '05',
        ru ? 'Холсты' : 'Whiteboards',
        ru ? 'Дайте идеям место. Соберите из них план.' : 'Give ideas room. Turn them into a plan.',
        c.features[4][3].slice(0, 2),
      ],
      4,
    ],
    [
      [
        '06',
        ru ? 'Граф связей' : 'A graph of connections',
        ru ? 'Находите то, что связывает ваши материалы.' : 'Find what connects your materials.',
        c.features[4][3].slice(2),
      ],
      5,
    ],
    [
      [
        '07',
        ru ? 'Исследования' : 'Research',
        ru ? 'Гипотезы, замеры и решения в журнале проекта.' : 'Hypotheses, measurements and decisions in one project journal.',
        ru
          ? [
              ['План эксперимента', 'Задайте гипотезу, критерий успеха и протокол. Свяжите запуск с версией набора данных.'],
              ['Сравнение и отчёт', 'Сравните условия и замеры. Подготовьте мини-статью или скачайте ZIP с материалами журнала и их редакциями.'],
            ]
          : [
              ['Experiment plan', 'Write a hypothesis, success criterion and protocol. Link the run to a dataset version.'],
              ['Comparison and reporting', 'Compare conditions and measurements. Draft a short article or download a ZIP of journal records and revisions.'],
            ],
      ],
      6,
    ],
    [['08', ...c.features[5].slice(1)], 7],
  ];
  return rows
    .map(
      ([[number, title, lead, details], index]) =>
        `<section class="feature-story" id="feature-${index === 7 ? 'spaces' : ids[index]}"><div class="story-copy"><p class="eyebrow">${number} / ${title}</p><h3>${lead}</h3><dl>${details.map(([h, p]) => `<div><dt>${h}</dt><dd>${p}</dd></div>`).join('')}</dl>${index === 7 ? `<a class="text-link" href="${ru ? '/mcp-setup.html' : '/mcp-setup-en.html'}">${c.guide} ↗</a>` : ''}</div><div class="story-scene"><div class="scene-chrome"><span aria-hidden="true">S</span><strong>${c.project}</strong><small>${title}</small></div>${index < ids.length ? demo(c, index, true) : `<div class="demo-access"><span class="type-pill">smena.team / ${ru ? 'КОМАНДА' : 'TEAM'}</span><h4>${ru ? 'Общая работа. Ваши настройки.' : 'Shared work. Your own setup.'}</h4><div><b>${ru ? 'Пространства' : 'Workspaces'}</b><span>${ru ? 'Команда · Личное' : 'Team · Personal'}</span></div><div><b>${ru ? 'Доступ' : 'Access'}</b><span>${ru ? 'Роли · Срок ссылки · Отзыв' : 'Roles · Link expiry · Revoke'}</span></div><div><b>API / MCP</b><span>Codex ↔ ${ru ? 'Заметки и файлы' : 'Notes and files'}</span></div></div>`}</div></section>`,
    )
    .join('');
}
function page(lang, c) {
  const route = lang === 'ru' ? '/product.html' : '/product-en.html';
  const mail = `mailto:hello@smena.agency?subject=${encodeURIComponent(c.mailSubject)}`;
  const ctas = `<a class="button primary" href="#demo">${lang === 'ru' ? 'Посмотреть демо' : 'Explore demo'}<span aria-hidden="true">↗</span></a><a class="button secondary" href="${mail}">${c.discuss}</a>`;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${c.title}</title><meta name="description" content="${esc(c.description)}"><meta name="theme-color" content="#fbfaf8"><meta property="og:type" content="website"><meta property="og:title" content="${esc(c.title)}"><meta property="og:description" content="${esc(c.description)}"><meta property="og:url" content="https://smena.team${route}"><meta property="og:image" content="https://smena.team/product-share.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><link rel="canonical" href="https://smena.team${route}"><link rel="alternate" hreflang="ru" href="https://smena.team/product.html"><link rel="alternate" hreflang="en" href="https://smena.team/product-en.html"><link rel="icon" href="/favicon.svg"><script src="/product-theme.js"></script><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400&display=swap" rel="stylesheet"><link rel="stylesheet" href="/product-system.css"><link rel="stylesheet" href="/product.css"><script src="/product.js" defer></script></head>
<body><a class="skip-link" href="#main">${c.skip}</a><header class="site-header"><a class="brand" href="${route}" aria-label="smena.team"><img src="/favicon.svg" width="36" height="36" alt=""><span>smena.team</span></a><nav aria-label="${lang === 'ru' ? 'Навигация по странице' : 'Page navigation'}"><a href="#features">${c.nav[0]}</a><a href="#workflow">${c.nav[1]}</a><a href="#start">${c.nav[2]}</a></nav><div class="header-actions"><button class="theme-toggle" type="button" data-product-theme aria-label="${lang === 'ru' ? '\u0422\u0451\u043c\u043d\u0430\u044f \u0442\u0435\u043c\u0430' : 'Dark theme'}" aria-pressed="false"><span aria-hidden="true">\u25d0</span></button><a class="language" href="${c.other}" lang="${lang === 'ru' ? 'en' : 'ru'}" hreflang="${lang === 'ru' ? 'en' : 'ru'}" aria-label="${c.language}">${lang === 'ru' ? 'EN' : 'RU'}</a><a class="button small secondary" href="/">${c.login} <span aria-hidden="true">↗</span></a></div></header>
<main id="main"><section class="hero wrap"><p class="eyebrow">smena.team <span aria-hidden="true">/</span> <a href="https://smena.agency" target="_blank" rel="noopener noreferrer">${lang === 'ru' ? 'Продукт smena.agency' : 'A product by smena.agency'}</a></p><h1>${c.headline}</h1><p class="hero-lead">${c.lead}</p><div class="cta-row hero-actions">${ctas}</div></section>
<section class="demo-section wrap" id="demo" aria-labelledby="demo-heading"><div class="section-caption"><h2 id="demo-heading">${lang === 'ru' ? 'Демо' : 'Demo'}</h2></div><div class="workbench"><div class="workbench-bar"><span class="workbench-brand" aria-hidden="true">S</span><strong>${c.project}</strong><span class="workbench-status" aria-hidden="true">●</span></div><div class="demo-tabs" aria-label="${lang === 'ru' ? 'Раздел демонстрации' : 'Demo section'}">${c.demoTabs.map((t, i) => `<a id="tab-${ids[i]}" href="#panel-${ids[i]}">${t}</a>`).join('')}</div><div class="demo-panels">${ids.map((id, i) => `<section id="panel-${id}" class="demo-panel" aria-labelledby="tab-${id}">${demo(c, i)}<p class="demo-description">${c.demoText[i]}</p></section>`).join('')}</div></div><p class="demo-footnote">${c.demoNote}</p><nav class="cta-row hero-paths" aria-label="${lang === 'ru' ? 'Выбрать демонстрацию' : 'Choose a demo'}"><a class="text-link" href="#panel-projects">${lang === 'ru' ? 'Управлять проектами' : 'Manage projects'}</a> <a class="text-link" href="#panel-knowledge">${lang === 'ru' ? 'Собирать знания' : 'Organize knowledge'}</a> <a class="text-link" href="#panel-research">${lang === 'ru' ? 'Вести исследования' : 'Run experiments'}</a></nav><p class="access-note">${c.access}</p></section>
<section class="workflow wrap" id="workflow"><div class="section-intro"><p class="eyebrow">${lang === 'ru' ? 'ОДИН РАБОЧИЙ ПРОЦЕСС' : 'ONE CONNECTED WORKFLOW'}</p><h2>${c.workflowTitle}</h2><p>${c.workflowLead}</p></div><ol class="workflow-steps">${c.steps.map(([h, p], i) => `<li><span>0${i + 1}</span><h3>${h}</h3><p>${p}</p></li>`).join('')}</ol></section>
<section class="features wrap" id="features"><div class="section-intro"><p class="eyebrow">${lang === 'ru' ? 'ВОЗМОЖНОСТИ' : 'CAPABILITIES'}</p><h2>${c.featureTitle}</h2><p>${c.featureLead}</p></div>${stories(c, lang)}</section>
<section class="start-section" id="start"><div class="wrap"><p class="eyebrow">${lang === 'ru' ? 'ПЕРВЫЙ ШАГ' : 'YOUR FIRST STEP'}</p><h2>${c.startTitle}</h2><div class="start-paths"><article><span class="path-label">01</span><h3>${c.employee}</h3><p>${c.employeeText}</p><ol>${c.employeeSteps.map(s => `<li>${s}</li>`).join('')}</ol><a class="button primary" href="/">${c.enter} <span aria-hidden="true">↗</span></a></article><article><span class="path-label">02</span><h3>${c.team}</h3><p>${c.teamText}</p><ol>${c.teamSteps.map(s => `<li>${s}</li>`).join('')}</ol><a class="button secondary" href="${mail}">${c.discuss}</a><a class="contact-link" href="mailto:hello@smena.agency">hello@smena.agency</a></article></div></div></section>
<section class="faq wrap"><h2>${c.faqTitle}</h2><div>${c.faq.map(([q, a]) => `<details><summary>${q}<span aria-hidden="true">+</span></summary><p>${a}</p></details>`).join('')}</div></section><section class="final-cta wrap"><p class="eyebrow">smena.team</p><h2>${c.finalTitle}</h2><p>${c.finalText}</p><div class="cta-row">${ctas}</div></section></main><footer class="site-footer wrap"><div><a class="brand" href="${route}">smena.team</a><p>${c.footer}</p><p class="agency-credit">${lang === 'ru' ? 'Создано агентством' : 'Created by'} <a href="https://smena.agency" aria-label="smena.agency" target="_blank" rel="noopener noreferrer"><span class="agency-wordmark" aria-hidden="true"></span></a></p></div><nav aria-label="${lang === 'ru' ? 'Справочные ссылки' : 'Reference links'}"><a href="${lang === 'ru' ? '/mcp-setup.html' : '/mcp-setup-en.html'}">${c.guide}</a><a href="${lang === 'ru' ? '/privacy.html' : '/privacy-en.html'}">${c.privacy}</a><a href="${lang === 'ru' ? '/terms.html' : '/terms-en.html'}">${c.terms}</a><a href="mailto:hello@smena.agency">hello@smena.agency</a></nav><small>© 2026 smena.team</small></footer></body></html>`;
}
for (const [lang, c] of Object.entries(copy))
  await writeFile(new URL(`../public/product${lang === 'en' ? '-en' : ''}.html`, import.meta.url), page(lang, c), 'utf8');
for (const [lang, c] of Object.entries(copy))
  for (const previous of [false, true]) {
    const ru = lang === 'ru';
    const title = previous ? (ru ? 'Общая память команды' : 'A shared team memory') : ru ? 'Работайте с контекстом.' : 'Work with context.';
    await writeFile(
      new URL(`../public/product-saved-page-${lang}${previous ? '-previous' : ''}.html`, import.meta.url),
      `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/product-saved-page.css"></head><body class="${previous ? 'previous' : ''}"><header><small>SMENA.TEAM / ${ru ? 'СОХРАНЁННЫЙ ПРИМЕР' : 'SAVED EXAMPLE'} / ${previous ? '12' : '17'}.11.2026</small><h1>${title}</h1><p>${c.bookmarkBody}</p></header><main><h2>${ru ? 'От источника к решению' : 'From source to decision'}</h2><p>${ru ? 'Сохраните полезную страницу, свяжите её с заметкой и используйте в следующей задаче.' : 'Save a useful page, connect it to a note and use it in the next task.'}</p><div class="steps">${[c.demoTabs[3], c.demoTabs[2], c.demoTabs[0]].map((name, index) => `<section><b>0${index + 1}</b><strong>${name}</strong></section>`).join('')}</div><p>${ru ? 'Этот пример показывает независимое оформление сохранённой страницы. В системе HTML, стили, изображения и шрифты сохраняются в архив.' : 'This example shows the saved page with its own appearance. In the workspace, HTML, styles, images and fonts are kept in the archive.'}</p></main></body></html>`,
      'utf8',
    );
  }

// Build from the very same token and component sources as the signed-in UI.
const componentFiles = [
  'components.css',
  'views/board.css',
  'views/projects-files.css',
  'pages/bookmarks.css',
  'pages/bookmark-thumbnails.css',
  'pages/bookmark-library.css',
];
let systemCss =
  '/* Generated by scripts/build-product-pages.js. Do not edit. */\n' + (await readFile(new URL('../src/styles/tokens.css', import.meta.url), 'utf8'));
for (const file of componentFiles) {
  const tree = postcss.parse(await readFile(new URL('../src/styles/' + file, import.meta.url), 'utf8'));
  tree.walkRules(rule => {
    let parent = rule.parent;
    while (parent) {
      if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
      parent = parent.parent;
    }
    rule.selectors = rule.selectors.map(selector => '.product-demo ' + selector);
  });
  systemCss += '\n' + tree.toString();
}
await writeFile(new URL('../public/product-system.css', import.meta.url), systemCss);
