// Enhance ordinary anchor links; every panel remains readable without JavaScript.
const tablist = document.querySelector('.demo-tabs');
const tabs = [...(tablist?.querySelectorAll('a') || [])];
if (tabs.length) {
  tablist.setAttribute('role', 'tablist');
  function select(tab, focus = false, updateUrl = false) {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
      document.getElementById(item.getAttribute('aria-controls')).classList.toggle('demo-is-active', selected);
    }
    if (focus) tab.focus();
    if (updateUrl) history.replaceState(null, '', tab.hash);
  }
  for (const tab of tabs) {
    const id = tab.hash.slice(1);
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', id);
    const panel = document.getElementById(id);
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
    tab.addEventListener('click', event => {
      event.preventDefault();
      select(tab, false, true);
    });
    tab.addEventListener('keydown', event => {
      let index = tabs.indexOf(tab);
      if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else return;
      event.preventDefault();
      select(tabs[index], true, true);
    });
  }
  select(tabs.find(tab => tab.hash === location.hash) || tabs[0]);
}

const russian = document.documentElement.lang === 'ru';
const words = (en, ru) => (russian ? ru : en);
const themeButton = document.querySelector('[data-product-theme]');
function themeState() {
  const dark =
    document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.setAttribute('aria-label', words('Dark theme', '\u0422\u0451\u043c\u043d\u0430\u044f \u0442\u0435\u043c\u0430'));
  document.querySelector('meta[name="theme-color"]').content = dark ? '#1a1a19' : '#fbfaf8';
}
themeState();
themeButton.addEventListener('click', () => {
  const dark = themeButton.getAttribute('aria-pressed') !== 'true';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try {
    localStorage.setItem('smena.product.theme', dark ? 'dark' : 'light');
  } catch {
    /* Optional preference. */
  }
  themeState();
});
const languageLink = document.querySelector('.language');
languageLink.addEventListener('click', () => {
  languageLink.hash = location.hash;
});

