import { isRussian } from '../core/i18n.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
const T = (en, ru) => (isRussian() ? ru : en);
export function helpGuides() {
  const guides = [
    [
      T('Create a structured note', 'Создать структурированную заметку'),
      'knowledge',
      [
        T(
          'Open Knowledge base. The arrow next to New note offers types such as Meeting or Decision, and From template.',
          'Откройте базу знаний. Стрелка рядом с «Новая заметка» предлагает типы «Встреча», «Решение» и создание из шаблона.',
        ),
        T(
          'Write the note, then use Type and properties in its reader header to set dates, participants or a project. You keep your reading position.',
          'Напишите заметку. В читателе откройте «Тип и свойства» в шапке, чтобы указать дату, участников или проект. Положение чтения сохраняется.',
        ),
        T(
          'Display → Card details chooses which filled properties appear in your catalog. This is a personal setting.',
          'В «Вид → Сведения на карточках» выберите заполненные свойства для каталога. Это личная настройка.',
        ),
      ],
    ],
    [
      T('Import, find and organize notes', 'Импортировать, найти и упорядочить заметки'),
      'knowledge',
      [
        T(
          'Use Import notes or drop TXT/MD files into the catalog. Review the import before applying it. ZIP tools, templates and offline notes are under Library tools.',
          'Нажмите «Импорт заметок» или перетащите TXT/MD в каталог. Проверьте импорт перед применением. ZIP, шаблоны и офлайн-заметки доступны в «Инструментах базы знаний».',
        ),
        T(
          'On a phone, tap the folder name above the catalog. Pin frequently used folders; recent folders and Parent folder shorten navigation. Select notes to move several at once.',
          'На телефоне нажмите название папки над каталогом. Закрепите частые папки; недавние папки и переход к родительской сокращают путь. Выделите заметки для массового переноса.',
        ),
        T(
          'Search scope shows whether you are searching a folder or the entire library. Open conditions to remove one operator. All conditions must match. Save a query as a smart collection for reuse.',
          'Область поиска показывает: выбранная папка или вся база. Раскройте условия, чтобы убрать отдельный оператор. Условия применяются вместе. Сохраните запрос как умную подборку для повторного использования.',
        ),
      ],
    ],
    [
      T('Plan on a project whiteboard', 'Планировать на холсте проекта'),
      'projects',
      [
        T(
          'Open a project → Whiteboard. On a phone, choose Whiteboard from the project view selector. Add text cards, linked materials and frames.',
          'Откройте проект → «Холст». На телефоне выберите его в списке видов проекта. Добавьте текстовые карточки, материалы и рамки.',
        ),
        T(
          'Enable Select cards and tick several cards to align, distribute, copy or remove them. Drag to move the selection. A frame includes its contained cards. Ctrl/Cmd+A, C, V and Z work when the canvas has focus.',
          'Включите «Выбрать карточки» и отметьте несколько для выравнивания, распределения, копирования или удаления. Перетаскивайте выделение целиком. Рамка включает вложенные карточки. Ctrl/Cmd+A, C, V и Z работают при фокусе на холсте.',
        ),
        T(
          'Use Outline to read and edit without dragging. Layouts saves your camera and outline mode. History previews and restores previous board versions; the current board is kept as a recovery version.',
          'В режиме «Список» можно читать и редактировать без перетаскивания. «Раскладки» сохраняют ваш масштаб и режим списка. «История» позволяет посмотреть и вернуть предыдущий холст; текущий остаётся в истории.',
        ),
      ],
    ],
    [
      T('Transfer a whiteboard', 'Перенести холст'),
      'projects',
      [
        T(
          'Open the download menu on a whiteboard. Smena JSON preserves card fields; JSON Canvas exports text, frames and connections for interchange.',
          'Откройте меню скачивания на холсте. Smena JSON сохраняет поля карточек; JSON Canvas переносит текст, рамки и связи для обмена.',
        ),
        T(
          'Import JSON or Canvas shows a review before adding or replacing cards. External file paths and URLs become text pointers. Source attachments are not uploaded, and linked Smena materials require current access.',
          '«Импорт JSON или Canvas» показывает предварительную проверку перед добавлением или заменой. Внешние пути файлов и URL станут текстовыми указателями. Вложения не загружаются, для связанных материалов Smena проверяется текущий доступ.',
        ),
        T(
          'Replacement requires a saved, unchanged board. If it changes during review, reopen the import. JSON Canvas is not a complete Obsidian vault import.',
          'Для замены нужен сохранённый холст без новых изменений. Если он изменился во время проверки, откройте импорт заново. JSON Canvas не импортирует целое хранилище Obsidian.',
        ),
      ],
    ],
    [
      T('Explore connections in Graph', 'Исследовать связи в графе'),
      'graph',
      [
        T(
          'Graph explores relations between materials; Whiteboard arranges cards inside one project; Board groups project tasks by status.',
          'Граф показывает связи материалов; холст размещает карточки внутри проекта; доска группирует задачи по статусам.',
        ),
        T(
          'Choose a material to focus on its neighbors. Simplified graph reduces detail. Physics automatically settles nodes; turn it off to pause movement.',
          'Выберите материал, чтобы сосредоточиться на соседях. «Упрощённый граф» уменьшает детализацию. Физика автоматически распределяет узлы; выключите её для остановки движения.',
        ),
        T(
          'Pin a selected node to keep its position. Layouts saves personal graph filters, positions, pins and camera. Reset returns to the generated layout; saved layouts remain available.',
          'Закрепите выбранный узел, чтобы сохранить его положение. «Раскладки» сохраняют личные фильтры, положения, закрепления и масштаб. Сброс возвращает автоматическую раскладку; сохранённые остаются доступными.',
        ),
      ],
    ],
    [
      T('Save changes and work offline', 'Сохранять изменения и работать офлайн'),
      'knowledge',
      [
        T(
          'Check the status dot in your account icon. Saved means synchronization completed; local or pending changes still need a connection. Refresh only after checking the state.',
          'Проверяйте точку статуса у аватара. «Сохранено» означает завершение синхронизации; локальным или ожидающим изменениям ещё нужно подключение. Перед обновлением страницы проверьте состояние.',
        ),
        T(
          'Prepare notes using Library tools → Offline library while online. Offline availability applies to prepared content; it does not download every linked file or another user’s private material.',
          'Заранее подготовьте заметки через «Инструменты базы знаний → Офлайн-библиотека» при наличии сети. Доступность относится к подготовленному содержимому; все связанные файлы и чужие закрытые материалы не скачиваются.',
        ),
        T(
          'After reconnecting, wait for Saved. If a conflict appears, review the versions and use the recovery actions offered by the app before replacing anything.',
          'После подключения дождитесь «Сохранено». При конфликте сравните версии и используйте предложенные приложением действия восстановления перед заменой данных.',
        ),
      ],
    ],
  ];
  return `<section class="help-guides" aria-label="${T('Task guides', 'Инструкции по задачам')}" translate="no">${guides.map(([title, route, steps]) => `<details><summary>${esc(title)}</summary><ol>${steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol><button class="btn btn-secondary btn-sm" data-a="go" data-r="${route}">${ic('arrow-up-right', 14)}${T('Open section', 'Открыть раздел')}</button></details>`).join('')}</section>`;
}
