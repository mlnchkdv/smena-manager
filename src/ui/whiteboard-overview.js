import { whiteboardOverviewLabels } from '../shared/whiteboard-overview.js';

export function refreshWhiteboardOverview(state) {
  const viewport = document.querySelector('.whiteboard-viewport');
  if (!viewport || state.zoom >= 0.65) return;
  const cards = [...viewport.querySelectorAll('.whiteboard-card')];
  const candidates = cards.map(card => ({
    id: card.dataset.boardId,
    frame: card.dataset.kind === 'group',
    box: card.querySelector('.whiteboard-drag strong')?.getBoundingClientRect(),
  }));
  const visible = whiteboardOverviewLabels(
    candidates.filter(c => c.box),
    viewport.getBoundingClientRect(),
    state.selected,
  );
  for (const card of cards) {
    const value = String(visible.has(card.dataset.boardId));
    if (card.dataset.overviewLabel !== value) card.dataset.overviewLabel = value;
  }
}
