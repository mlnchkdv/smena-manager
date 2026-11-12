# Подготовка к публикации · 14 пунктов · 12.11.2026

Работа выполняется последовательно; каждая правка — отдельный commit и push.
Проверки используют синтетические локальные данные. Секретные файлы переноса
остаются в игнорируемом `.data`, не включаются в отчёт или Git.

| Пункт | Работа                                  | Состояние и проверка                                                                                                                                                                                                                                                                |
| ----- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01   | Исправленная версия Vite                | Vite 6.4.6; полный npm audit: 0 известных уязвимостей. Сборка и бюджет 594,6/600 КиБ прошли.                                                                                                                                                                                        |
| P02   | Домен, HTTPS и Google origin            | Helper APP_ORIGIN, dry-run и explicit-write; исправлен callback в регламенте. Домен, DNS/TLS и Console ожидают адреса.                                                                                                                                                              |
| P03   | Устойчивость и разделение Google grants | Добавлены диагноз shared grant, optional strict preflight и минимальные scopes setup. Новый отдельный клиент/consent и статус Google Console ожидают оператора.                                                                                                                     |
| P04   | Миграция push и повторы по устройствам  | Подписки привязаны к origin/ключу; VPS исключает старые без удаления. Partial retry хранит успешные device ID. Изолированные проверки не отправляют push.                                                                                                                           |
| P05   | Контролируемый первый запуск очереди    | Новая VPS-очередь на паузе до явного review; preview без текста сообщений, CAS, skip-before с защитой active lease. 11 проверок прошли; UI RU/EN проверяется в итоговой матрице.                                                                                                    |
| P06   | Копия и проверяемое восстановление      | Потоковая инвентаризация внешнего экспорта, обнаружение порчи/пропусков; 10 проверок cold-copy, истории и независимых медиа прошли. Живая полная/offsite-копия и restore drill ожидают VPS.                                                                                         |
| P07   | Google-сессии, роли и изоляция          | Production VPS требует стабильный ключ; Access ID по умолчанию выключен. Новая проверка fresh-process/cookie + роли/изоляция: 34 tests pass. Google на новом домене и физические телефоны ожидают живой приёмки.                                                                    |
| P08   | Ubuntu, обновление и откат              | Read-only host inspector: Nginx/systemd, managed single-writer, matching TLS release, Google HTTPS reachability (не OAuth). 8 checks incl injected activation failures/rollback прошли; настоящий Ubuntu/VPS ещё не проверен.                                                       |
| P09   | Независимый мониторинг                  | Отдельный read-only timer/helper и loopback readiness с отдельным ключом; storage/cron/backup/auth/queue/disk/RAM. 9 tests pass. Timer, внешний uptime/alert и реальный scheduled run ожидают включения на VPS.                                                                     |
| P10   | Массовая загрузка и большие файлы       | Virtual 5 GiB + lost partial reply/resume, строгая upload URL/size валидация; 24 проверки передачи/Range/ZIP/очереди прошли. Реальная Aeza/Drive скорость, checksum roundtrip и lock/unlock телефонов ожидают приёмки.                                                              |
| P11   | Память сборки, место и релизы           | Build cgroup: 3 GiB aggregate, CPU/tasks/time, секреты исключены; disk guard 8 GiB/10%. Cleanup preview+review key сохраняет current/previous/5 newest и все shared assets/data. 9 tests pass; Linux peak/OOM/cleanup приёмка ожидается.                                            |
| P12   | Сжатие статики                          | Явный gzip только static; API off. TLS acceptance сравнивает identity/gzip байты и Vary, отрицательные сценарии добавлены. Реальный Nginx/HTTPS ожидает VPS.                                                                                                                        |
| P13   | Длинные MD и холодный поиск             | Worker отдаёт безопасное начало до полной AST; 16 tests pass. WebKit RU390/EN1366: первое чтение 2,2–3,8 с, полный MD 8,2–11,7 с, source/history SHA совпали. Search process-cold708/warm535 мс. Долгая полная обработка остаётся ограничением.                                     |
| P14   | Итоговая RU/EN и адаптивная приёмка     | 1004 tests + lint/tokens/build/budget passed на зафиксированном коде. 352 layout cases RU/EN, 12 touch scenes, keyboard/100 recipients, точная финальная сборка проверена. Одна промежуточная overflow-метрика не воспроизвелась в 20 замерах; реальная приёмка остаётся отдельной. |

Локальные тесты не подтверждают DNS/TLS, доступ к Google с IP Aeza, получение
сообщений, настоящий плановый запуск или поведение мобильной ОС. Эти результаты
отмечаются отдельно после фактической проверки. Миграция данных и рассылка
команде в рамках локальных проверок не запускаются.

EN: Each item has a separate commit/push and appropriate isolated checks. Live
DNS/TLS, Google consent, Ubuntu activation/rollback, real file transfers,
scheduled delivery and physical devices remain explicit acceptance steps.
Secrets are excluded from source control and all test evidence.

P13 evidence: [2026-11-12-markdown-prelaunch.json](audits/2026-11-12-markdown-prelaunch.json). Opening preview is explicitly partial until full formatting completes; source, search index and history are never truncated.

## Итог локального внедрения / Local implementation outcome

Все 14 пунктов получили изменения кода, конфигурации, проверок или эксплуатационных инструментов; каждая правка отдельно закоммичена и отправлена. Это **не** означает завершённую публикацию или живую приёмку Google/Aeza. Основной сайт и реальный сервер в этом прогоне не проверялись. Секретный комплект переноса не менялся и не попал в Git.

