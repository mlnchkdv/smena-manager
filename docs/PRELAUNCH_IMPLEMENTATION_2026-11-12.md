# Подготовка к публикации · 14 пунктов · 12.11.2026

Работа выполняется последовательно; каждая правка — отдельный commit и push.
Проверки используют синтетические локальные данные. Секретные файлы переноса
остаются в игнорируемом `.data`, не включаются в отчёт или Git.

| Пункт | Работа                                  | Состояние и проверка                                                                                                                                                                                                                            |
| ----- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01   | Исправленная версия Vite                | Vite 6.4.6; полный npm audit: 0 известных уязвимостей. Сборка и бюджет 594,6/600 КиБ прошли.                                                                                                                                                    |
| P02   | Домен, HTTPS и Google origin            | Helper APP_ORIGIN, dry-run и explicit-write; исправлен callback в регламенте. Домен, DNS/TLS и Console ожидают адреса.                                                                                                                          |
| P03   | Устойчивость и разделение Google grants | Добавлены диагноз shared grant, optional strict preflight и минимальные scopes setup. Новый отдельный клиент/consent и статус Google Console ожидают оператора.                                                                                 |
| P04   | Миграция push и повторы по устройствам  | Подписки привязаны к origin/ключу; VPS исключает старые без удаления. Partial retry хранит успешные device ID. Изолированные проверки не отправляют push.                                                                                       |
| P05   | Контролируемый первый запуск очереди    | Новая VPS-очередь на паузе до явного review; preview без текста сообщений, CAS, skip-before с защитой active lease. 11 проверок прошли; UI RU/EN проверяется в итоговой матрице.                                                                |
| P06   | Копия и проверяемое восстановление      | Потоковая инвентаризация внешнего экспорта, обнаружение порчи/пропусков; 10 проверок cold-copy, истории и независимых медиа прошли. Живая полная/offsite-копия и restore drill ожидают VPS.                                                     |
| P07   | Google-сессии, роли и изоляция          | Production VPS требует стабильный ключ; Access ID по умолчанию выключен. Новая проверка fresh-process/cookie + роли/изоляция: 34 tests pass. Google на новом домене и физические телефоны ожидают живой приёмки.                                |
| P08   | Ubuntu, обновление и откат              | Read-only host inspector: Nginx/systemd, managed single-writer, matching TLS release, Google HTTPS reachability (не OAuth). 8 checks incl injected activation failures/rollback прошли; настоящий Ubuntu/VPS ещё не проверен.                   |
| P09   | Независимый мониторинг                  | Отдельный read-only timer/helper и loopback readiness с отдельным ключом; storage/cron/backup/auth/queue/disk/RAM. 9 tests pass. Timer, внешний uptime/alert и реальный scheduled run ожидают включения на VPS.                                 |
| P10   | Массовая загрузка и большие файлы       | Virtual 5 GiB + lost partial reply/resume, строгая upload URL/size валидация; 24 проверки передачи/Range/ZIP/очереди прошли. Реальная Aeza/Drive скорость, checksum roundtrip и lock/unlock телефонов ожидают приёмки.                          |
| P11   | Память сборки, место и релизы           | Build cgroup: 3 GiB aggregate, CPU/tasks/time, секреты исключены; disk guard 8 GiB/10%. Cleanup preview+review key сохраняет current/previous/5 newest и все shared assets/data. 9 tests pass; Linux peak/OOM/cleanup приёмка ожидается.        |
| P12   | Сжатие статики                          | Явный gzip только static; API off. TLS acceptance сравнивает identity/gzip байты и Vary, отрицательные сценарии добавлены. Реальный Nginx/HTTPS ожидает VPS.                                                                                    |
| P13   | Длинные MD и холодный поиск             | Worker отдаёт безопасное начало до полной AST; 16 tests pass. WebKit RU390/EN1366: первое чтение 2,2–3,8 с, полный MD 8,2–11,7 с, source/history SHA совпали. Search process-cold708/warm535 мс. Долгая полная обработка остаётся ограничением. |
| P14   | Итоговая RU/EN и адаптивная приёмка     | Исправлена найденная перегрузка review: сводка всех получателей, ограниченная высота и keyboard scroll. Review разрешения привязаны к origin, >100 получателей требуют сокращения. Итоговая матрица и release gate выполняются.                 |

Локальные тесты не подтверждают DNS/TLS, доступ к Google с IP Aeza, получение
сообщений, настоящий плановый запуск или поведение мобильной ОС. Эти результаты
отмечаются отдельно после фактической проверки. Миграция данных и рассылка
команде в рамках локальных проверок не запускаются.

EN: Each item has a separate commit/push and appropriate isolated checks. Live
DNS/TLS, Google consent, Ubuntu activation/rollback, real file transfers,
scheduled delivery and physical devices remain explicit acceptance steps.
Secrets are excluded from source control and all test evidence.

P13 evidence: [2026-11-12-markdown-prelaunch.json](audits/2026-11-12-markdown-prelaunch.json). Opening preview is explicitly partial until full formatting completes; source, search index and history are never truncated.
