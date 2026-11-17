// Enhance ordinary anchor links; every panel remains readable without JavaScript.
const tablist = document.querySelector('.demo-tabs');
const tabs = [...(tablist?.querySelectorAll('a') || [])];
if (tabs.length) {
  tablist.setAttribute('role', 'tablist');
  function select(tab, focus = false) {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    }
    if (focus) tab.focus();
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
      select(tab);
    });
    tab.addEventListener('keydown', event => {
      let index = tabs.indexOf(tab);
      if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else return;
      event.preventDefault();
      select(tabs[index], true);
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
  const show = content => {
    const body = dialog.querySelector('.example-dialog-body');
    body.replaceChildren(content);
    dialog.showModal();
  };
  example.addEventListener('click', event => {
    const button = event.target.closest('[data-demo-action]');
    if (!button) return;
    const action = button.dataset.demoAction;
    if (action === 'task') {
      const columns = [...example.querySelectorAll('.bcol')];
      const next = columns[(columns.indexOf(button.closest('.bcol')) + 1) % columns.length];
      next.querySelector('.bcol-b').append(button);
      for (const column of columns) column.querySelector('.cnt').textContent = column.querySelectorAll('.kcard').length;
      status(button.querySelector('.kcard-title').textContent + ' \u2192 ' + next.querySelector('.bcol-h>span:nth-child(2)').textContent);
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
      show(example.querySelector('[data-demo-archive]').content.cloneNode(true));
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
      }
      show(article);
    } else if (action === 'close-dialog') dialog.close();
    else if (action === 'graph-node') {
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
  example.querySelector('[data-demo-type]')?.addEventListener('change', event => status(words('Type: ', '\u0422\u0438\u043f: ') + event.target.value));
  example.querySelector('[data-demo-search]')?.addEventListener('input', event => {
    const card = example.querySelector('.bookmark-card');
    const found = card.textContent.toLocaleLowerCase().includes(event.target.value.toLocaleLowerCase().trim());
    card.hidden = !found;
    example.querySelector('.example-empty').hidden = found;
  });
}

// Pointer and keyboard interactions, clamped again whenever the viewport changes.
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
