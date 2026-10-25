# Внедрение 18 UI/UX-улучшений / Delivery of 18 UI/UX improvements

Дата / Date: 26 October 2026. Source: [audit](UI_UX_AUDIT_2026-10-25.md).

## Изменения / Changes

Нумерация соответствует аудиту. Каждый основной пункт реализован отдельным коммитом и отправлен в `main`; найденные при приёмке дефекты исправляются дополнительными коммитами. Пункт 7 выполнен раньше пункта 6: lazy-overlay bridge потребовался для дальнейшей проверки первого открытия диалогов.

Numbers follow the audit. Each main change has its own commit pushed to `main`; acceptance findings have follow-up commits. Item 7 was delivered ahead of item 6 because later tests depend on the lazy overlay bridge.

| №   | RU: результат                                                                                                                                 | EN: delivered behavior                                                                                                                        | Основной коммит / Main commit |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | Файлы раньше вторичных панелей; статистика, сохранённые фильтры и пассивные экспорты в «Деталях». Активные ошибки/передачи остаются видимыми. | Content-first files; statistics, saved filters and passive exports disclosed in Details, without hiding active failures/transfers.            | `fbb9a6b`                     |
| 2   | Панель папок базы знаний адаптируется по доступной ширине с учётом глобальной навигации, включая планшет.                                     | Knowledge folders adapt to usable width, including the global sidebar, rather than only phone breakpoints.                                    | `5527fbb`                     |
| 3   | Компактные мобильные папки в общей сетке; сохранены оба режима и пользовательский выбор.                                                      | Compact mobile mixed-folder cards; both modes and the user's mode preference remain available.                                                | `c1188de`                     |
| 4   | Закрытая мобильная навигация исключена из фокуса; открытая изолирует фон, закрывается Escape и возвращает фокус.                              | Closed mobile navigation is inert; open navigation isolates its background, supports Escape and restores focus.                               | `2186965`                     |
| 5   | Исторические системные причины отказов локализуются при отображении; пользовательские комментарии не переводятся.                             | Known historical system delivery issues are localized at display time; user-authored content is untouched.                                    | `2d76ac9`                     |
| 6   | Безопасная отсрочка обновления и восстановление маршрута, папки, фильтра и фокуса в пределах того же аккаунта/пространства.                   | Safe upgrade deferral and scoped route/folder/filter/focus restoration within the same account/workspace.                                     | `5c97467`                     |
| 7   | Тяжёлые overlay-renderers загружаются по запросу; loading/error/retry и проверка текущего владельца. Лимит начального JS не повышен.          | Overlay renderers load on demand with loading/error/retry and current-owner guards; initial-JS budget unchanged.                              | `7551a77`                     |
| 8   | Общие отступы коллекций, карточки, размеры диалогов и уровни контекстных панелей.                                                             | Shared collection spacing, cards, dialog sizing and contextual toolbar layers.                                                                | `9839cf3`                     |
| 9   | Основные мобильные hit-area 40–44 px; вторичные действия закладок сгруппированы в меню.                                                       | Larger primary mobile targets; secondary bookmark actions grouped in a menu.                                                                  | `e8df62d`                     |
| 10  | Явное расширение поиска из папки; загрузка каталога не выдаётся за окончательный нулевой результат; чтение согласовано с записью настроек.    | Explicit folder-to-workspace search; pending catalog reads do not look like final zero results; preference writes are coordinated with reads. | `0de9e18`                     |
| 11  | Контекстная панель массового выбора, счётчик за пределами страницы, явный сброс и компактное раскрытие ограничений.                           | Contextual batch bar with off-page counts, explicit clear and disclosed limits.                                                               | `ce6b3b3`                     |
| 12  | Изоляция фона предпросмотра, сохранение прокрутки файла, ограниченная длина строки заметки и локальный overflow MD.                           | Isolated preview background, file scroll retention, bounded note reading width and local Markdown overflow.                                   | `50efdb7`                     |
| 13  | Единый компактный блок файловых операций, пассивная история экспортов и сохраняемая ошибка загрузки истории.                                  | Consolidated file operations, disclosed passive export history and persistent history-load errors.                                            | `18162ec`                     |
| 14  | Сгруппированный мобильный выбор раздела настроек вместо длинной ленты; сохранены прямые URL и права.                                          | Grouped native mobile settings picker instead of a long tab strip; deep links and permissions retained.                                       | `f8a26c3`                     |
| 15  | Адаптивное соотношение колонок входящих и раскрываемые повторы системных событий без скрытия непрочитанных.                                   | Adaptive inbox columns and disclosed repeated system history without hiding unread events.                                                    | `0c67f87`                     |
| 16  | Читаемые подписи графа, более заметные связи и кнопка приближения выбранного окружения; список сохранён.                                      | More readable graph labels/edges and keyboard-operable connection focus; list alternative retained.                                           | `027175c`                     |
| 17  | Контраст метаданных в обеих темах и видимые границы/фокус в forced colors.                                                                    | Improved metadata contrast across themes and explicit forced-color borders/focus.                                                             | `1eaae16`                     |
| 18  | Расширенная матрица пяти размеров, RU/EN и обеих тем; axe, accessible-name/focus assertions, снимки и отдельная команда `check:ui`.           | Five-size RU/EN light/dark matrix with axe, accessible-name/focus assertions, screenshots and `check:ui`.                                     | `1b6bb53`                     |

