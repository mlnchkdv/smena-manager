import { icons } from 'lucide';

const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function ic(name, size = 16) {
  let nodes = icons[name];
  if (nodes[0] === 'svg') nodes = nodes[2];
  return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${nodes
    .map(
      ([tag, attrs]) =>
        `<${tag} ${Object.entries(attrs)
          .filter(([key]) => key !== 'key')
          .map(([key, value]) => `${key}="${esc(value)}"`)
          .join(' ')}/>`,
    )
    .join('')}</svg>`;
}

// Same component classes, hierarchy, icons and source CSS as the application.
// Only invented fixture data and local demo actions; never imports the app store.
export function productDemo(c, index, compact = false) {
  const ru = c.other === '/product-en.html';
  const T = (en, russian) => (ru ? russian : en);
  const button = (action, label, icon = '', primary = false) =>
    `<button type="button" class="btn ${primary ? 'btn-primary' : 'btn-secondary'}" data-demo-action="${action}">${icon ? ic(icon) : ''}${label}</button>`;
  const heading = text =>
    `<div class="example-heading"><span class="picon" style="--c:var(--accent)">${ic(['FolderKanban', 'Files', 'Library', 'Bookmark', 'PanelsTopLeft', 'Network'][index])}</span><strong>${text}</strong></div>`;
  let body = '';
  if (index === 0) {
    body = `${heading(c.project)}<div class="example-toolbar"><span class="hint">${T('Click a task to change its status.', 'Нажмите задачу, чтобы сменить статус.')}</span>${button('board-layout', T('List', 'Список'), 'List')}</div><div class="board" data-demo-board>${[c.plan, c.work, c.done].map((name, i) => `<section class="bcol"><div class="bcol-h"><span class="status-dot status-${i}"></span><span>${name}</span><span class="cnt">1</span></div><div class="bcol-b"><button class="kcard" data-demo-action="task" data-task="${i}"><span class="kcard-title">${esc(c.tasks[i])}</span><span class="example-card-meta"><span>${ic('MessageSquare', 12)} ${i + 1}</span><span class="av sm" style="--c:var(--accent)" aria-label="${T('Demo member', 'Участник демо')}">A</span></span></button></div></section>`).join('')}</div>`;
  } else if (index === 1) {
    body = `${heading(c.fileTitle)}<div class="example-toolbar"><label>${T('File type', 'Тип файлов')}<select class="select" data-demo-filter><option value="all">${T('All types', 'Все типы')}</option><option value="MP4">${T('Video', 'Видео')}</option><option value="MD">${T('Documents', 'Документы')}</option></select></label><span class="hint">${T('Open a sample preview.', 'Откройте пример просмотра.')}</span></div><div class="example-file-list">${c.fileNames.map((name, i) => `<button class="example-file" data-demo-action="file" data-kind="${['MP4', 'ZIP', 'MD'][i]}"><span class="ftype" style="--c:var(--accent)">${ic(['Film', 'FileArchive', 'FileText'][i], 24)}<small>${['MP4', 'ZIP', 'MD'][i]}</small></span><span><strong>${esc(name)}</strong><small>${['24.8 MB', '148 MB', '2.4 KB'][i]} · ${c.project}</small></span>${ic('ChevronRight')}</button>`).join('')}</div><div class="example-upload"><span>${ic('Upload')} ${T('Demo upload queue', 'Демонстрация очереди')}</span><span class="prog" role="progressbar" aria-label="${T('Demo progress', 'Прогресс демо')}" aria-valuenow="64" aria-valuemin="0" aria-valuemax="100"><i style="--p:.64"></i></span><b>64%</b><button class="btn btn-secondary" data-demo-action="queue" aria-pressed="false">${T('Pause', 'Пауза')}</button></div>`;
  } else if (index === 2) {
    body = `${heading(T('Knowledge', 'База знаний'))}<div class="example-toolbar"><label>${T('Note type', 'Тип заметки')}<select class="select knowledge-note-type" data-demo-type><option>${c.noteType}</option><option>${T('Meeting', 'Встреча')}</option><option>${T('Research', 'Исследование')}</option></select></label>${button('note-version', T('Previous version', 'Прежняя версия'), 'History')}</div><article class="example-note"><h3>${c.noteTitle}</h3><p data-demo-note-body data-current="${esc(c.noteBody)}" data-previous="${esc(T('First draft: clarify the main user workflow before adding more settings.', 'Первый черновик: уточнить основной сценарий перед добавлением настроек.'))}">${c.noteBody}</p><div class="example-links">${ic('Network')} ${c.noteLinks}</div></article>`;
  } else if (index === 3) {
    const covers = [
      T('Work with context.', '\u0420\u0430\u0431\u043e\u0442\u0430\u0439\u0442\u0435 \u0441 \u043a\u043e\u043d\u0442\u0435\u043a\u0441\u0442\u043e\u043c.'),
      T('Keep the reasoning.', '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0439\u0442\u0435 \u0440\u0435\u0448\u0435\u043d\u0438\u044f.'),
      T(
        'Make the next step clear.',
        '\u0423\u043f\u0440\u043e\u0449\u0430\u0439\u0442\u0435 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433.',
      ),
    ];
    const cards = [
      c.bookmarkTitle,
      T(
        'Guide: a shared team memory',
        '\u0413\u0438\u0434: \u043e\u0431\u0449\u0430\u044f \u043f\u0430\u043c\u044f\u0442\u044c \u043a\u043e\u043c\u0430\u043d\u0434\u044b',
      ),
      T(
        'Checklist: from idea to delivery',
        '\u0427\u0435\u043a-\u043b\u0438\u0441\u0442: \u043e\u0442 \u0438\u0434\u0435\u0438 \u0434\u043e \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0430',
      ),
    ]
      .slice(0, compact ? 1 : 3)
      .map(
        (title, i) =>
          `<article class="bookmark-card"><button class="bookmark-thumbnail" data-demo-action="archive" aria-label="${T('View saved page', 'Открыть сохранённую страницу')}"><span class="example-page-cover"><small>RESEARCH / 01</small><strong>${esc(covers[i])}</strong><span>example.org</span></span></button><div class="bookmark-card-top"><div class="bookmark-card-heading"><button class="bookmark-title" data-demo-action="archive">${esc(title)}</button><span class="bookmark-host">example.org</span></div></div><p class="bookmark-description">${c.bookmarkBody}</p><div class="bookmark-preview-row"><span class="bookmark-save-state">${ic('Archive', 13)} ${T('HTML saved', 'HTML сохранён')}</span><button class="btn btn-ghost btn-sm" data-demo-action="archive">${T('View archive', 'Открыть архив')}</button></div><div class="bookmark-card-foot"><span class="bookmark-read-state">${T('To read', 'Прочитать')}</span><button class="ibtn" data-demo-action="favorite" aria-label="${T('Favorite sample bookmark', 'Избранное для закладки демо')}" aria-pressed="false">${ic('Star')}</button></div></article>`,
      )
      .join('');
    body = `${heading(T('Bookmarks', 'Закладки'))}<div class="example-toolbar"><label class="example-search">${ic('Search')}<input class="input" type="search" data-demo-search placeholder="${T('Search bookmarks', 'Поиск закладок')}" aria-label="${T('Search demo bookmarks', 'Поиск закладок в демо')}"></label>${button('bookmark-layout', T('List', 'Список'), 'List')}</div><div class="bookmark-library"><div class="bookmark-grid">${cards}</div></div><p class="example-empty" hidden>${T('No matches. Try another search.', 'Ничего не найдено. Измените запрос.')}</p><template data-demo-archive><article class="example-saved-page"><small>${T('Saved HTML sample · 17 November 2026', 'Пример сохранённого HTML · 17 ноября 2026')}</small><h3>${T('Work with context.', 'Работайте с контекстом.')}</h3><p>${c.bookmarkBody}</p><div class="example-saved-columns"><span>${c.demoTabs[2]}</span><span>${c.demoTabs[0]}</span><span>${c.demoTabs[1]}</span></div><p>${T('The real archive stores the downloaded page styles, images and fonts. Scripts and embedded pages are disabled.', 'Настоящий архив сохраняет загруженные стили, изображения и шрифты страницы. Скрипты и встроенные страницы отключены.')}</p></article></template>`;
  } else if (index === 4) {
    body = `<div class="canvas-trial" data-product-canvas><div class="canvas-trial-tools">${button('canvas-add', T('Add card', 'Добавить карточку'), 'Plus')}<button class="btn btn-secondary" type="button" data-demo-connections aria-pressed="true">${T('Connections', 'Связи')}</button><button class="btn btn-ghost" type="button" data-demo-reset>${T('Reset', 'Сбросить')}</button></div><div class="canvas-trial-stage"><svg aria-hidden="true"><path/></svg>${c.canvasNodes.map((name, i) => `<div class="trial-node trial-node-${i}" data-demo-node="${i}"><button class="trial-node-title" type="button" aria-label="${esc(T('Move: ', 'Переместить: ') + name)}"><strong>${name}</strong></button><span>${[c.demoTabs[3], c.noteType, c.demoTabs[0]][i]}</span><button class="trial-node-resize" type="button" aria-label="${esc(T('Resize: ', 'Изменить размер: ') + name)}">${ic('MoveDiagonal2')}</button></div>`).join('')}</div><p class="canvas-trial-hint">${T('Drag a title or corner. Keyboard: arrow keys, Shift for larger steps.', 'Тяните за заголовок или угол. Клавиатура: стрелки, Shift — больший шаг.')}</p></div>`;
  } else {
    body = `${heading(T('Graph', 'Граф'))}<div class="example-toolbar">${button('graph-simple', T('Simplified view', 'Упрощённый вид'), 'CircleDot')}<span class="hint">${T('Select a node to see its connections.', 'Выберите узел, чтобы увидеть его связи.')}</span></div><div class="demo-graph"><svg viewBox="0 0 700 260" aria-hidden="true"><g class="graph-lines"><path d="M350 120L160 55M350 120L150 205M350 120L555 55M350 120L555 205M160 55L150 205"/></g>${[
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
      .join(
        '',
      )}</svg></div><div class="example-graph-nodes" aria-label="${T('Select graph node', 'Выбрать узел графа')}">${c.graphNames.map((name, i) => `<button class="btn btn-secondary" data-demo-action="graph-node" data-node="${i}" aria-pressed="false">${name}</button>`).join('')}</div>`;
  }
  return `<div class="product-demo" data-product-example="${index}">${body}<p class="example-status" role="status" aria-live="polite">${T('Demo. Changes are not saved.', 'Демонстрация. Изменения не сохраняются.')}</p><dialog class="example-dialog" aria-label="${T('Demo preview', '\u041f\u0440\u0438\u043c\u0435\u0440 \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0430')}"><div class="example-dialog-head"><strong>${T('Demo preview', 'Пример просмотра')}</strong><button class="ibtn" data-demo-action="close-dialog" aria-label="${T('Close preview', 'Закрыть просмотр')}">${ic('X')}</button></div><div class="example-dialog-body"></div></dialog></div>`;
}
