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

Выбор цикла в карточке задачи и фильтры относятся к следующему шагу P07; одна форма настройки ещё не означает завершение всего этапа.

### Сохранение и конфликты

Правки применяются только по кнопке сохранения. Закрытие или обновление несохранённого черновика требует явного сброса. Черновик находится в памяти открытой вкладки: перезагрузка страницы не сохраняет несохранённую форму.

Если ответ записи потерян, повторите **ту же запись**. Сервер распознаёт уже сохранённую цель и не создаёт новую ревизию. Если другой участник изменил процесс, форма сохраняет черновик и предлагает обновление; чужое изменение не перезаписывается автоматически.

Проверки команд на клиенте предотвращают постановку запрещённого изменения в очередь синхронизации. Канонические права, целостность и ревизия дополнительно проверяются сервером. Локальная приёмка не подтверждает работу настоящего Google Drive, production или физических телефонов.

## English

Open a project's **… → Project process** menu. Anyone who can read the project can inspect its process. Configuration requires workspace owner/admin rights or full project access. Archived projects are view-only.

Select one of the five canonical statuses, then configure allowed next statuses, WIP (`0` means unlimited), and entry requirements: an available assignee, description, due date, completed subtasks and accessible completed dependencies.

Checks evaluate the complete proposed task set. A bulk slot exchange can fit the limit. Lowering WIP retains existing work while restricting new entries. Unrelated edits to old work do not reapply entry readiness. Canonical status identities remain stable for reports, milestones and notifications. Configuring a process does not send messages or rewrite task dates.

The optional **Cycles** disclosure provides names, planning dates, search, pages of 20 and archived entries. Apply a cycle edit to the draft, then save the process explicitly. The model permits up to 500 cycles, including archived ones. Archiving retains identity and assignments, prevents new assignments, and clears the active choice when necessary. Cycle dates do not rewrite task due dates. Counts include non-archived tasks and refresh when the dialog is opened or refreshed.

Task cycle selection and filtering are the following P07 step; the settings dialog alone does not complete P07.

Closing or refreshing an unsaved draft requires explicit discard. Drafts remain in the current tab's memory; a browser reload does not persist an unsaved form. A lost acknowledgement offers the same save again; an already-matching canonical target does not create another revision. Concurrent configuration edits retain the local draft and require refresh rather than overwriting another participant.

Client command checks prevent known-invalid writes from entering sync. The server independently enforces canonical permissions, integrity and revision fences. Local acceptance does not establish real Google Drive, production or physical-device acceptance.
