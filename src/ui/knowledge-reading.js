import { entityAllowed } from '../shared/relations.js';
import { S } from '../core/store.js';
import { knowledgeAsset } from '../shared/knowledge-assets.js';
import { knowledgeImageUrl } from '../core/knowledge-media-state.js';
import { resolveKnowledgeBlock } from '../shared/knowledge-block-references.js';
import { D } from '../core/store.js';
import { t } from '../core/i18n.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeRelations } from '../shared/knowledge-links.js';
import { knowledgeBodyState, ensureKnowledgeBody } from '../core/knowledge-bodies.js';
import { render } from '../shell/render.js';
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
  const wikiTargets = new Map(
    knowledgeRelations(D().knowledgeNotes, note)
      .outgoing.filter(ref => ref.note)
      .map(ref => [ref.title.toLocaleLowerCase('ru-RU'), ref.note.id]),
  );
  return renderKnowledgeMarkdown(source, { ...knowledgeMarkdownOptions(note), wikiTargets, sourceId: note.id });
}