Дополнительные исправления / Follow-ups: восстановление upgrade-context после инициализации настроек (`676df33`), устойчивое раскрытие файловых деталей (`989951d`, `cfb44f5`), доступное имя создания папки (`24dfe51`), сохранение клика Safari при blur редактора (`a5f9b18`), компактная мобильная шапка (`a950eaa`, `4a430f0`, `beca5d2`), семантика поиска и reflow при масштабе (`2a22b2e`), очистка запроса Escape (`f588822`), отсутствие неработающего zoom-действия в списке графа (`ab30fde`), отдельные строки всех непрочитанных событий (`a79ff76`), единая десктопная строка заголовка/действий (`7299fb0`).

## Приёмка / Acceptance

- **467/467** server/shared tests passed; lint, format and build passed. The build keeps the existing 600 KiB initial-JS budget, with **510.6 KiB** used (about 15% headroom). Vite still emits its separate 500 kB chunk-size advisory. / Серверные проверки, lint, format и build пройдены; бюджет не увеличен, предупреждение Vite о размере отдельного chunk не скрыто.
- **12/12 existing functional workflows** passed serially in Chromium/Firefox/WebKit: core persistence, mobile folder upload/move/reload/archive, Unicode/duplicate ZIP and recursive folder filters. The Safari editor click repeat passed after `a5f9b18`. / Все 12 повторных функциональных сценариев прошли; проверки не удалялись ради успешного результата.
- The final axe suite passed **2/2**, covering desktop routes/dialogs, RU/EN mobile collections in both themes, CSS zoom 200% and forced-color focus/borders. / Финальный axe-прогон и проверки масштаба/forced colors пройдены.
- The expanded matrix passed **15/15**: 35 Russian routes × five viewports × three engines (**525 route/viewport/engine checks**), plus RU/EN × light/dark × five collection/settings routes in each case (**300 collection snapshots**). It checks real accessible search names, heading geometry, query Escape/focus, selected settings section and task save/reload. / Матрица проверяет не только overflow, но и семантику, геометрию и сохранение.
- The final knowledge workflow passed **1/1** in Chromium: reading/editing Markdown metadata, save/reload, version restoration, both folder modes, mobile import preview, anchored selection, movement, 3,000 notes and 550 folders, RU/EN at 320 px. The latest desktop-header responsive case also passed. / Полный сценарий базы знаний и отдельный повтор последней десктопной компоновки пройдены. After the broad matrix, delayed selection reflow was corrected in `98144bf` and rechecked by the complete knowledge workflow, not by deleting its geometry assertion.
- Synthetic graph layout benchmark: 250 nodes, 1,000 edges, 100 warmed Node runs — median **1.09 ms**, p95 **2.96 ms**, sampled heap growth before GC **1.22 MB**, retained delta after GC **15 KB** on this host. This measures the pure layout, not browser render FPS or peak renderer memory. / Синтетический замер layout не выдаётся за измерение частоты кадров или пиковой памяти браузера.

### Production

Целевые проверки обычного авторизованного интерфейса выполнены на 1440, 1024, 390 и 320 CSS px, с переключением RU/EN и light/dark; это не полный cross-product production-комбинаций. Прочитаны существующие файлы и заметки; проверены оба режима папок, быстрый просмотр, поиск/сброс, мобильная навигация, picker настроек, список/полотно графа и входящие. Переключения языка/темы сохраняются после reload; исходные RU/light и общий режим папок возвращены. Выбор файлов снят. Содержимое команды, права и статусы прочтения уведомлений не менялись.

Targeted authenticated production checks used 1440, 1024, 390 and 320 CSS px with RU/EN and light/dark; not every production combination was repeated. Existing files/notes were read; both folder modes, quick reading, query/clear, mobile navigation, settings picker, graph list/canvas and inbox were inspected. Language/theme and session survived reload. Original RU/light and mixed folders were restored; file selection was cleared. Team content, permissions and notification read status were not edited.

