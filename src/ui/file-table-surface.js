import { esc } from '../core/utils.js';

const rowSource = new WeakMap();
const selector = '.workspace-file-table > tbody[data-file-list]';

// Capture the renderer's markup before translation and focus enhancements edit the live row.
export function rememberFileRows(root) {
  for (const row of root.querySelectorAll(selector + ' > tr')) rowSource.set(row, row.outerHTML);
}

function updateRows(body, fresh) {
  const existing = new Map([...body.rows].map(row => [row.dataset.id, row]));
  const ordered = [...fresh.rows].map(row => {
    const old = existing.get(row.dataset.id);
    const source = row.outerHTML;
    if (old && rowSource.get(old) === source) {
      existing.delete(row.dataset.id);
      return old;
    }
    rowSource.set(row, source);
    return row;
  });
  for (const stale of existing.values()) stale.remove();
  let next = body.firstElementChild;
  for (const row of ordered) {
    if (row !== next) body.insertBefore(row, next);
    next = row.nextElementSibling;
  }
}

export function retainedFileTable(root, html) {
  const node = root.querySelector(selector);
  if (!node || !html.includes(`<tbody data-file-list="${esc(node.dataset.fileList)}">`)) return null;
  return { node, selector, update: updateRows };
}
