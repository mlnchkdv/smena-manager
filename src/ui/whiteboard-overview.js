import { whiteboardOverviewLabels } from '../shared/whiteboard-overview.js';

export function refreshWhiteboardOverview(state) {
  const viewport = document.querySelector('.whiteboard-viewport');
  if (!viewport) return;
  const cards = [...viewport.querySelectorAll('.whiteboard-card')];
  const candidates = cards.map(card => ({
    id: card.dataset.boardId,
    frame: card.dataset.kind === 'group',
    box: card.querySelector('.whiteboard-drag strong')?.getBoundingClientRect(),
  }));
  const visible =
    state.zoom < 0.65
      ? whiteboardOverviewLabels(
          candidates.filter(c => c.box),
          viewport.getBoundingClientRect(),
          state.selected,
        )
      : new Set(cards.map(card => card.dataset.boardId));
  for (const card of cards) card.dataset.overviewLabel = String(visible.has(card.dataset.boardId));
}