| Метрика / Metric                                          | Аудит / Baseline | После / After |
| --------------------------------------------------------- | ---------------- | ------------- |
| Files, RU, 390 px: first file top                         | ≈1017 px         | ≈498 px       |
| Files, RU, 1440 px: first file top                        | ≈824 px          | ≈479 px       |
| Knowledge, RU, 390 px: first note top, three root folders | ≈800 px          | ≈628 px       |
| Knowledge, RU, 1024 px: grid width                        | ≈380 px          | ≈714 px       |

Это измерения на реальном небольшом наборе команды, а не универсальные гарантии при любых фильтрах и числе объектов. На десктопе ориентир первого ряда до 360 px остаётся более строгой целью, чем достигнутая компоновка с раскрытыми папками. / These measurements use the team's small current dataset, not arbitrary-query guarantees. The proposed desktop first-row target of 360 px remains stricter than the delivered expanded-folder layout.

Реальный переход между двумя production-сборками сохранил маршрут, поисковый запрос и сессию. Отложенный переход в ещё не загруженный старый модуль при следующем deployment потребовал штатного обновления; после него раздел открылся. Это подтверждает fallback, но не удержание старых chunks на CDN. / An actual two-build production upgrade preserved route, query and session. A later deferred navigation to an unavailable old module required the explained safe update, then opened successfully; this proves the fallback, not old-chunk retention.

Неуспешные диагностические прогоны сохранены отдельно: старый корневой breadcrumb больше не виден в корне, поэтому тест теперь сначала действительно входит в папку; одно падение Firefox было browser-process failure при параллельной тяжёлой записи. Итоговый последовательный функциональный повтор — 12/12. / Failed diagnostic runs remain separate: the old test clicked a now-hidden root-only breadcrumb, so it now enters the folder before testing its return; one Firefox run lost its browser process under concurrent capture pressure. The serial functional repeat passed 12/12.

В bounded runtime-запросе `level:error` за **26 октября 00:32:32–00:52:32 Europe/Saratov** получено **0 записей**, `hasMore=false`, без исключённых интервалов. Это окно запроса, не гарантия uptime и не повторный тест доставки исторических уведомлений. / The bounded production runtime error query returned zero records for that window, not an uptime or delivery guarantee.

## Границы / Limits

Production follow-up for `98144bf`: on RU/320 px with an open folder menu, selecting the last note moved its measured top from **475.21 to 474.22 px** (less than 1 px). Selection was then cleared and the menu closed; the original viewport, RU/light and file page were restored. The application deployment `dpl_Cw9xHob6tDLhZJ21VbS1FeagrT4V` was Ready at **26 October 01:17:41 Europe/Saratov**. / Исправление выбора дополнительно проверено на основном сайте без перемещения или редактирования заметок; служебное выделение снято.

- Мобильные размеры браузера не подтверждают фоновые передачи на физических iOS/Android. Три ранее оставленных TXT и готовый экспорт сохранены для ручной проверки пользователя. / Browser resizing is not physical iOS/Android background-transfer acceptance; retained fixtures and export remain available.
- Настройки платного удержания старых Vercel chunks не менялись. При недоступном старом chunk остаётся объяснённое безопасное обновление, а не смешивание несовместимых сборок. / No paid Vercel old-chunk retention was configured; safe explained upgrade remains the fallback.
- Снимки и геометрические проверки не являются pixel-diff baseline и не заменяют ручную оценку дизайна. Axe не является полной сертификацией WCAG. / Screenshots and geometry checks are not pixel-diff baselines; axe is not complete WCAG certification.
- Не создавались тысячи production-материалов ради теста графа/каталога; нагрузочные наборы изолированы локально. / Large synthetic graph/catalog fixtures remain local, not team production data.
- Никаких production-рассылок, cron, восстановления, изменения прав или содержимого команды для этого этапа не запускалось. Разрешены только штатное чтение и обратимые настройки интерфейса. / No production deliveries, cron, restore, ACL or team-content edits were run for this stage; production checks use normal read-only UI and reversible UI preferences.
- Это UI/UX-проход, а не устранение всех архитектурных ограничений Drive root/manifest и холодного backup из исходного аудита. / This UI/UX pass does not remove the original audit's architectural Drive root/manifest and cold-backup limits.

## Повторение / Reproduction

```bash
npx playwright install chromium firefox webkit # once, after npm install
npm run test:server
npm run lint
npm run format:check
npm run build
npm run check:ui
npx playwright test tests/e2e/accessibility.spec.js --project=chromium
npx playwright test tests/e2e/knowledge-workflows.spec.js --project=chromium
```

`check:ui` использует изолированное локальное хранилище и тестовые профили, не production OAuth/Drive. Скриншоты/журналы в `output/` и `.data/e2e/` игнорируются Git. Запускать браузерные наборы последовательно на малопамятном хосте. / `check:ui` uses isolated local storage and fake profiles, not production OAuth/Drive; artifacts are gitignored. Run browser suites serially on memory-constrained hosts.
