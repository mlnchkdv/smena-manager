const NOUNS = {
  comment: { en: ['comment', 'comments'], ru: ['комментарий', 'комментария', 'комментариев'] },
  team: { en: ['team', 'teams'], ru: ['команда', 'команды', 'команд'] },
  folder: { en: ['folder', 'folders'], ru: ['папка', 'папки', 'папок'] },
  note: { en: ['note', 'notes'], ru: ['заметка', 'заметки', 'заметок'] },
  file: { en: ['file', 'files'], ru: ['файл', 'файла', 'файлов'] },
  bookmark: { en: ['bookmark', 'bookmarks'], ru: ['закладка', 'закладки', 'закладок'] },
  card: { en: ['card', 'cards'], ru: ['карточка', 'карточки', 'карточек'] },
  connection: { en: ['connection', 'connections'], ru: ['связь', 'связи', 'связей'] },
};
export function countLabel(count, kind, locale = 'en-US') {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  const language = locale.startsWith('ru') ? 'ru' : 'en';
  const forms = NOUNS[kind]?.[language];
  if (!forms) throw new Error(`Unknown count kind: ${kind}`);
  const plural = new Intl.PluralRules(language).select(n);
  const index = plural === 'one' ? 0 : language === 'ru' && plural === 'few' ? 1 : forms.length - 1;
  return `${n} ${forms[index]}`;
}
