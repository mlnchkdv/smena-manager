import { knowledgeDisplayParts } from './shared/knowledge-frontmatter.js';
import { resolveKnowledgeBlock } from './shared/knowledge-block-references.js';
import './styles/offline.css';
import { offlineItems, putOffline, removeOffline, OFFLINE_OWNER } from './core/offline-library.js';
import { renderKnowledgeMarkdown } from './shared/knowledge-markdown.js';
let lang = localStorage.getItem('smena.offline.lang') || 'ru',
  active = null,
  items = [],
  url = '';
const words = (en, ru) => (lang === 'ru' ? ru : en);
const el = (tag, text) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return node;
};
const button = (text, fn) => {
  const b = el('button', text);
  b.type = 'button';
  b.onclick = fn;
  return b;
};
const download = (blob, name) => {
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = name;
  a.click();
};
async function render() {
  document.documentElement.lang = lang;
  document.getElementById('language').value = lang;
  const root = document.getElementById('offline-app');
  root.replaceChildren();
  const owner = localStorage.getItem(OFFLINE_OWNER);
  if (!owner) {
    root.append(
      el('h1', words('No local library', 'Нет локальных копий')),
      el('p', words('Keep materials offline from the signed-in application first.', 'Сначала сохраните материалы для офлайн-доступа в приложении.')),
    );
    return;
  }
  items = await offlineItems(owner);
  root.append(
    el('h1', words('Offline library', 'Офлайн-библиотека')),
    el(
      'p',
      words(
        'Local copies on this device. Changes are reviewed in the online app before synchronization.',
        'Локальные копии на устройстве. Перед синхронизацией правки проверяются в основном приложении.',
      ),
    ),
  );
  const layout = el('div');
  layout.className = 'offline-layout';
  const list = el('nav');
  list.setAttribute('aria-label', words('Saved materials', 'Сохранённые материалы'));
  for (const item of items)
    list.append(
      button(`${item.title} · ${item.workspaceName}${item.pending ? ' *' : ''}`, () => {
        active = item.key;
        void render();
      }),
    );
  const content = el('article'),
    item = items.find(i => i.key === active);
  if (item) {
    content.append(el('h2', item.title), el('small', `${item.workspaceName} · ${new Date(item.savedAt).toLocaleString(lang)}`));
    if (item.kind === 'file' || item.kind === 'upload')
      content.append(button(words('Download local file', 'Скачать локальный файл'), () => download(item.blob, item.title)));
    else {
      const preview = el('div');
      preview.className = 'offline-preview';
      const notes = items.filter(i => i.kind === 'note' && i.workspace === item.workspace).map(i => ({ ...i.base, formatted_markdown: i.body }));
      preview.innerHTML = renderKnowledgeMarkdown(knowledgeDisplayParts({ ...item.base, formatted_markdown: item.body }).body, {
        plainText: item.base?.sourceFormat === 'text',
        resolveBlock: (id, block) => resolveKnowledgeBlock(notes, id, block),
        embedUnavailableLabel: words('Keep the source note offline to view this block.', 'Сохраните исходную заметку офлайн для просмотра блока.'),
      });
      preview.onclick = async event => {
        const target = event.target.closest('[data-key]');
        if (!target) return;
        const key = target.dataset.key,
          separator = key.indexOf(':'),
          kind = key.slice(0, separator),
          id = key.slice(separator + 1);
        const saved = items.find(i => i.kind === kind && i.id === id && i.workspace === item.workspace);
        if (!saved) return alert(words('This material is not kept offline.', 'Материал не сохранён офлайн.'));
        if (kind === 'file') download(saved.blob, saved.title);
        else {
          active = saved.key;
          await render();
        }
      };
      content.append(preview);
      if (item.kind === 'note') {
        const details = el('details'),
          summary = el('summary', words('Edit local Markdown', 'Изменить локальный Markdown'));
        details.append(summary);
        const input = el('textarea');
        input.value = item.body;
        input.rows = 14;
        details.append(
          input,
          button(words('Queue edit', 'Сохранить в очередь'), async () => {
            try {
              await putOffline({ ...item, body: input.value, pending: input.value !== item.base.formatted_markdown });
              await render();
            } catch (error) {
              alert(error.message);
            }
          }),
        );
        content.append(
          details,
          button(words('Export text', 'Скачать текст'), () => download(new Blob([input.value], { type: 'text/plain;charset=utf-8' }), `${item.title}.md`)),
        );
      }
    }
    content.append(
      button(words('Remove local copy', 'Убрать локальную копию'), async () => {
        await removeOffline(item);
        active = null;
        await render();
      }),
    );
  } else content.append(el('p', words('Choose a material.', 'Выберите материал.')));
  layout.append(list, content);
  root.append(layout);
  const contexts = [...new Map(items.filter(i => i.projects?.length).map(i => [i.workspace, i])).values()];
  if (contexts.length) {
    const form = el('section');
    form.append(el('h2', words('Queue files for upload', 'Файлы для загрузки позже')));
    const target = el('select');
    for (const context of contexts)
      for (const project of context.projects) {
        const option = el('option', `${context.workspaceName} / ${project.name}`);
        option.value = JSON.stringify([context.workspace, project.id]);
        target.append(option);
      }
    const input = el('input');
    input.type = 'file';
    input.multiple = true;
    form.append(
      target,
      input,
      button(words('Keep in queue (20 MB per file)', 'Сохранить в очередь (до 20 МБ на файл)'), async () => {
        const [workspace, project] = JSON.parse(target.value),
          context = contexts.find(i => i.workspace === workspace);
        try {
          for (const file of [...input.files].slice(0, 20))
            await putOffline({
              owner,
              workspace,
              workspaceName: context.workspaceName,
              kind: 'upload',
              id: crypto.randomUUID(),
              title: file.name,
              project,
              blob: file,
              state: 'queued',
            });
          await render();
        } catch (error) {
          alert(error.message);
        }
      }),
    );
    root.append(form);
  }
}
document.getElementById('language').onchange = event => {
  lang = event.target.value;
  localStorage.setItem('smena.offline.lang', lang);
  void render();
};
void render().catch(error => {
  document.getElementById('offline-app').textContent = error.message;
});

window.addEventListener('storage', event => {
  if (event.key === OFFLINE_OWNER) {
    active = null;
    if (url) URL.revokeObjectURL(url);
    void render();
  }
});
