// Pure geometry shared by the live diagram and its version comparison.
export function whiteboardCurve(from, to) {
  const right = to.x + to.width / 2 >= from.x + from.width / 2;
  const x1 = from.x + (right ? from.width : 0),
    y1 = from.y + from.height / 2,
    x2 = to.x + (right ? 0 : to.width),
    y2 = to.y + to.height / 2;
  const bend = Math.max(60, Math.abs(x2 - x1) / 2) * (right ? 1 : -1);
  return { x1, y1, x2, y2, d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` };
}
export function whiteboardShapeSvg(node, attributes = '') {
  const { x = 0, y = 0, width: w, height: h } = node;
  if (node.shape === 'ellipse') return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2 - 2}" ry="${h / 2 - 2}" ${attributes}/>`;
  if (node.shape === 'diamond')
    return `<polygon points="${x + w / 2},${y + 2} ${x + w - 2},${y + h / 2} ${x + w / 2},${y + h - 2} ${x + 2},${y + h / 2}" ${attributes}/>`;
  return `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="8" ${attributes}/>`;
}
