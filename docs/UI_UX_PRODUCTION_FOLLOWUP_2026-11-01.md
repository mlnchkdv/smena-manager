# Три финальные правки: production / Final production follow-up

## Подтверждённый результат / Verified result

**1 ноября 2026.** Все три ранее отложенные правки опубликованы на [основном сайте](https://smena-manager.vercel.app/) и проверены в авторизованном интерфейсе на русском и английском. Дополнительные изменения кода не понадобились.

**1 November 2026.** All three previously pending changes are live and verified in the authenticated production UI in Russian and English. No further runtime changes were necessary.

Production version: `2d1bc88047b9dfa3bccf9851806b7b77fd0fa399`.

- `/app-version.json` shows that exact version.
- Vercel deployment `dpl_3xvVcjjvzFN13tvEF68w4WoXWyC6` is `READY`, target `production`, with the primary domain assigned.
- Git confirms that the deployed commit includes `e825ec7`, `e01ebf1` and `f7a83f0`.
- Git integration had already completed publication after the earlier rejected manual deployment. No redundant deployment, billing change or new scheduled retry was required. This verifies the required release; it does not assert that every provider quota is now unrestricted.

## Проверки / Checks

| Правка / Change                                   | Проверка и результат / Verification and result                                                                                                                                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e825ec7` — панель совпадений / match controls    | В длинной существующей заметке выполнены переходы к последнему совпадению `11/11`, затем Next/Previous. Панель имеет `position: sticky`, остаётся внутри области reader; кнопки доступны для нажатия. / Controls stay within the reader after jumps to the last match.           |
| `e01ebf1` — действия холста / selection actions   | В Canvas и Outline выделялась существующая карточка без редактирования. Нижняя граница панели совпадает с верхом мобильной навигации, кнопки не перекрыты. / Canvas and Outline selection actions remain above the mobile navigation.                                            |
| `f7a83f0` — пользовательский текст / user content | На главной, в обзоре и списке задач проверены три названия проектов и двенадцать ключей задач. У нужных элементов есть `translate="no"`, значения RU/EN совпадают. / Project names and task identifiers are protected from UI translation and remain unchanged across languages. |

Проверены семь размеров CSS viewport: **320×740, 390×845, 767×1024, 1024×767, 844×390, 1366×767, 1920×1080**. Браузерный масштаб даёт дробные координаты; при проверке границ использован допуск 1px.

Seven CSS viewport sizes were checked, including narrow phones and short landscape. Fractional geometry from browser scaling uses a 1px boundary tolerance.

- **42 sticky-panel cases:** 2 languages × 7 sizes × reader / Canvas selection / Outline selection.
- **42 content-protection cases:** 2 languages × 7 sizes × home / overview / task list.
- **84/84 passed**: no page overflow above 1px; all checked action-button centers hit their intended controls; find controls remain within the reader; selection panels remain within the viewport and above visible bottom navigation; all protected text is unchanged between languages.
- На RU 320px нижняя граница панели выделения и верх меню — **668.53px**; на RU 390px — **788.39px**. В английском варианте соответствующие границы — **683.39px** и **788.39px**. Различие высоты нижнего меню между языками учитывается автоматически.
- Raw matrices, screenshots and the machine-readable summary are retained locally under `output/n24-published/`, outside Git because they contain production content.

## Сохранность и ограничения / Preservation and limits

Материалы команды, карточки, права и данные проектов не изменялись. Для проверки временно менялись язык, режим списка задач и выделение карточки. В конце возвращены **русский язык**, исходный режим задач **Table**, холст без выделения и обычный размер браузера. Штатное состояние синхронизации проверено перед завершением.

Team materials, cards, access rules and project data were not edited. Russian, the original task Table view, cleared board selection and the default browser viewport were restored. The normal saved status was checked before finishing.

Это свежая проверка production во встроенном браузере. Физические iOS/Android, системная клавиатура, жесты и screen lock не проверялись; браузерные размеры их не заменяют. Результаты предыдущих локальных Chromium/Firefox/WebKit тестов приведены в [отчёте N01–N24](UI_UX_DELIVERY_2026-11-01_TWENTY_FOUR.md), они не объявляются заново выполненными здесь.

This is a fresh production check in the in-app browser. Physical iOS/Android, software keyboards, gestures and screen lock remain outside this verification. Earlier isolated browser-engine results are historical, not claimed as rerun here.
