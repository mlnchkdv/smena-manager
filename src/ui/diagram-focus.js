import { S } from '../core/store.js';

// A diagram is a workspace surface, never the owner of an overlay above it.
export function overlayAboveDiagram() {
  return !!(
    S.ui.auth ||
    S.ui.palette ||
    S.ui.modals.length ||
    S.ui.knowledgeDrawer ||
    S.ui.drawer ||
    S.ui.pop ||
    S.ui.mnav ||
    document.querySelector('.select-menu')
  );
}
