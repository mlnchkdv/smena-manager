// COSE stop() marks the simulation stopped but its already queued frame still
// publishes final positions. Keep the old renderer alive until that frame drains.
export function disposeGraph(cy, layout, defer = requestAnimationFrame) {
  if (!cy || cy.destroyed()) return;
  cy.removeAllListeners();
  if (layout) {
    layout.removeAllListeners();
    layout.stop();
  }
  // Also drain a layout stopped by grab/timeout: its layoutstop event may have
  // already cleared the owner's running-layout reference before this cleanup.
  defer(() => {
    if (!cy.destroyed()) cy.destroy();
  });
}
