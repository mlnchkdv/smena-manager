// A global phone overview is a map of clusters, not a wall of tiny icons.
// Selection remains available through the 44px hit chooser and list view.
export function graphSemanticView({ width, height, nodes, zoom }) {
  const overview = width <= 640 && nodes > 80 && zoom < 0.85;
  return {
    overview,
    pointPixels: Math.max(6, Math.min(12, Math.sqrt(Math.max(1, width * height) / Math.max(1, nodes)) * 0.22)),
    labelLimit: Math.max(2, Math.min(5, Math.floor(width / 130))),
  };
}
