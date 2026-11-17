import { publicLinksRequest, getActiveWorkspace, getSessionGeneration } from '../core/api.js';
import { D, S } from '../core/store.js';
import { esc, fmtTimestamp } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { openModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';

const copy = (en, ru) => (isRussian() ? ru : en);
const scope = () => `${getActiveWorkspace()}:${getSessionGeneration()}`;
const absolute = path => new URL(path, location.origin).href;
function message(error) {
  if (error.code === 'PUBLIC_LINKS_DISABLED') return copy('Public links are disabled on this server.', 'Публичные ссылки на этом сервере отключены.');
  if (error.code === 'PUBLIC_LINK_LIMIT') return copy('Revoke unused links before creating another.', 'Отзовите неиспользуемые ссылки перед созданием новой.');
  if ([403, 404].includes(error.status))
    return copy('The material is unavailable or your access changed. Refresh the page.', 'Материал недоступен или ваши права изменились. Обновите страницу.');
  return copy('Unable to update public access. Try again.', 'Не удалось обновить публичный доступ. Попробуйте ещё раз.');
}
async function load(m) {
  const query = new URLSearchParams({ kind: m.kind, targetId: m.targetId, ...(m.projectId ? { projectId: m.projectId } : {}) });
  const result = await publicLinksRequest('?' + query);
  if (m.scope === scope()) m.links = result.links;
}
export async function openPublicLink(kind, id, projectId) {
  const file = kind === 'file' ? D().files.find(row => row.id === id) : null;
  projectId = file?.project || projectId;
  const object =
    file ||
    (kind === 'note'
      ? D().knowledgeNotes.find(row => row.id === id)
      : kind === 'file-folder'
        ? D()
            .projects.find(row => row.id === projectId)
            ?.fileFolders?.find(row => row.id === id)
        : D().knowledgeFolders.find(row => row.id === id));
  if (!object) return;
  const m = {
    type: 'publicLink',
    kind,
    targetId: id,
    projectId: projectId || null,
    name: object.title || object.name,
    scope: scope(),
    links: [],
    loading: true,
    error: '',
    message: '',
    days: 7,
    render: publicLinkDialog,
    beforeClose: () => !m.busy,
  };
  openModal(m);
  try {
    await load(m);
  } catch (error) {
    m.error = message(error);
  } finally {
    m.loading = false;
    if (m.scope === scope() && S.ui.modals.includes(m)) render();
  }
}
function publicLinkDialog(m, H) {
  const busy = m.loading || m.busy;
  const folder = m.kind.endsWith('-folder');
  const active = m.links.filter(link => !link.revokedAt && (!link.expiresAt || Date.parse(link.expiresAt) > Date.now()));
  return `${H(copy('Public link', 'Публичная ссылка'))}<div class="modal-b public-link-body" translate="no"><h3>${esc(m.name)}</h3>
    <p>${copy('Anyone with the link can read this material without signing in, including AI assistants. They cannot edit it.', 'Любой, у кого есть ссылка, сможет прочитать материал без входа, в том числе ИИ-помощники. Редактирование недоступно.')}</p>
    ${folder ? `<p class="alert warn">${copy('This link includes all subfolders and their contents. Newly added materials will also become public. Revoke the link to stop access.', 'Ссылка открывает все вложенные папки и их содержимое. Добавленные позже материалы также станут публичными. Чтобы закрыть доступ, отзовите ссылку.')}</p>` : m.kind === 'note' ? `<p class="hint">${copy('Only the current note text is shared. Attachments, linked private materials and version history stay private. Markdown and JSON are available to AI clients.', 'Публикуется только текущий текст заметки. Вложения, связанные приватные материалы и история версий остаются закрытыми. Для ИИ доступны Markdown и JSON.')}</p>` : ''}
    ${m.error ? `<p class="alert warn" role="alert">${esc(m.error)}</p>` : ''}${m.message ? `<p class="alert" role="status">${esc(m.message)}</p>` : ''}
    ${m.loading ? `<p role="status">${copy('Loading links…', 'Загружаем ссылки…')}</p>` : active.length ? `<div class="public-link-list">${active.map(link => `<section class="public-link-row" aria-label="${copy('Active link', 'Действующая ссылка')}"><label for="public-link-${esc(link.id)}">${link.expiresAt ? `${copy('Available until', 'Доступна до')} ${esc(fmtTimestamp(link.expiresAt))}` : copy('No expiry', 'Без срока действия')}</label><input id="public-link-${esc(link.id)}" class="input" readonly value="${esc(absolute(link.path))}" aria-label="${copy('Public URL', 'Публичный адрес')}" spellcheck="false"><div class="row wrap"><button class="btn btn-secondary" data-a="publicLinkAction" data-op="copy" data-id="${esc(link.id)}" ${busy ? 'disabled' : ''}>${ic('copy', 15)}${copy('Copy link', 'Скопировать ссылку')}</button><a class="btn btn-ghost" href="${esc(absolute(link.path))}" target="_blank" rel="noopener noreferrer">${ic('external-link', 15)}${copy('Open', 'Открыть')}</a><button class="btn btn-danger-ghost" data-a="publicLinkAction" data-op="revoke" data-id="${esc(link.id)}" ${busy ? 'disabled' : ''}>${copy('Revoke access', 'Отозвать доступ')}</button></div></section>`).join('')}</div>` : `<p class="hint">${copy('No active public links. This material is private.', 'Действующих публичных ссылок нет. Материал закрыт.')}</p>`}
    ${
      !m.loading && !m.error
        ? `<div class="public-link-create"><label for="public-link-days">${copy('Link lifetime', 'Срок действия ссылки')}</label><select id="public-link-days" class="select" data-in="publicLinkDays" ${busy ? 'disabled' : ''}>${[
            [1, '1 day', '1 день'],
            [7, '7 days', '7 дней'],
            [30, '30 days', '30 дней'],
            [90, '90 days', '90 дней'],
            [0, 'No expiry', 'Без срока'],
          ]
            .map(([value, en, ru]) => `<option value="${value}" ${m.days === value ? 'selected' : ''}>${copy(en, ru)}</option>`)
            .join(
              '',
            )}</select><button class="btn btn-primary" data-a="publicLinkAction" data-op="create" ${busy ? 'disabled' : ''}>${ic('globe', 15)}${busy ? copy('Creating…', 'Создаём…') : active.length ? copy('Create another link', 'Создать ещё ссылку') : copy('Create public link', 'Создать публичную ссылку')}</button></div>`
        : ''
    }
  </div><div class="modal-f"><button class="btn btn-secondary" data-a="publicLinkAction" data-op="refresh" ${busy ? 'disabled' : ''}>${copy('Refresh', 'Обновить')}</button><button class="btn btn-secondary" data-a="closeModal" ${m.busy ? 'disabled' : ''}>${copy('Done', 'Готово')}</button></div>`;
}
export async function publicLinkAction(el) {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'publicLink' || m.busy || m.loading || m.scope !== scope()) return;
  const op = el.dataset.op;
  m.days = Number(document.getElementById('public-link-days')?.value ?? m.days);
  m.busy = true;
  m.error = '';
  m.message = '';
  render();
  try {
    if (op === 'create') {
      await publicLinksRequest('', {
        method: 'POST',
        body: JSON.stringify({ kind: m.kind, targetId: m.targetId, projectId: m.projectId, expiresInDays: m.days, locale: isRussian() ? 'ru' : 'en' }),
      });
      m.message = copy('Public link created. Copy it to share.', 'Публичная ссылка создана. Скопируйте её, чтобы поделиться.');
    } else if (op === 'revoke') {
      await publicLinksRequest('/' + encodeURIComponent(el.dataset.id), { method: 'DELETE' });
      m.message = copy('Access revoked. The old link no longer works.', 'Доступ отозван. Прежняя ссылка больше не работает.');
    } else if (op === 'copy') {
      const link = m.links.find(row => row.id === el.dataset.id);
      if (link) await navigator.clipboard.writeText(absolute(link.path));
      m.message = copy('Link copied.', 'Ссылка скопирована.');
    }
    if (op !== 'copy') await load(m);
  } catch (error) {
    m.error = message(error);
  } finally {
    m.busy = false;
    if (m.scope === scope() && S.ui.modals.includes(m)) render();
  }
}

export function capturePublicLinkDays(el) {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'publicLink' && m.scope === scope()) m.days = Number(el.value);
}
