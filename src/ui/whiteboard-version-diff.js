import { esc } from '../core/utils.js';
import { wbText as T } from '../core/whiteboard-state.js';
import { whiteboardBounds, whiteboardEdgeEnd, whiteboardPaintOrder, whiteboardVisibleBoard } from '../shared/project-whiteboard.js';
import { whiteboardShapeSvg } from '../shared/whiteboard-diagram.js';
import { whiteboardDiffVisibleIds, whiteboardEdgeGeometry } from '../shared/whiteboard-edge.js';
import { whiteboardConnectionText } from './whiteboard-edge-text.js';
export { whiteboardConnectionText };
export function whiteboardVersionDiff(current, previous, diff, changedOnly = false) {
  const changes = new Map(diff.rows.filter(row => row.kind === 'card').map(row => [row.id, row]));
  const connections = new Map(diff.rows.filter(row => row.kind === 'connection').map(row => [row.id, row]));
  const groups = new Map(diff.rows.filter(row => row.kind === 'group').map(row => [row.id, row]));
  const visibleIds = whiteboardDiffVisibleIds(current, previous, diff.rows);
  for (const id of diff.layerIds) visibleIds.add(id);
  const shownCurrent = whiteboardVisibleBoard(current);
  const shownPrevious = whiteboardVisibleBoard(previous);
  const all = [...shownCurrent.nodes, ...shownPrevious.nodes].filter(node => !changedOnly || visibleIds.has(node.id));
  const box = whiteboardBounds({ nodes: all });
  const pad = Math.max(20, box.width / 30),
    size = Math.max(12, box.width / 45);
  const bounds = `${box.x - pad} ${box.y - pad} ${box.width + 2 * pad} ${box.height + 2 * pad}`;
  const colors = { added: 'var(--green)', removed: 'var(--red)', changed: 'var(--amber)' };
  const marks = { added: '+', removed: '−', changed: '~' };
  const edgeColors = {
    neutral: 'var(--text-3)',
    violet: 'var(--accent)',
    blue: 'var(--blue)',
    green: 'var(--green)',
    amber: 'var(--amber)',
    rose: 'var(--red)',
  };
  const picture = (board, title) => {
    const nodes = board.nodes.filter(node => !changedOnly || visibleIds.has(node.id)),
      byId = new Map(board.nodes.map(node => [node.id, node]));
    const shownEdges = board.edges.filter(edge => !changedOnly || changes.has(edge.from) || changes.has(edge.to) || connections.has(edge.id));
    const groupOutlines = (board.groups || [])
      .filter(group => !changedOnly || groups.has(group.id))
      .map(group => {
        const { x, y, width, height } = whiteboardBounds({ nodes: group.members.map(id => byId.get(id)) });
        const color = colors[groups.get(group.id)?.change] || 'var(--accent)';
        return `<rect x="${x - 6}" y="${y - 6}" width="${width + 12}" height="${height + 12}" rx="8" fill="none" stroke="${color}" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/>`;
      })
      .join('');
    return `<figure><figcaption>${title}</figcaption><svg viewBox="${bounds}" role="img" aria-label="${title}" class="whiteboard-diff-diagram">${groupOutlines}${shownEdges
      .map(edge => {
        const from = byId.get(edge.from),
          to = byId.get(edge.to),
          change = connections.get(edge.id);
        if (!from || !to || (changedOnly && !changes.has(from.id) && !changes.has(to.id) && !change)) return '';
        const geometry = whiteboardEdgeGeometry(from, to, Math.max(12, box.width / 70));
        if (!geometry) return '';
        const color = edgeColors[edge.color] || edgeColors.neutral,
          { x1, y1, x2, y2, head, labelX, labelY } = geometry;
        const line = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" vector-effect="non-scaling-stroke"`;
        const ends =
          whiteboardEdgeEnd(edge, 'from') === 'arrow'
            ? `<polygon points="${whiteboardEdgeGeometry(to, from, Math.max(12, box.width / 70)).head}" fill="${color}"/>`
            : whiteboardEdgeEnd(edge, 'from') === 'dot'
              ? `<circle cx="${x1}" cy="${y1}" r="${Math.max(5, box.width / 160)}" fill="${color}"/>`
              : '';
        const tip =
          whiteboardEdgeEnd(edge, 'to') === 'arrow'
            ? `<polygon points="${head}" fill="${color}"/>`
            : whiteboardEdgeEnd(edge, 'to') === 'dot'
              ? `<circle cx="${x2}" cy="${y2}" r="${Math.max(5, box.width / 160)}" fill="${color}"/>`
              : '';
        return `<g><title>${esc(whiteboardConnectionText(board, edge))}</title>${change ? `<line ${line} stroke="${colors[change.change]}" stroke-width="5" stroke-dasharray="8 4"/>` : ''}<line ${line} stroke="${color}" stroke-width="1.8" ${edge.style === 'dashed' ? 'stroke-dasharray="10 6"' : edge.style === 'dotted' ? 'stroke-dasharray="2 6" stroke-linecap="round"' : ''}/>${ends}${tip}<text x="${labelX}" y="${labelY - size / 3}" text-anchor="middle" font-size="${size}" fill="var(--text)" stroke="var(--surface)" stroke-width="${size / 5}" paint-order="stroke" stroke-linejoin="round">${marks[change?.change] || ''} ${esc(edge.label.length > 40 ? edge.label.slice(0, 39) + '…' : edge.label)}</text></g>`;
      })
      .join('')}${whiteboardPaintOrder(nodes)
      .map(node => {
        const change = changes.get(node.id),
          color = colors[change?.change] || 'var(--border-strong)';
        const shape =
          node.type === 'shape'
            ? whiteboardShapeSvg(node, `fill="var(--surface)" stroke="${color}" stroke-width="${change ? 2 : 1}" vector-effect="non-scaling-stroke"`)
            : '';
        return `${shape || `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="8" fill="var(--surface)" fill-opacity="${node.type === 'group' ? '.3' : '.9'}" stroke="${color}" stroke-width="${change ? 2 : 1}" vector-effect="non-scaling-stroke"/>`}<text x="${node.x + 8}" y="${node.y + size + 6}" font-size="${Math.min(size, node.height / 3)}" fill="var(--text)">${marks[change?.change] || ''} ${esc((node.title || T(node.type === 'group' ? 'Frame' : 'Material', node.type === 'group' ? 'Рамка' : 'Материал')).slice(0, 24))}</text>`;
      })
      .join(
        '',
      )}</svg>${shownEdges.length ? `<details class="whiteboard-diff-connections"><summary>${T('Connections · text alternative', 'Связи · текстовое описание')} · ${shownEdges.length}</summary><ul>${shownEdges.map(edge => `<li>${connections.has(edge.id) ? `${marks[connections.get(edge.id).change]} ` : ''}${esc(whiteboardConnectionText(board, edge))}</li>`).join('')}</ul></details>` : ''}</figure>`;
  };
  return `<section class="whiteboard-visual-comparison"><p class="hint">${T('+ Added · − Removed · ~ Changed when restoring. Both views use the same scale. The list below contains full details.', '+ Добавится · − Удалится · ~ Изменится при восстановлении. Масштаб у обоих видов одинаковый. Полные сведения — в списке ниже.')}</p><button class="btn btn-ghost btn-sm" data-a="toggleWhiteboardDiffFocus" aria-pressed="${changedOnly}">${T('Only changes', 'Только изменения')}</button><div class="whiteboard-visual-pair">${picture(shownCurrent, T('Current', 'Сейчас'))}${picture(shownPrevious, T('Selected version', 'Выбранная версия'))}</div></section>`;
}
