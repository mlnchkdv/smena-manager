import { sameKnowledgeReadingInputs } from '../shared/knowledge-reading-state.js';
import { esc } from '../core/utils.js';

const metadata = new WeakMap();
let capture = null,
  sequence = 0;

function keepConnected(root, html, retained) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const pairs = new Map();
  for (const item of retained) {
    let fresh = template.content.querySelector(`[data-knowledge-reader="${item.node.dataset.knowledgeReader}"]`),
      old = item.node;
    if (!fresh) return false;
    while (fresh !== template.content && old !== root) {
      if (!fresh || !old || fresh.nodeType !== old.nodeType || fresh.nodeName !== old.nodeName || (pairs.has(fresh) && pairs.get(fresh) !== old)) return false;
      pairs.set(fresh, old);
      fresh = fresh.parentNode;
      old = old.parentNode;
    }
    if (fresh !== template.content || old !== root) return false;
  }
  const readers = new Set(retained.map(item => item.node));
  pairs.set(template.content, root);
  // Validate sibling order before touching the live DOM. A changed layout uses
  // the ordinary replacement path instead of attempting an in-place reorder.
  for (const [fresh, old] of pairs) {
    if (readers.has(old)) continue;
    const expected = [...fresh.childNodes].map(child => pairs.get(child)).filter(Boolean);
    const existing = [...old.childNodes].filter(child => expected.includes(child));
    if (existing.length !== expected.length || existing.some((child, index) => child !== expected[index])) return false;
  }
  const update = (old, fresh) => {
    if (readers.has(old)) return;
    if (old !== root) {
      for (const attr of [...old.attributes]) if (!fresh.hasAttribute(attr.name)) old.removeAttribute(attr.name);
      for (const attr of fresh.attributes) if (old.getAttribute(attr.name) !== attr.value) old.setAttribute(attr.name, attr.value);
    }
    const children = [...fresh.childNodes],
      kept = new Set(children.map(child => pairs.get(child)).filter(Boolean));
    // Remove siblings first so retained ancestors never need to move or detach.
    for (const child of [...old.childNodes]) if (!kept.has(child)) child.remove();
    let anchor = old.firstChild;
    for (const child of children) {
      const existing = pairs.get(child);
      if (existing) {
        update(existing, child);
        anchor = existing.nextSibling;
      } else old.insertBefore(child, anchor);
    }
  };
  update(root, template.content);
  return true;
}

// Only reuse nodes from the immediately preceding visible surface. Closing the
// reader drops its DOM; no detached documents or cross-account body cache live here.
export function captureKnowledgeReadingSurface() {
  const current = {
    previous: [...document.querySelectorAll('[data-knowledge-reader]')].map(node => ({ node, inputs: metadata.get(node) })),
    claimed: new Set(),
    fresh: new Map(),
  };
  capture = current;
  return {
    replace(root, html) {
      const retained = current.previous.filter(item => current.claimed.has(item) && root.contains(item.node));
      if (!retained.length || !keepConnected(root, html, retained)) root.innerHTML = html;
    },
    finish() {
      for (const node of document.querySelectorAll('[data-knowledge-reader]')) {
        const key = node.dataset.knowledgeReader;
        const retained = current.previous.find(item => item.node.dataset.knowledgeReader === key && current.claimed.has(item));
        if (retained && retained.node !== node) node.replaceWith(retained.node);
        else if (current.fresh.has(key)) metadata.set(node, current.fresh.get(key));
      }
      if (capture === current) capture = null;
    },
  };
}

export function knowledgeReadingSurface(inputs, markup) {
  const previous = capture?.previous.find(item => !capture.claimed.has(item) && sameKnowledgeReadingInputs(item.inputs, inputs));
  if (previous) {
    capture.claimed.add(previous);
    // The outline is built from returned markup before the retained DOM is
    // placed. Keep its small, plain heading descriptors available to that step.
    const outline = [...previous.node.querySelectorAll('[data-knowledge-heading]')]
      .map(
        heading =>
          `<${heading.tagName.toLowerCase()} data-knowledge-heading="${esc(heading.dataset.knowledgeHeading)}">${esc(heading.textContent)}</${heading.tagName.toLowerCase()}>`,
      )
      .join('');
    return `<div data-knowledge-reader="${previous.node.dataset.knowledgeReader}"><template>${outline}</template></div>`;
  }
  const key = 'kr' + ++sequence;
  capture?.fresh.set(key, inputs);
  return `<div class="knowledge-large-document" data-knowledge-reader="${key}" translate="no">${markup()}</div>`;
}