// Every example has its own synthetic state. No API, auth or workspace imports.
for (const example of document.querySelectorAll('[data-product-example]')) {
  const status = text => {
    example.querySelector('.example-status').textContent =
      text +
      ' ' +
      words(
        'Demo: changes are not saved.',
        '\u0414\u0435\u043c\u043e: \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u043d\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u044e\u0442\u0441\u044f.',
      );
  };
  const dialog = example.querySelector('dialog');
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.querySelectorAll('video,audio').forEach(media => media.pause()));
  const show = content => {
    const body = dialog.querySelector('.example-dialog-body');
    body.replaceChildren(content);
    dialog.showModal();
  };
  const researchSteps = [...example.querySelectorAll('[data-demo-action="research-stage"]')];
  const showResearchStage = stage => {
    for (const step of researchSteps) {
      const selected = step.dataset.stage === stage;
      step.setAttribute('aria-pressed', String(selected));
      step.classList.toggle('on', selected);
    }
    for (const view of example.querySelectorAll('[data-demo-research-view]')) view.hidden = view.dataset.demoResearchView !== stage;
  };
  if (researchSteps.length) showResearchStage(researchSteps[0].dataset.stage);
  example.addEventListener('click', event => {
    const button = event.target.closest('[data-demo-action]');
    if (!button) return;
    const action = button.dataset.demoAction;
    if (action === 'research-stage') {
      showResearchStage(button.dataset.stage);
      status(button.textContent.trim());
    }
    if (action === 'task') {
      const columns = [...example.querySelectorAll('.bcol')];
      const article = document.createElement('article');
      const heading = document.createElement('h3');
      heading.textContent = button.querySelector('.kcard-title').textContent;
      const label = document.createElement('label');
      label.className = 'field';
      label.textContent = words('Status', 'Статус');
      const select = document.createElement('select');
      select.className = 'select';
      columns.forEach((column, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = column.querySelector('.bcol-h>span:nth-child(2)').textContent;
        select.append(option);
      });
      select.value = String(columns.indexOf(button.closest('.bcol')));
      label.append(select);
      const description = document.createElement('p');
      description.textContent = words(
        'Goal: make the next delivery clear. Review the result and move the task when it is ready.',
        'Цель: сделать следующий результат понятным. Проверьте работу и смените статус, когда всё готово.',
      );
      const apply = document.createElement('button');
      apply.className = 'btn btn-primary';
      apply.textContent = words('Apply in demo', 'Применить в демо');
      apply.onclick = () => {
        const before = button.getBoundingClientRect(),
          next = columns[Number(select.value)];
        next.querySelector('.bcol-b').append(button);
        const after = button.getBoundingClientRect();
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
          button.animate([{ transform: `translate(${before.x - after.x}px,${before.y - after.y}px)` }, { transform: 'none' }], {
            duration: 160,
            easing: 'ease-out',
          });
        for (const column of columns) column.querySelector('.cnt').textContent = column.querySelectorAll('.kcard').length;
        status(heading.textContent + ' → ' + select.selectedOptions[0].textContent);
        dialog.close();
        button.focus();
      };
      article.append(heading, description, label, apply);
      show(article);
    } else if (action === 'board-layout' || action === 'bookmark-layout') {
      const board = example.querySelector(action === 'board-layout' ? '.board' : '.bookmark-grid');
      const list = board.classList.toggle('is-list');
      button.textContent = list ? words('Cards', '\u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0438') : words('List', '\u0421\u043f\u0438\u0441\u043e\u043a');
      status(
        list
          ? words('List view selected.', '\u0412\u043a\u043b\u044e\u0447\u0451\u043d \u0441\u043f\u0438\u0441\u043e\u043a.')
          : words('Card view selected.', '\u0412\u043a\u043b\u044e\u0447\u0435\u043d\u044b \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438.'),
      );
    } else if (action === 'favorite' || action === 'queue' || action === 'graph-simple') {
      const pressed = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(pressed));
      if (action === 'favorite')
        status(
          pressed
            ? words(
                'Added to demo favorites.',
                '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0432 \u0438\u0437\u0431\u0440\u0430\u043d\u043d\u043e\u0435 \u0434\u0435\u043c\u043e.',
              )
            : words(
                'Removed from demo favorites.',
                '\u0423\u0431\u0440\u0430\u043d\u043e \u0438\u0437 \u0438\u0437\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u0434\u0435\u043c\u043e.',
              ),
        );
      if (action === 'queue') {
        button.textContent = pressed
          ? words('Resume', '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c')
          : words('Pause', '\u041f\u0430\u0443\u0437\u0430');
        status(
          pressed
            ? words('Sample queue paused.', '\u041e\u0447\u0435\u0440\u0435\u0434\u044c \u0434\u0435\u043c\u043e \u043d\u0430 \u043f\u0430\u0443\u0437\u0435.')
            : words(
                'Sample queue resumed.',
                '\u041e\u0447\u0435\u0440\u0435\u0434\u044c \u0434\u0435\u043c\u043e \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0435\u043d\u0430.',
              ),
        );
      }
      if (action === 'graph-simple') {
        example.querySelector('.demo-graph').classList.toggle('is-simple', pressed);
        status(
          pressed
            ? words('Simplified graph.', '\u0423\u043f\u0440\u043e\u0449\u0451\u043d\u043d\u044b\u0439 \u0433\u0440\u0430\u0444.')
            : words('Detailed graph.', '\u041f\u043e\u0434\u0440\u043e\u0431\u043d\u044b\u0439 \u0433\u0440\u0430\u0444.'),
        );
      }
    } else if (action === 'note-edit') {
      const body = example.querySelector('[data-demo-note-body]');
      const label = document.createElement('label');
      label.className = 'field';
      label.textContent = words('Note text', 'Текст заметки');
      const textarea = document.createElement('textarea');
      textarea.className = 'textarea';
      textarea.rows = 7;
      textarea.maxLength = 2000;
      textarea.value = body.dataset.current;
      const apply = document.createElement('button');
      apply.className = 'btn btn-primary';
      apply.textContent = words('Save in demo', 'Сохранить в демо');
      apply.onclick = () => {
        body.textContent = body.dataset.current = textarea.value;
        const version = example.querySelector('[data-demo-action="note-version"]');
        version.setAttribute('aria-pressed', 'false');
        version.textContent = words('Previous version', 'Прежняя версия');
        status(words('Demo note saved. Earlier text remains in history.', 'Заметка демо сохранена. Прежний текст остался в истории.'));
        dialog.close();
      };
      label.append(textarea);
      const section = document.createElement('div');
      section.append(label, apply);
      show(section);
    } else if (action === 'note-version') {
      const body = example.querySelector('[data-demo-note-body]');
      const previous = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(previous));
      body.textContent = previous ? body.dataset.previous : body.dataset.current;
      button.textContent = previous
        ? words('Current version', '\u0422\u0435\u043a\u0443\u0449\u0430\u044f \u0432\u0435\u0440\u0441\u0438\u044f')
        : words('Previous version', '\u041f\u0440\u0435\u0436\u043d\u044f\u044f \u0432\u0435\u0440\u0441\u0438\u044f');
      status(
        previous
          ? words(
              'Showing an earlier draft.',
              '\u041f\u043e\u043a\u0430\u0437\u0430\u043d \u043f\u0440\u0435\u0436\u043d\u0438\u0439 \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a.',
            )
          : words(
              'Showing the current decision.',
              '\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u0435 \u0440\u0435\u0448\u0435\u043d\u0438\u0435.',
            ),
      );
    } else if (action === 'archive') {
      const article = document.createElement('article');
      article.className = 'example-archive-viewer';
      const toolbar = document.createElement('div');
      toolbar.className = 'example-toolbar';
      const label = document.createElement('label');
      label.className = 'field';
      label.textContent = words('Saved version', 'Сохранённая версия');
      const version = document.createElement('select');
      version.className = 'select';
      for (const [value, name] of [
        ['current', words('17 Nov · HTML archive', '17 ноября · HTML-архив')],
        ['previous', words('12 Nov · earlier version', '12 ноября · прежняя версия')],
      ]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = name;
        version.append(option);
      }
      label.append(version);
      toolbar.append(label);
      const html = document.createElement('button'),
        text = document.createElement('button');
      html.className = text.className = 'btn btn-secondary';
      html.textContent = words('Saved HTML', 'Сохранённый HTML');
      text.textContent = words('Text', 'Текст');
      toolbar.append(html, text);
      const frame = document.createElement('iframe');
      frame.className = 'example-archive-frame';
      frame.setAttribute('sandbox', '');
      frame.title = words('Saved page example', 'Пример сохранённой страницы');
      const reader = document.createElement('div');
      reader.className = 'example-archive-text';
      reader.append(example.querySelector('[data-demo-archive]').content.cloneNode(true));
      reader.hidden = true;
      const load = () => {
        frame.src = `/product-saved-page-${russian ? 'ru' : 'en'}${version.value === 'previous' ? '-previous' : ''}.html`;
        reader.querySelector('small').textContent = version.selectedOptions[0].textContent;
      };
      html.onclick = () => {
        frame.hidden = false;
        reader.hidden = true;
        html.setAttribute('aria-pressed', 'true');
        text.setAttribute('aria-pressed', 'false');
      };
      text.onclick = () => {
        frame.hidden = true;
        reader.hidden = false;
        html.setAttribute('aria-pressed', 'false');
        text.setAttribute('aria-pressed', 'true');
      };
      html.setAttribute('aria-pressed', 'true');
      text.setAttribute('aria-pressed', 'false');
      version.onchange = load;
      load();
      const report = document.createElement('p');
      report.className = 'hint';
      report.textContent = words(
        'Demo archive · HTML + styles · scripts disabled. The original website is not requested.',
        'Архив демо · HTML и стили · скрипты отключены. Оригинальный сайт не запрашивается.',
      );
      article.append(toolbar, report, frame, reader);
      show(article);
    } else if (action === 'file') {
      const article = document.createElement('article');
      const h3 = document.createElement('h3');
      h3.textContent = button.querySelector('strong').textContent;
      const p = document.createElement('p');
      p.textContent = words(
        'This is a sample preview. The workspace opens supported documents and media with download and version controls.',
        '\u042d\u0442\u043e \u043f\u0440\u0438\u043c\u0435\u0440 \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0430. \u0412 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u0435 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u043c\u044b\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b \u0438 \u043c\u0435\u0434\u0438\u0430 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u044e\u0442\u0441\u044f \u0441 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435\u043c \u0441\u043a\u0430\u0447\u0438\u0432\u0430\u043d\u0438\u0435\u043c \u0438 \u0432\u0435\u0440\u0441\u0438\u044f\u043c\u0438.',
      );
      article.append(h3, p);
      if (button.dataset.kind === 'MD') {
        const pre = document.createElement('pre');
        pre.textContent =
          '# ' +
          h3.textContent +
          '\n\n' +
          words(
            'Goal: collect project materials in one workspace.',
            '\u0426\u0435\u043b\u044c: \u0441\u043e\u0431\u0440\u0430\u0442\u044c \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b \u043f\u0440\u043e\u0435\u043a\u0442\u0430 \u0432 \u043e\u0434\u043d\u043e\u043c \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u0435.',
          );
        article.append(pre);
      } else if (button.dataset.kind === 'MP4') {
        const video = document.createElement('video');
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.src = '/product-demo.mp4';
        video.className = 'example-video';
        article.append(video);
        p.textContent = words(
          'A real, four-second synthetic video. Use playback, volume and fullscreen controls. Your files are never accessed by this demo.',
          'Настоящее синтетическое видео на четыре секунды. Попробуйте воспроизведение, громкость и полный экран. Демо не обращается к вашим файлам.',
        );
      } else {
        const list = document.createElement('ul');
        for (const name of ['brief.md', 'references/', 'assets/cover.png', 'delivery/checklist.md']) {
          const item = document.createElement('li');
          item.textContent = name;
          list.append(item);
        }
        article.append(list);
        p.textContent = words(
          'Sample ZIP contents. Folder paths remain intact when collecting project files.',
          'Пример содержимого ZIP. При сборе файлов проекта структура папок сохраняется.',
        );
      }
      show(article);
    } else if (action === 'close-dialog') {
      dialog.querySelectorAll('video,audio').forEach(media => media.pause());
      dialog.close();
    } else if (action === 'graph-node') {
      for (const node of example.querySelectorAll('[data-node]')) node.setAttribute('aria-pressed', String(node === button));
      for (const [i, node] of [...example.querySelectorAll('.demo-graph svg>g:not(.graph-lines)')].entries())
        node.classList.toggle('is-selected', i === Number(button.dataset.node));
      const neighbours = Number(button.dataset.node) === 0 ? 4 : [1, 2].includes(Number(button.dataset.node)) ? 2 : 1;
      status(
        button.textContent +
          ': ' +
          neighbours +
          ' ' +
          words('direct connections.', '\u043f\u0440\u044f\u043c\u044b\u0445 \u0441\u0432\u044f\u0437\u0435\u0439.'),
      );
    }
  });
  example.querySelector('[data-demo-filter]')?.addEventListener('change', event => {
    for (const file of example.querySelectorAll('[data-kind]')) file.hidden = event.target.value !== 'all' && event.target.value !== file.dataset.kind;
    status(
      words(
        'File filter applied.',
        '\u0424\u0438\u043b\u044c\u0442\u0440 \u0444\u0430\u0439\u043b\u043e\u0432 \u043f\u0440\u0438\u043c\u0435\u043d\u0451\u043d.',
      ),
    );
  });
  example.querySelector('[data-demo-type]')?.addEventListener('change', event => {
    let properties = example.querySelector('[data-demo-properties]');
    if (!properties) {
      properties = document.createElement('p');
      properties.dataset.demoProperties = '';
      properties.className = 'example-note-properties';
      example.querySelector('.example-note').append(properties);
    }
    properties.textContent =
      event.target.selectedIndex === 1
        ? words('Meeting · Decisions · Next steps', 'Встреча · Решения · Следующие шаги')
        : event.target.selectedIndex === 2
          ? words('Research · Hypothesis · Result · Source', 'Исследование · Гипотеза · Результат · Источник')
          : words('Note · Summary · Related materials', 'Заметка · Краткое описание · Связанные материалы');
    status(words('Type: ', 'Тип: ') + event.target.value);
  });
  example.querySelector('[data-demo-search]')?.addEventListener('input', event => {
    let matches = 0;
    for (const card of example.querySelectorAll('.bookmark-card')) {
      const found = card.textContent.toLocaleLowerCase().includes(event.target.value.toLocaleLowerCase().trim());
      card.hidden = !found;
      if (found) matches++;
    }
    example.querySelector('.example-empty').hidden = matches > 0;
  });
}

