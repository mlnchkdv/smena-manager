# Возобновляемая загрузка файлов / Resumable file uploads

## Русский

Для больших файлов используется прямая загрузка по частям в Google Drive.
Текущий стандартный предел — 20 ГиБ на файл, до 500 незавершённых файлов в
очереди и две одновременные передачи. Загрузка через сервер остаётся отдельным
режимом: 100 МиБ на VPS, 4 МиБ при установленном `VERCEL`; она не поддерживает
продолжение с середины файла.

### После обрыва связи

- При потере сети очередь показывает «Ожидаем сеть» и продолжает автоматически
  после возвращения подключения. Ручная пауза и отмена сохраняются.
- Для временных сетевых ошибок, 408, 429 и 5xx предусмотрены ограниченные повторы
  с увеличением задержки. После восьми повторов уровня очереди потребуется
  действие пользователя. Ошибки доступа не повторяются автоматически.
- Перед продолжением приложение запрашивает позицию, подтверждённую Drive.
  Отправленные, но не подтверждённые байты не считаются сохранёнными.

### После обновления или повторного открытия

1. Очередь восстанавливается для того же аккаунта и рабочего пространства.
2. Если файлы выбраны кнопкой загрузки в браузере с File System Access API,
   сохраняется ссылка на исходник, а не его содержимое. При сохранившемся
   разрешении на чтение приложение проверяет исходник и продолжает передачу.
   При запросе нового разрешения доступна кнопка «Восстановить доступ к файлам».
3. Если сохранённого доступа нет, нажмите «Выбрать исходные файлы». Это штатный
   путь для неподдерживающих браузеров, обычного выбора файлов и импорта папок.
4. Перед продолжением проверяется всё содержимое файла порциями по 8 МиБ.
   Совпадения имени и размера недостаточно. Изменение только даты файла допустимо,
   если проверка содержимого подтвердила тот же исходник. Проверка больших видео
   требует времени и чтения исходника целиком.
5. Если байты уже приняты, а ответ сохранения в каталог потерян, повторяется
   только регистрация того же ID. Повторно выбирать и отправлять исходник для
   этого не требуется; запись в каталоге остаётся одной.

Служебное разрешение на загрузку продлевается после повторной авторизации и
проверки текущих прав проекта, задачи и папки. Предельное окно — семь дней от
первого разрешения; продление его не сдвигает. Истёкшая или удалённая провайдером
сессия требует явного повторного запуска файла. Источник на диске должен
оставаться доступным. Смена домена не переносит браузерный журнал.

Журнал IndexedDB хранит зашифрованные данные сессии; ссылки на выбранные файлы
хранятся отдельно. Резервная запись текущей вкладки помогает пережить обновление;
её блокировка или повреждение не мешают чтению исправного журнала IndexedDB.
Выход очищает журнал и ссылки. Содержимое видео не копируется в браузерное
хранилище. Одну очередь в одном профиле браузера обслуживает одна вкладка.

Браузер должен оставаться активным для передачи. Закрытие вкладки, блокировка
экрана и выгрузка приложения ОС не означают работу в фоне. Сохранённая очередь
позволяет продолжить позже в пределах действующей сессии.

## English

Large files upload directly to Google Drive in chunks. Defaults are 20 GiB per
file, 500 unfinished queue entries and two concurrent transfers. Server-proxied
uploads are a separate mode, capped at 100 MiB on VPS and 4 MiB when `VERCEL` is
set; that mode cannot resume from a byte offset.

### Connection recovery

An offline queue waits for connectivity and resumes automatically. Manual pause
and cancellation are preserved. Temporary network failures and HTTP 408/429/5xx
use bounded backoff, with eight queue-level retries before manual intervention.
Access failures do not loop. Resumption probes Drive for its confirmed offset;
bytes merely sent by the browser are never treated as durable progress.

### Reload and reopening

- The queue is bound to the signed-in account, workspace and browser origin.
- The upload button uses File System Access when supported. Read-only source
  handles can survive reload; file contents are not cached. Granted access is
  checked automatically. Renewing permission requires the explicit “Restore file
  access” button.
- Other browsers, standard file selection and folder imports use “Choose
  original files”. Selecting the same source resumes the existing transfer.
- Full source identity is checked with bounded 8 MiB reads. Identical filenames
  and sizes are insufficient. A changed timestamp is accepted only when contents
  still match. Rechecking a large video requires reading the entire source.
- A lost catalog response reuses the uploaded provider ID. Registration can
  recover without reopening or transmitting the source; it does not duplicate
  the catalog entry.

Upload authorization is renewed only after current account/project/task/folder
permission checks, within the original seven-day deadline. Renewal never extends
that deadline. An expired provider session requires an explicit restart. The
source must remain accessible. Origin changes do not migrate browser journals.

Durable provider credentials are encrypted in IndexedDB; optional source handles
are stored separately. The same-tab fallback helps reload recovery. Unavailable
or corrupt session storage cannot disable a healthy IndexedDB checkpoint.
Signing out clears stored checkpoints and handles. One browser tab owns a queue.

Keep the browser active. Closing the tab, locking the screen or OS suspension
does not guarantee background transfer; recovery resumes later if the provider
session is still valid.

## Проверка / Validation · 13.11.2026

Local acceptance uses synthetic files and an isolated storage provider. It does
not access Google credentials or team data. Browser/layout evidence is recorded
in [the audit JSON](audits/2026-11-13-upload-recovery.json).

- Full pre-hardening code gate: 1013 tests, lint, UI tokens, production build and
  startup budget passed. The additional blocked-session-storage regression and
  related recovery tests passed separately. Later code gates explicitly reuse
  that full test run rather than claiming a new full suite execution.
- Chromium: reload/reselection, changed-source rejection, offline/online recovery,
  manual pause, persisted native file handles and lost catalog-response recovery.
  The native handle fixture uses OPFS handles and a deterministic picker adapter;
  it does not certify the OS file chooser or persistent user permission prompts.
- Final production build: Chromium and mobile-emulated Windows WebKit both passed
  RU/EN reload/reselection and offline/online recovery at 320×567, 390×844,
  768×1024, 844×390 and 1366×768. With the earlier extended Chromium run, this is
  40 layout scenes. Final Chromium also blocks reads of the session fallback,
  proving recovery from IndexedDB. All seven completed fixture payloads have
  matching SHA-256 checksums, with no confirmed chunk retransmitted.
- WebKit exposed a real offline lazy-module failure. Transfer code is now loaded
  with the queue before jobs start. The final runs use direct local HTTP via a
  destination adapter: WebKit's Playwright interception otherwise loses Blob
  bodies. This tests actual browser bytes against a fake provider, not Google.
- Google protocol tests include a virtual 5 GiB file with offsets beyond 32 bits.
  Browser byte-transfer fixtures are 20 MiB; they do not establish multi-GiB
  throughput or real Google/Aeza reliability.
- Native beforeunload prompts are suppressed in the automated fixture while
  checkpoint handlers still run. This is a harness adaptation, not product code.
- Final code gates pass lint, UI tokens, build and the **595.3 / 600 KiB** startup
  budget; their `partial` status explicitly records reuse of the earlier full
  suite. Additional targeted checks cover the subsequent code changes.
- Actual Google Drive, Aeza, physical iOS/Android and screen-lock/background
  behavior remain separate acceptance checks.

Protocol semantics follow [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).
Handle persistence and user permission requirements follow the
[File System Access documentation](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).
