# Процесс проекта / Project process

## Русский

Откройте меню «…» проекта → **Процесс проекта**. Просмотр доступен участникам, которым виден проект. Настраивать процесс может владелец пространства, администратор или участник с полным доступом к проекту. Архивный проект доступен только для просмотра.

Выберите один из пяти стандартных статусов. Для него можно задать:

- разрешённые следующие статусы;
- WIP — максимальное количество неархивных задач, `0` означает отсутствие ограничения;
- требования при входе: доступный исполнитель, описание, срок, завершённые подзадачи и доступные завершённые зависимости.

Правила проверяются по итоговому набору задач. Массовый обмен местами допускается, если итоговый лимит соблюдён. Снижение WIP не удаляет существующие задачи, но ограничивает вход новой работы. Несвязанные правки старой задачи не требуют заново выполнять условия готовности.

Пять сохранённых статусов не переименовываются: отчёты, этапы и уведомления продолжают работать с прежними идентичностями. Включение процесса само по себе не рассылает сообщения и не меняет сроки задач.

### Циклы

В раскрываемом блоке «Циклы» создаются периоды с названием и датами. Сначала примените изменение цикла к черновику, затем нажмите **Сохранить процесс**. Поиск, страницы по 20 и отдельное включение архивных записей позволяют работать с большим списком. В модели допускается до 500 циклов, включая архивные.

Архивирование сохраняет идентичность и прежние назначения. Архивный цикл не принимает новые задачи. Если он был активным, активный выбор очищается. Даты цикла обозначают период планирования и не переписывают сроки задач. Счётчики включают только неархивные задачи; они загружаются при открытии или обновлении окна, а не являются живым счётчиком присутствия.

В карточке задачи цикл находится в блоке **Дополнительные поля**, в форме создания и редактирования — под основными параметрами. Новая задача по умолчанию получает активный цикл проекта. Если список отфильтрован по одному доступному циклу, форма и быстрое добавление используют этот цикл. Явный выбор **Без цикла** сохраняется. Неоднозначный фильтр или архивный цикл не назначаются новой задаче автоматически.

Для массового назначения выберите задачи одного проекта → **Цикл**. Доступны неархивные циклы и снятие назначения. Право изменения задач не даёт права менять сам процесс: участник с правом редактирования назначает цикл, а настройка процесса требует полного доступа. Читатель видит текущее назначение, но не меняет его.

Фильтр **Цикл** доступен в списках проекта и его сохранённых представлениях. Можно включить архивные циклы для просмотра истории или выбрать **Без цикла**. Одинаковые названия и идентификаторы в разных проектах не объединяются. Новое сохранённое представление копирует текущие фильтры, в том числе при создании из уже изменённого представления. Общие представления создают и изменяют пользователи с правом редактирования проекта.

В обзоре проекта показаны активный цикл и до трёх других неархивных циклов, завершённые/все задачи и задачи без назначения. Если активный цикл не выбран, показано до четырёх неархивных циклов. Нажатие открывает соответствующий список задач. Полный список и архив доступны в процессе проекта. Счётчики не включают архивные задачи; WIP проверяется по всему проекту, независимо от текущего фильтра и цикла.

Копирование задачи, повторение и преобразование подзадачи сохраняют доступный цикл. Вместо архивного или отсутствующего цикла используется активный, если он есть. Задача без цикла остаётся без цикла. При переносе существующей задачи в другой проект прежний цикл не переносится: прямой перенос снимает назначение, а смена проекта в форме предлагает активный цикл нового проекта. Номер и ссылка задачи сохраняются. Изменение назначения записывается в ленту с названием цикла на момент действия.

### Сохранение и конфликты

Правки применяются только по кнопке сохранения. Закрытие или обновление несохранённого черновика требует явного сброса. Черновик находится в памяти открытой вкладки: перезагрузка страницы не сохраняет несохранённую форму.

