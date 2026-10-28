export function resizeKnowledgeTitle() {
  const title = document.getElementById('knowledge-title');
  if (!title || title.tagName !== 'TEXTAREA') return;
  title.style.height = '0px';
  title.style.height = `${title.scrollHeight}px`;
  resizeKnowledgeBody();
}

function resizeKnowledgeBody() {
  const body = document.querySelector('.knowledge-drawer-body');
  const field = document.getElementById('knowledge-body');
  if (!body || !field) return;
  const viewport = window.visualViewport;
  const short = (viewport?.height || innerHeight) <= 500;
  field.classList.toggle('is-short-editor', short);
  if (!short) return field.style.removeProperty('--knowledge-editor-height');
  if (!field.getClientRects().length) return;
  const bottom = Math.min(body.getBoundingClientRect().bottom, (viewport?.offsetTop || 0) + (viewport?.height || innerHeight));
  // Use the unscrolled position so scrolling the outer reader cannot grow the field.
  const top = field.getBoundingClientRect().top + body.scrollTop;
  field.style.setProperty('--knowledge-editor-height', `${Math.max(96, Math.min(360, Math.floor(bottom - top - 12)))}px`);
}
document.addEventListener('input', event => {
  if (event.target.id === 'knowledge-title') resizeKnowledgeTitle();
});
window.addEventListener('resize', resizeKnowledgeTitle);
window.visualViewport?.addEventListener('resize', resizeKnowledgeTitle);
