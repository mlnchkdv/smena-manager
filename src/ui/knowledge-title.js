export function resizeKnowledgeTitle() {
  const title = document.getElementById('knowledge-title');
  if (!title || title.tagName !== 'TEXTAREA') return;
  title.style.height = '0px';
  title.style.height = `${title.scrollHeight}px`;
}
document.addEventListener('input', event => {
  if (event.target.id === 'knowledge-title') resizeKnowledgeTitle();
});
window.addEventListener('resize', resizeKnowledgeTitle);
