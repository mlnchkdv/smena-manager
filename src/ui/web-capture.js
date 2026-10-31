import { render } from '../shell/render.js';
import { A, copy } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { webCapture } from '../shared/web-capture.js';
import { isRussian } from '../core/i18n.js';
import { openModal } from '../overlays/modals.js';
import { esc } from '../core/utils.js';
import { toast } from './toast.js';
const label = (en, ru) => (isRussian() ? ru : en);
export function captureBookmarklet() {
  const destination = `${location.origin}/${encodeURIComponent(D().ws.url)}/bookmarks#capture=`;
  return `javascript:(()=>{const d={url:location.href,title:document.title,excerpt:String(window.getSelection()).slice(0,8000)};window.open(${JSON.stringify(destination)}+encodeURIComponent(JSON.stringify(d)),'_blank','noopener');})()`;
}
export function receiveWebCapture() {
  if (!location.hash.startsWith('#capture=') || S.ui.currentUser?.role === 'viewer') return;
  try {
    const capture = webCapture(JSON.parse(decodeURIComponent(location.hash.slice(9))));
    history.replaceState(null, '', location.pathname + location.search);
    A.newBookmark();
    Object.assign(S.ui.bookmarkDraft, capture);
    render();
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    toast(label('The web clip could not be read.', 'Не удалось прочитать веб-фрагмент.'), { kind: 'err' });
    history.replaceState(null, '', location.pathname + location.search);
  }
}
A.webCaptureHelp = () =>
  openModal({
    type: 'knowledgeTool',
    render: (m, H) =>
      `${H(label('Web capture', 'Сбор из браузера'))}<div class="modal-b" translate="no"><p>${label('Create a browser bookmark and paste this code into its URL. On a web page, select text and use it to prepare a bookmark here. Nothing is saved until you confirm.', 'Создайте закладку браузера и вставьте этот код в её адрес. На веб-странице выделите текст и нажмите её, чтобы подготовить закладку здесь. Сохранение выполняется после подтверждения в форме.')}</p><textarea class="textarea" rows="4" readonly aria-label="${label('Bookmarklet code', 'Код закладки')}">${esc(captureBookmarklet())}</textarea><button class="btn btn-secondary" data-a="copyWebCaptureTool">${label('Copy bookmarklet code', 'Копировать код закладки')}</button><p class="hint">${label('Page URL, title and selected text only; no background crawling. On mobile, paste a URL and excerpt into the bookmark form.', 'Только адрес, заголовок и выделенный текст. На телефоне вставьте ссылку и фрагмент в форму закладки.')}</p></div>`,
  });
A.copyWebCaptureTool = () => copy(captureBookmarklet());
