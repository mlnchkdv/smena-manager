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
  const polygon = points => `<polygon points="${points.map(([px, py]) => `${x + 2 + px * (w - 4)},${y + 2 + py * (h - 4)}`).join(' ')}" ${attributes}/>`;
  if (node.shape === 'triangle')
    return polygon([
      [0.5, 0],
      [1, 1],
      [0, 1],
    ]);
  if (node.shape === 'pentagon')
    return polygon([
      [0.5, 0],
      [1, 0.38],
      [0.81, 1],
      [0.19, 1],
      [0, 0.38],
    ]);
  if (node.shape === 'hexagon')
    return polygon([
      [0.25, 0],
      [0.75, 0],
      [1, 0.5],
      [0.75, 1],
      [0.25, 1],
      [0, 0.5],
    ]);
  if (node.shape === 'parallelogram')
    return polygon([
      [0.2, 0],
      [1, 0],
      [0.8, 1],
      [0, 1],
    ]);
  if (node.shape === 'trapezoid')
    return polygon([
      [0.2, 0],
      [0.8, 0],
      [1, 1],
      [0, 1],
    ]);
  if (node.shape === 'arrow-right')
    return polygon([
      [0, 0.23],
      [0.65, 0.23],
      [0.65, 0],
      [1, 0.5],
      [0.65, 1],
      [0.65, 0.77],
      [0, 0.77],
    ]);
  if (node.shape === 'star')
    return polygon(
      Array.from({ length: 10 }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5,
          radius = i % 2 ? 0.23 : 0.5;
        return [0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * radius];
      }),
    );
  if (node.shape === 'cylinder')
    return `<path d="M${x + 2},${y + h * 0.16} C${x + 2},${y - h * 0.025} ${x + w - 2},${y - h * 0.025} ${x + w - 2},${y + h * 0.16} L${x + w - 2},${y + h * 0.84} C${x + w - 2},${y + h * 1.025} ${x + 2},${y + h * 1.025} ${x + 2},${y + h * 0.84} Z M${x + 2},${y + h * 0.16} C${x + 2},${y + h * 0.34} ${x + w - 2},${y + h * 0.34} ${x + w - 2},${y + h * 0.16}" ${attributes}/>`;
  if (node.shape === 'document')
    return `<path d="M${x + 2},${y + 2} H${x + w - 2} V${y + h * 0.86} C${x + w * 0.65},${y + h * 0.62} ${x + w * 0.35},${y + h * 1.08} ${x + 2},${y + h * 0.86} Z" ${attributes}/>`;
  return `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="8" ${attributes}/>`;
}

export function whiteboardShapeInsets(shape) {
  if (shape === 'star') return { x: 0.3, y: 0.3 };
  if (shape === 'triangle') return { x: 0.27, y: 0.3 };
  if (shape === 'arrow-right') return { x: 0.23, y: 0.27 };
  if (shape === 'diamond') return { x: 0.22, y: 0.22 };
  if (['pentagon', 'hexagon', 'parallelogram', 'trapezoid'].includes(shape)) return { x: 0.2, y: 0.17 };
  return { x: 0.12, y: shape === 'cylinder' ? 0.22 : 0.12 };
}