Если ответ записи потерян, повторите **ту же запись**. Сервер распознаёт уже сохранённую цель и не создаёт новую ревизию. Если другой участник изменил процесс, форма сохраняет черновик и предлагает обновление; чужое изменение не перезаписывается автоматически.

Если правила изменились между локальной командой задачи и её записью, сервер может отклонить даже корректное объединение полей. Приложение сохраняет актуальный локальный черновик для ручной проверки и скачивания; серверная версия не перезаписывается. Если localStorage недоступен, вкладку нужно держать открытой и скачать полную копию. JSON-предпросмотр ограничен и не заменяет полную копию.

Проверки команд на клиенте предотвращают постановку запрещённого изменения в очередь синхронизации. Канонические права, целостность и ревизия дополнительно проверяются сервером. Локальная приёмка не подтверждает работу настоящего Google Drive, production или физических телефонов.

## English

Open a project's **… → Project process** menu. Anyone who can read the project can inspect its process. Configuration requires workspace owner/admin rights or full project access. Archived projects are view-only.

Select one of the five canonical statuses, then configure allowed next statuses, WIP (`0` means unlimited), and entry requirements: an available assignee, description, due date, completed subtasks and accessible completed dependencies.

Checks evaluate the complete proposed task set. A bulk slot exchange can fit the limit. Lowering WIP retains existing work while restricting new entries. Unrelated edits to old work do not reapply entry readiness. Canonical status identities remain stable for reports, milestones and notifications. Configuring a process does not send messages or rewrite task dates.

The optional **Cycles** disclosure provides names, planning dates, search, pages of 20 and archived entries. Apply a cycle edit to the draft, then save the process explicitly. The model permits up to 500 cycles, including archived ones. Archiving retains identity and assignments, prevents new assignments, and clears the active choice when necessary. Cycle dates do not rewrite task due dates. Counts include non-archived tasks and refresh when the dialog is opened or refreshed.

The task drawer exposes **Cycle** under **More properties**; task forms show it below the main properties. New tasks default to the project's active cycle. A single live cycle inclusion filter supplies the creation context for both the form and quick add. An explicit **No cycle** choice is retained. Ambiguous filters and archived cycles never assign a historical cycle automatically.

Select tasks from one project and choose **Cycle** to assign a live cycle or clear the assignment in bulk. Task editors may change assignments; configuring the process requires full project access. Readers can inspect the assignment without changing it.

The **Cycle** filter is available in project task views and saved views, including archived cycles for historical inspection and **No cycle**. Equal cycle names or IDs in different projects remain distinct. Saving a new view copies the currently edited filters, including changes made within another saved view. Creating or changing shared views requires project editing rights.

The project overview shows the active cycle plus up to three other live cycles, completed/total counts and unassigned work. Without an active cycle, it shows up to four live cycles. A row opens that cycle's task list. The full list and archived cycles remain in Project process. Counts exclude archived tasks. WIP applies across the entire project, regardless of cycle or the current view filter.

Task copies, recurrence and subtask promotion retain a live cycle. An archived or unavailable source cycle falls back to the active cycle, if any; an unassigned source stays unassigned. Moving an existing task never carries a foreign cycle: a direct move clears the assignment, while changing the project in a task form proposes the destination's active cycle. The task key and link remain stable. Assignment activity records the cycle name at the time of the action.

Closing or refreshing an unsaved draft requires explicit discard. Drafts remain in the current tab's memory; a browser reload does not persist an unsaved form. A lost acknowledgement offers the same save again; an already-matching canonical target does not create another revision. Concurrent configuration edits retain the local draft and require refresh rather than overwriting another participant.

When process rules change between a local task command and its write, the server can reject an otherwise conflict-free field merge. The latest local draft remains available for explicit review and a complete download; the canonical version is retained. If localStorage is unavailable, keep the tab open and download the draft. The bounded JSON preview is not the complete recovery export.

Client command checks prevent known-invalid writes from entering sync. The server independently enforces canonical permissions, integrity and revision fences. Local acceptance does not establish real Google Drive, production or physical-device acceptance.