- Финальный проверенный код: `caa2981`; исходники стабильны на всех контрольных точках release-check. После проверки добавлен только этот отчёт и ссылки на него.
- 1004 серверных/общих теста, lint, дизайн-токены, production build и бюджет прошли. Начальный JS: **595,6 / 600 КиБ**. Отдельный lint `deploy/vps` прошёл.
- Windows WebKit: RU/EN × 22 раздела/представления × 8 размеров = **352** сцены. Размеры: 320×567, 390×844, 768×1024, 1024×768, 1366×768, 1920×1080, 844×390, 683×384. Последний — эквивалент маленькой области компоновки, не подтверждение реального zoom 200%.
- Видимых кнопок без доступного имени и alert-блоков не обнаружено. Одно начальное измерение EN / Notifications / 320 показало +192 px; отдельная проверка на том же экране и 20 замеров пяти переключений дали 0. Устойчивый дефект не воспроизведён; не добавляли CSS, скрывающий возможную причину. Перепроверить при живой приёмке.
- Очередь: RU/EN на 320/390/844/1366; сохранение паузы после reload; stale review →409; обычный участник получает 403 на review/readiness. Длинная сводка 100 получателей прокручивается клавишей PageDown, доступна через Tab, сворачивается Enter; preview заметки открывается Enter, закрывается Escape с возвратом фокуса.
- Отдельная эмуляция iPhone-подобного WebKit с coarse pointer: 12 сцен RU/EN на 390 и 844 px — touch-фильтр/выбор папок, quick preview без редактора, preview файлов, переключение жестов графа, сохранённый вход после reload. `maxTouchPoints` в этом Windows WebKit равнялся 0; проверены фактические touchstart, свойство navigator не подменялось. Физические устройства не принимались.
- На точной финальной production-сборке дополнительно повторены RU/EN × 390/1366: preview, reload/session, отсутствие переполнения. Вернулись к русскому языку; обе большие служебные MD восстановлены по SHA-256 и возвращены в локальную корзину (178 активных заметок).
- Полное открытие больших MD всё ещё занимает 8,2–11,7 с в этом одиночном локальном прогоне. Ранний фрагмент появляется за 2,2–3,8 с. Это известное ограничение, а не обещание мгновенного чтения. Перенос на Drive требует отдельного профиля производительности.

Доказательства без секретов: [2026-11-12-prelaunch.json](audits/2026-11-12-prelaunch.json). Полные локальные логи/снимки находятся в `output/playwright/prelaunch-2026-11-12` и `output/release-checks` и не добавлялись в Git.

EN: All 14 items have local implementation/tooling and separately pushed commits. Final code checks pass (1004 tests, lint, tokens, production build, 595.6/600 KiB startup JS). The 352-case RU/EN layout matrix, a separate 12-scene touch emulation, keyboard/focus, queue persistence/ACL and final-build refresh smoke are recorded in the JSON evidence. One transient overflow measurement could not be reproduced; keep it in live acceptance. Large Markdown full preparation remains slow. Emulation and protocol mocks do not establish production, Google, physical-device or background-transfer correctness.

## До открытия доступа команде / Before inviting the team

1. Выбрать домен и настроить DNS/TLS, APP_ORIGIN и точный JavaScript origin Google. GIS popup не требует нового callback; не удалять действующие callback, нужные другим OAuth-процедурам.
2. Выполнить отдельный Gmail consent с отдельным клиентом, проверить реальный publishing status Google, не делать вывод о нём по локальному флагу. Сохранять ключи сессий при обновлениях; новый домен требует нового входа.
3. Принять реальную установку Ubuntu: cgroup/место, Google с IP Aeza, Nginx gzip по байтам, единственный writer, корректное обновление и аварийный откат. Использовать [инструкции VPS](../deploy/vps/README.md).
4. Перед переключением остановить старую запись и cron. Создать свежие копии данных и независимых медиа, проверить восстановление в отдельном пространстве и зашифрованную внешнюю копию. JSON без бинарных объектов не подтверждает восстановимость файлов.
5. Первый настоящий плановый запуск наблюдать при приостановленной доставке. Проверить status выполнения, созданную копию и сформированную очередь; затем осознанно пропустить старое/включить проверенную доставку. HTTP 200 сам по себе недостаточен.
6. Проверить вход Google/права/изоляцию на новом origin, подключить push-устройства заново, проверить реальное получение Gmail/push и отсутствие повторов успешным устройствам.
7. Проверить реальные фото/видео 1–5 ГиБ с контрольными суммами, Range и ограничения ZIP, потерю сети/повторный выбор файла, блокировку/возврат на iOS и Android. Эмуляция не заменяет этот шаг.
8. Включить независимый монитор и внешний канал uptime/alerts, проверить свежие результаты после перезагрузки VPS. Один журнал на самом VPS не оповестит о полном отказе хоста.

EN: Domain/Google consent, actual Ubuntu activation/rollback/resource limits, independent recovery/offsite copies, first scheduled run, real Gmail/push receipt, real large transfers and physical phones remain explicit operational acceptance. None was silently executed or marked passed locally.

## Первичные технические источники / Primary references

Параметры transient service и ограничения cgroup сверены с [systemd-run для Ubuntu 24.04](https://manpages.ubuntu.com/manpages/noble/man1/systemd-run.1.html) и [systemd.resource-control](https://manpages.ubuntu.com/manpages/noble/man5/systemd.resource-control.5.html). Наличие этих возможностей в документации не заменяет запуск unit на VPS.

Контекст gzip/Vary и MIME-типы сверены с [Nginx gzip module](https://nginx.org/en/docs/http/ngx_http_gzip_module.html). Сжатие ограничено публичной статикой; API не включён в него.

Жизненный цикл grant, включая семидневное ограничение для External/Testing с дополнительными scopes, сверяется с [Google OAuth refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration). Значение publishing-status в env — декларация оператора, не чтение Console.
