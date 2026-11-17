// Runs before styles to avoid a flash; independent of signed-in preferences.
try {
  const saved = localStorage.getItem('smena.product.theme');
  document.documentElement.dataset.theme = ['light', 'dark'].includes(saved) ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
} catch {
  // Shared tokens still follow the system when browser storage is unavailable.
}
