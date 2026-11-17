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

// Isolated, synthetic demonstration. Nothing is sent to the application.
for (const canvas of document.querySelectorAll('[data-product-canvas]')) {
  const stage = canvas.querySelector('.canvas-trial-stage');
  const nodes = [...stage.querySelectorAll('[data-demo-node]')];
  const svg = stage.querySelector('svg');
  const path = svg.querySelector('path');
  const connections = canvas.querySelector('[data-demo-connections]');
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  let drag;
  function draw() {
    const box = stage.getBoundingClientRect();
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
      node.style.height = clamp(start.h + dy, 82, height - start.y - 4) + 'px';
    } else {
      node.style.left = (clamp(start.x + dx, 4, width - start.w - 4) / width) * 100 + '%';
      node.style.top = (clamp(start.y + dy, 4, height - start.h - 4) / height) * 100 + '%';
    }
    draw();
  }
  for (const node of nodes) {
    for (const control of node.querySelectorAll('button')) {
      const resize = control.classList.contains('trial-node-resize');
      const position = () => ({ x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight });
      control.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        drag = { node, resize, ...position(), px: event.clientX, py: event.clientY };
        control.setPointerCapture(event.pointerId);
        control.focus({ preventScroll: true });
        event.preventDefault();
      });
      control.addEventListener('pointermove', event => {
        if (!drag || drag.node !== node) return;
        update(node, resize, event.clientX - drag.px, event.clientY - drag.py, drag);
      });
      control.addEventListener('pointerup', () => {
        drag = null;
      });
      control.addEventListener('pointercancel', () => {
        if (drag) update(node, resize, 0, 0, drag);
        drag = null;
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
          position(),
        );
      });
    }
  }
  connections.addEventListener('click', () => {
    const shown = connections.getAttribute('aria-pressed') !== 'true';
    connections.setAttribute('aria-pressed', String(shown));
    svg.hidden = !shown;
    draw();
  });
  canvas.querySelector('[data-demo-reset]').addEventListener('click', () => {
    for (const node of nodes) node.removeAttribute('style');
    connections.setAttribute('aria-pressed', 'true');
    svg.hidden = false;
    draw();
  });
  new ResizeObserver(draw).observe(stage);
  draw();
}