// Pointer and keyboard interactions, clamped again whenever the viewport changes.
for (const example of document.querySelectorAll('[data-product-example="1"]')) {
  const start = example.querySelector('[data-demo-start]'),
    pause = example.querySelector('[data-demo-action="queue"]');
  const progress = example.querySelector('[role="progressbar"]'),
    value = example.querySelector('.example-upload>b');
  let amount = 0,
    last = 0,
    frame;
  function tick(now) {
    if (pause.getAttribute('aria-pressed') === 'true') {
      last = 0;
      return;
    }
    if (last) amount = Math.min(100, amount + Math.min(150, now - last) / 50);
    last = now;
    progress.setAttribute('aria-valuenow', String(Math.round(amount)));
    progress.querySelector('i').style.setProperty('--p', amount / 100);
    value.textContent = Math.round(amount) + '%';
    if (amount < 100) frame = requestAnimationFrame(tick);
    else {
      start.disabled = false;
      start.textContent = words('Replay', 'Повторить');
      pause.disabled = true;
      example.querySelector('.example-status').textContent = words(
        'Demo upload completed. No files were sent.',
        'Загрузка демо завершена. Файлы никуда не отправлялись.',
      );
    }
  }
  start.onclick = () => {
    cancelAnimationFrame(frame);
    amount = 0;
    last = 0;
    pause.disabled = false;
    pause.setAttribute('aria-pressed', 'false');
    pause.textContent = words('Pause', 'Пауза');
    start.disabled = true;
    frame = requestAnimationFrame(tick);
  };
  pause.addEventListener('click', () => {
    cancelAnimationFrame(frame);
    last = 0;
    if (pause.getAttribute('aria-pressed') === 'false') frame = requestAnimationFrame(tick);
  });
}
for (const example of document.querySelectorAll('[data-product-example="5"]')) {
  const svg = example.querySelector('.demo-graph svg'),
    nodes = [...svg.querySelectorAll('[data-demo-graph-node]')],
    path = svg.querySelector('.graph-lines path');
  const physics = example.querySelector('[data-demo-physics]');
  if (!physics) continue;
  const edges = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 2],
  ];
  let drag;
  const positions = () =>
    nodes.map(node => ({ x: Number(node.querySelector('circle').getAttribute('cx')), y: Number(node.querySelector('circle').getAttribute('cy')) }));
  const point = event => {
    const box = svg.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * 700, y: ((event.clientY - box.top) / box.height) * 260 };
  };
  function move(index, dx, dy, before) {
    const connected = physics.getAttribute('aria-pressed') === 'true';
    const current = before.map((p, i) => ({
      x: Math.max(35, Math.min(665, p.x + dx * (i === index ? 1 : connected ? 0.4 : 0))),
      y: Math.max(30, Math.min(215, p.y + dy * (i === index ? 1 : connected ? 0.4 : 0))),
    }));
    nodes.forEach((node, i) => {
      const { x, y } = current[i];
      node.querySelector('circle').setAttribute('cx', x);
      node.querySelector('circle').setAttribute('cy', y);
      node.querySelector('text').setAttribute('x', x);
      node.querySelector('text').setAttribute('y', y + 37);
    });
    path.setAttribute('d', edges.map(([a, b]) => `M${current[a].x} ${current[a].y}L${current[b].x} ${current[b].y}`).join(''));
  }
  physics.onclick = () => {
    const enabled = physics.getAttribute('aria-pressed') !== 'true';
    physics.setAttribute('aria-pressed', String(enabled));
    physics.textContent = enabled ? words('Physics on', 'Физика вкл.') : words('Physics off', 'Физика выкл.');
  };
  nodes.forEach((node, index) => {
    node.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      drag = { index, start: point(event), before: positions(), id: event.pointerId };
      node.setPointerCapture(event.pointerId);
      node.focus();
      event.preventDefault();
    });
    node.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId || drag.index !== index) return;
      const p = point(event);
      move(index, p.x - drag.start.x, p.y - drag.start.y, drag.before);
    });
    node.addEventListener('pointerup', () => {
      drag = null;
    });
    node.addEventListener('pointercancel', () => {
      if (drag) move(index, 0, 0, drag.before);
      drag = null;
    });
    node.addEventListener('keydown', event => {
      if (event.key === 'Escape' && drag) {
        move(index, 0, 0, drag.before);
        drag = null;
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        example.querySelector(`[data-demo-action="graph-node"][data-node="${index}"]`).click();
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 24 : 8;
      move(
        index,
        event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
        event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0,
        positions(),
      );
    });
  });
}
for (const canvas of document.querySelectorAll('[data-product-canvas]')) {
  const stage = canvas.querySelector('.canvas-trial-stage');
  const nodes = [...stage.querySelectorAll('[data-demo-node]')];
  const svg = stage.querySelector('svg'),
    path = svg.querySelector('path');
  const connections = canvas.querySelector('[data-demo-connections]');
  const clamp = (n, low, high) => Math.max(low, Math.min(Math.max(low, high), n));
  let drag;
  const position = node => ({ x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight });
  function draw() {
    const box = stage.getBoundingClientRect();
    if (!box.width) return;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    path.setAttribute(
      'd',
      nodes
        .map((node, i) => {
          const r = node.getBoundingClientRect();
          return `${i ? 'L' : 'M'}${r.left - box.left + r.width / 2} ${r.top - box.top + r.height / 2}`;
        })
        .join(' '),
    );
  }
  function update(node, resize, dx, dy, start) {
    const width = stage.clientWidth,
      height = stage.clientHeight;
    if (resize) {
      node.style.width = clamp(start.w + dx, 96, width - start.x - 4) + 'px';
      node.style.height = clamp(start.h + dy, 90, height - start.y - 4) + 'px';
    } else {
      node.style.left = (clamp(start.x + dx, 4, width - start.w - 4) / width) * 100 + '%';
      node.style.top = (clamp(start.y + dy, 4, height - start.h - 4) / height) * 100 + '%';
    }
    draw();
  }
  function bind(node) {
    for (const control of node.querySelectorAll('button')) {
      const resize = control.classList.contains('trial-node-resize');
      control.addEventListener('pointerdown', event => {
        if (event.button !== 0 || drag) return;
        drag = { node, resize, ...position(node), px: event.clientX, py: event.clientY, id: event.pointerId };
        control.setPointerCapture(event.pointerId);
        control.focus({ preventScroll: true });
        event.preventDefault();
      });
      control.addEventListener('pointermove', event => {
        if (drag?.node === node && drag.id === event.pointerId) update(node, resize, event.clientX - drag.px, event.clientY - drag.py, drag);
      });
      const end = event => {
        if (drag?.id === event.pointerId) drag = null;
      };
      control.addEventListener('pointerup', end);
      control.addEventListener('lostpointercapture', end);
      control.addEventListener('pointercancel', event => {
        if (drag?.id === event.pointerId) {
          update(node, resize, 0, 0, drag);
          drag = null;
        }
      });
      control.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 20 : 8;
        update(
          node,
          resize,
          event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
          event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0,
          position(node),
        );
      });
    }
  }
  nodes.forEach(bind);
  connections.addEventListener('click', () => {
    const shown = connections.getAttribute('aria-pressed') !== 'true';
    connections.setAttribute('aria-pressed', String(shown));
    svg.hidden = !shown;
    draw();
  });
  const add = canvas.querySelector('[data-demo-action="canvas-add"]');
  add.addEventListener('click', () => {
    if (nodes.length >= 6) return;
    const node = nodes[0].cloneNode(true);
    node.dataset.added = 'true';
    node.dataset.demoNode = String(nodes.length);
    const title = words('New idea', '\u041d\u043e\u0432\u0430\u044f \u0438\u0434\u0435\u044f') + ' ' + (nodes.length + 1);
    node.querySelector('strong').textContent = title;
    node
      .querySelector('.trial-node-title')
      .setAttribute('aria-label', words('Move: ', '\u041f\u0435\u0440\u0435\u043c\u0435\u0441\u0442\u0438\u0442\u044c: ') + title);
    node
      .querySelector('.trial-node-resize')
      .setAttribute('aria-label', words('Resize: ', '\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0440\u0430\u0437\u043c\u0435\u0440: ') + title);
    node.style.left = 10 + nodes.length * 7 + '%';
    node.style.top = 15 + nodes.length * 8 + '%';
    stage.append(node);
    nodes.push(node);
    bind(node);
    draw();
    node.querySelector('button').focus();
    add.disabled = nodes.length >= 6;
  });
  canvas.querySelector('[data-demo-reset]').addEventListener('click', () => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].dataset.added) {
        nodes[i].remove();
        nodes.splice(i, 1);
      } else nodes[i].removeAttribute('style');
    }
    add.disabled = false;
    connections.setAttribute('aria-pressed', 'true');
    svg.hidden = false;
    fit();
  });
  function fit() {
    if (!stage.clientWidth) return;
    for (const node of nodes) {
      const p = position(node);
      node.style.width = Math.min(p.w, stage.clientWidth - 8) + 'px';
      node.style.left = (clamp(p.x, 4, stage.clientWidth - node.offsetWidth - 4) / stage.clientWidth) * 100 + '%';
      node.style.height = Math.min(p.h, stage.clientHeight - 8) + 'px';
      node.style.top = (clamp(p.y, 4, stage.clientHeight - node.offsetHeight - 4) / stage.clientHeight) * 100 + '%';
    }
    draw();
  }
  new ResizeObserver(fit).observe(stage);
  draw();
}
