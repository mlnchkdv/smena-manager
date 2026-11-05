import { esc } from '../core/utils.js';
import { wbText as T } from '../core/whiteboard-state.js';
import { whiteboardBounds } from '../shared/project-whiteboard.js';
export function whiteboardVersionDiff(current, previous, diff, changedOnly = false) {
  const changes = new Map(diff.rows.filter(row => row.kind === 'card').map(row => [row.id, row]));
  const visibleIds = new Set([
    ...changes.keys(),
    ...diff.rows
      .filter(row => row.kind === 'connection')
      .flatMap(row => [row.before?.from, row.before?.to, row.after?.from, row.after?.to])
      .filter(Boolean),
  ]);
  const all = [...current.nodes, ...previous.nodes].filter(node => !changedOnly || visibleIds.has(node.id));
  const box = whiteboardBounds({ nodes: all });
  const pad = Math.max(20, box.width / 30),
    size = Math.max(12, box.width / 45);
  const bounds = `${box.x - pad} ${box.y - pad} ${box.width + 2 * pad} ${box.height + 2 * pad}`;
  const colors = { added: 'var(--green)', removed: 'var(--red)', changed: 'var(--amber)' };
  const marks = { added: '+', removed: '−', changed: '~' };
  const picture = (board, title) => {
    const nodes = board.nodes.filter(node => !changedOnly || visibleIds.has(node.id)),
      byId = new Map(board.nodes.map(node => [node.id, node]));
    return `<figure><figcaption>${title}</figcaption><svg viewBox="${bounds}" role="img" aria-label="${title}" class="whiteboard-diff-diagram">${board.edges
      .map(edge => {
        const from = byId.get(edge.from),
          to = byId.get(edge.to),
          change = diff.rows.find(row => row.kind === 'connection' && row.id === edge.id);
        if (!from || !to || (changedOnly && !changes.has(from.id) && !changes.has(to.id) && !change)) return '';
        return `<line x1="${from.x + from.width / 2}" y1="${from.y + from.height / 2}" x2="${to.x + to.width / 2}" y2="${to.y + to.height / 2}" stroke="${colors[change?.change] || 'var(--text-3)'}" stroke-dasharray="${change ? '8 4' : '0'}" vector-effect="non-scaling-stroke"/><text x="${(from.x + to.x + from.width / 2 + to.width / 2) / 2}" y="${(from.y + to.y + from.height / 2 + to.height / 2) / 2}" font-size="${size}" fill="var(--text)">${marks[change?.change] || ''}</text>`;
      })
      .join('')}${[...nodes]
      .sort((a, b) => (a.type !== 'group') - (b.type !== 'group'))
      .map(node => {
        const change = changes.get(node.id),
          color = colors[change?.change] || 'var(--border-strong)';
        return `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="8" fill="var(--surface)" fill-opacity="${node.type === 'group' ? '.3' : '.9'}" stroke="${color}" stroke-width="${change ? 2 : 1}" vector-effect="non-scaling-stroke"/><text x="${node.x + 8}" y="${node.y + size + 6}" font-size="${Math.min(size, node.height / 3)}" fill="var(--text)">${marks[change?.change] || ''} ${esc((node.title || T(node.type === 'group' ? 'Frame' : 'Material', node.type === 'group' ? 'Рамка' : 'Материал')).slice(0, 24))}</text>`;
      })
      .join('')}</svg></figure>`;
  };
  return `<section class="whiteboard-visual-comparison"><p class="hint">${T('+ Added · − Removed · ~ Changed when restoring. Both views use the same scale. The list below contains full details.', '+ Добавится · − Удалится · ~ Изменится при восстановлении. Масштаб у обоих видов одинаковый. Полные сведения — в списке ниже.')}</p><button class="btn btn-ghost btn-sm" data-a="toggleWhiteboardDiffFocus" aria-pressed="${changedOnly}">${T('Only changed cards', 'Только изменённые карточки')}</button><div class="whiteboard-visual-pair">${picture(current, T('Current', 'Сейчас'))}${picture(previous, T('Selected version', 'Выбранная версия'))}</div></section>`;
}
