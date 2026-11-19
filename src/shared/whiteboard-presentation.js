export function whiteboardFrames(board) {
  return board.nodes
    .filter(node => node.type === 'group')
    .map((node, index) => ({ node, index }))
    .sort((a, b) => (a.node.sequence ?? 1000001) - (b.node.sequence ?? 1000001) || a.index - b.index)
    .map(row => row.node);
}
export function reorderWhiteboardFrame(board, id, direction) {
  if (![-1, 1].includes(direction)) return false;
  const frames = whiteboardFrames(board),
    shown = frames.filter(node => !node.hidden),
    index = shown.findIndex(node => node.id === id),
    target = index + direction;
  if (index < 0 || target < 0 || target >= shown.length) return false;
  [shown[index], shown[target]] = [shown[target], shown[index]];
  let next = 0;
  frames
    .map(node => (node.hidden ? node : shown[next++]))
    .forEach((node, sequence) => {
      node.sequence = sequence;
    });
  board.version = Math.max(board.version, 4);
  return true;
}
export function appendFrameSequence(board, nodes) {
  const existing = whiteboardFrames(board),
    appended = whiteboardFrames({ nodes });
  if (![...existing, ...appended].some(n => n.sequence != null)) return;
  [...existing, ...appended].forEach((node, sequence) => {
    node.sequence = sequence;
  });
}
