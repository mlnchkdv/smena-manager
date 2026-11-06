// Focus surfaces follow the visible viewport, including an on-screen keyboard.
// Keep one listener set shared by Graph and Whiteboards.
export function syncDiagramWindow() {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty('--diagram-window-height', `${viewport?.height || window.innerHeight}px`);
  document.documentElement.style.setProperty('--diagram-window-top', `${viewport?.offsetTop || 0}px`);
}
window.visualViewport?.addEventListener('resize', syncDiagramWindow);
window.visualViewport?.addEventListener('scroll', syncDiagramWindow);
window.addEventListener('resize', syncDiagramWindow);
syncDiagramWindow();
