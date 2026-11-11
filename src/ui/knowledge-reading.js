import { entityAllowed } from '../shared/relations.js';
import { S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { knowledgeAsset, knowledgeFileReferences } from '../shared/knowledge-assets.js';
import { knowledgeImageUrl } from '../core/knowledge-media-state.js';
import { resolveKnowledgeBlock } from '../shared/knowledge-block-references.js';
import { D } from '../core/store.js';
import { t } from '../core/i18n.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeRelations } from '../shared/knowledge-links.js';
import { knowledgeBodyState, ensureKnowledgeBody } from '../core/knowledge-bodies.js';
import { render, registerKnowledgeReadingRestorer } from '../shell/render.js';
import { getSessionGeneration, getActiveWorkspace } from '../core/api.js';
import { knowledgeReadingInputs } from '../shared/knowledge-reading-state.js';
import { captureKnowledgeReadingSurface, knowledgeReadingSurface } from './knowledge-reading-surface.js';
import { preparedMarkdown, clearMarkdownPreparation, readMarkdownPlain } from '../core/knowledge-markdown-demand.js';
import { A } from '../actions/actions.js';
import '../styles/knowledge-large-document.css';
const readText = (en, ru) => (document.documentElement.lang === 'ru' ? ru : en);
registerKnowledgeReadingRestorer(captureKnowledgeReadingSurface);
A.retryKnowledgeMarkdown = () => {
  clearMarkdownPreparation();
  render();
};
A.readKnowledgePlain = el => {
  if (S.ui.knowledgeDrawer === el.dataset.id) readMarkdownPlain();
};
export const knowledgeMarkdownOptions = (note = {}) => ({
  plainText: note.sourceFormat === 'text',
  sourceId: note.id,
  materialTarget: url => note.materialTargets?.[url] || '',
  asset: url => {
    const asset = knowledgeAsset(url, note.assets);
    return asset
      ? { ...asset, url: entityAllowed(D(), `file:${asset.id}`, { role: S.ui.currentUser?.role, memberId: D().me }) ? knowledgeImageUrl(asset.id) : '' }
      : null;
  },
  loadImageLabel: document.documentElement.lang === 'ru' ? 'Загрузить изображение' : 'Load image',
  bindImageLabel: document.documentElement.lang === 'ru' ? 'Связать с файлом' : 'Bind to a file',
  resolveBlock: (id, block) => {
    const target = D().knowledgeNotes.find(note => note.id === id);
    if (target && !knowledgeBodyState(target).loaded) {
      const state = knowledgeBodyState(target);
      if (!state.loading && !state.error)
        void ensureKnowledgeBody(target).then(render, error => {
          if (!error.staleSession) render();
        });
      return state.error ? null : { pending: true, title: target.title };
    }
    return resolveKnowledgeBlock(D().knowledgeNotes, id, block);
  },
  embedLoadingLabel: document.documentElement.lang === 'ru' ? 'Загрузка фрагмента…' : 'Loading excerpt…',
  embedShortenedLabel:
    document.documentElement.lang === 'ru'
      ? 'Фрагмент сокращён. Полный блок доступен в источнике.'
      : 'Excerpt shortened. Open the source to read the complete block.',
  embedUnavailableLabel: document.documentElement.lang === 'ru' ? 'Блок недоступен или образует цикл' : 'Block unavailable or recursive',
  unresolvedLabel: t('Unresolved wiki link'),
  imageLabel: t('Image'),
  openImageLabel: t('Open image'),
  unavailableImageLabel: t('Image source unavailable'),
});

export function knowledgeReadingHtml(note, source) {
  let tokenized, fallback;
  if (note.sourceFormat !== 'text' && source.length > 32000) {
    const prepared = preparedMarkdown(source);
    if (prepared.pending)
      return `<p role="status" data-knowledge-preparing translate="no">${readText('Preparing Markdown preview… You can continue using the toolbar.', 'Подготовка предпросмотра Markdown… Панель действий остаётся доступной.')}</p><button class="btn btn-secondary btn-sm" data-a="readKnowledgePlain" data-id="${esc(note.id)}" translate="no">${readText('Read without formatting', 'Читать без форматирования')}</button>`;
    if (prepared.error) fallback = prepared.error;
    tokenized = { source, tokens: prepared.tokens };
  }
  const options = { ...knowledgeMarkdownOptions(note), chunkedPlainText: true };
  const markup = () => {
    const fallbackLabel =
      fallback === 'plain'
        ? readText('Showing the complete text without formatting. The original is unchanged.', 'Показан полный текст без форматирования. Исходник не изменён.')
        : fallback === 'complexity'
          ? readText(
              'Complex formatting. Showing the complete text without formatting; the original is unchanged.',
              'Сложное форматирование. Показан полный текст без оформления; исходник не изменён.',
            )
          : readText(
              'Formatted preview is unavailable. Showing the complete text; the original is unchanged.',
              'Форматированный предпросмотр недоступен. Показан полный текст; исходник не изменён.',
            );
    if (fallback)
      return `<div class="knowledge-format-fallback"><p class="hint" role="status" translate="no">${fallbackLabel}</p>${fallback === 'complexity' ? '' : `<button class="btn btn-secondary btn-sm" data-a="retryKnowledgeMarkdown" translate="no">${readText('Retry formatting', 'Повторить форматирование')}</button>`}${renderKnowledgeMarkdown(source, { plainText: true, chunkedPlainText: true })}</div>`;
    const wikiTargets = new Map(
      knowledgeRelations(D().knowledgeNotes, note)
        .outgoing.filter(ref => ref.note)
        .map(ref => [ref.title.toLocaleLowerCase('ru-RU'), ref.note.id]),
    );
    return renderKnowledgeMarkdown(source, { ...options, wikiTargets, sourceId: note.id, tokenized });
  };
  if (source.length <= 32000) return markup();
  // Search marks are applied to live text nodes after insertion, so toolbar
  // actions and match navigation can retain the reading surface too.
  const assets = knowledgeFileReferences({ ...note, formatted_markdown: source }).map(id => [
    id,
    entityAllowed(D(), `file:${id}`, { role: S.ui.currentUser?.role, memberId: D().me }),
    knowledgeImageUrl(id),
  ]);
  const inputs = knowledgeReadingInputs(
    D(),
    note,
    source,
    [getSessionGeneration(), getActiveWorkspace(), document.documentElement.lang, S.ui.currentUser?.id, S.ui.currentUser?.role, fallback || 'formatted'],
    assets,
  );
  return knowledgeReadingSurface(inputs, markup);
}
