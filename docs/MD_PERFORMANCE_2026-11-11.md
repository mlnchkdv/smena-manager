# Large Markdown performance / Производительность больших Markdown

Date / Дата: 2026-11-11. Code baseline: `327848e`; performance profile code: `6aa1085`; final scroll correction: `92f7811`.

## Русский

Выполнены пять отдельных правок, каждая закоммичена и отправлена в main:

1. `fb62710` — извлечение первого абзаца прекращается после первого подходящего блока; таблицы разбираются без повторного разбиения всего оставшегося документа на строки.
2. `b9b8fe9` — закрытая история и закрытые версии не форматируют содержимое. Предпросмотр открытой версии начинается с 24 000 символов и расширяется кнопкой до 100 000. Скачивание и восстановление используют полный исходник.
3. `38d00cc` — контекст поиска нормализует Markdown однократно; карточка не вычисляет неиспользуемое описание. Если краткое описание уже содержит все слова запроса, тело не читается ради более слабого совпадения.
4. `6aa1085` — подсветка создаётся в безопасных текстовых узлах уже открытого документа порциями по кадрам. Переходы между совпадениями сохраняют DOM документа. Большие текстовые представления разбиваются на блоки по границам строк; исходный текст сохраняется полностью.
5. `92f7811` — переход к далёкому совпадению ограниченно корректируется после перерасчёта высот блоков. Ручной ввод отменяет отложенную коррекцию.

### Методика и результаты

Изолированная Local-фикстура, Node 22, Windows WebKit, сборка Vite с тестовым входом. Два синтетических MD: обычный форматированный документ 1 852 648 байт с frontmatter и сложный документ 1 891 837 байт с существующим защитным текстовым режимом. Ни Google Drive, ни материалы команды не использовались.

Таблица производительности относится к `6aa1085`; последующая правка прокрутки проверена отдельно на итоговой сборке. Замеры до/после сделаны на одинаковых документах и сценариях без одновременной сборки или тяжёлых тестов. Это единичные локальные прогоны, а не SLA или статистически устойчивый benchmark. «Открытие» включает запрос тела, подготовку и появление текста; запуск приложения исключён. Поиск включает debounce, API и построение контекста. История включает получение и раскрытие конкретной версии. Новое раскрытие истории сначала показывает 24 000 символов вместо прежних 100 000.

| MD / состояние         |   Поиск, мс | Открытие, мс |  Версия, мс | Подсветка, мс |
| ---------------------- | ----------: | -----------: | ----------: | ------------: |
| rich · RU · 390 px     | 4748 → 2048 | 15426 → 6769 | 3789 → 1454 |    1328 → 633 |
| rich · EN · 1366 px    | 3270 → 2102 |   2803 → 640 |    150 → 44 |    1493 → 653 |
| complex · RU · 390 px  | 6268 → 2505 | 20109 → 7173 |  4568 → 981 |    3586 → 618 |
| complex · EN · 1366 px | 3770 → 2062 |   2705 → 608 |    281 → 35 |    3159 → 509 |

Тёплое открытие в итоговой матрице: 0,61–0,89 с; первое раскрытие версии: 0,98–1,45 с, повторное: 0,035–0,054 с. Поиск по концу документа: 2,05–2,51 с. Первый показ большого документа всё ещё занимает 6,8–7,2 с; дальнейшая работа должна раздельно измерять чтение тела, передачу/десериализацию токенов и вставку DOM. Максимальные паузы UI остаются заметными; мгновенным интерфейс пока считать нельзя.

Предварительная попытка подсветки только на существующем DOM выявила повторный расчёт одного гигантского PRE. Итоговое разбиение текстового режима устранило эту регрессию; промежуточный вариант не использован как успешный результат.

### Проверки

- Итоговая проверка на `92f7811`: lint, дизайн-токены, 983 серверных/общих теста, сборка и бюджет — успешно; исходники стабильны в течение проверки. Начальный JavaScript: 594.6 / 600 КиБ.
- Матрица: RU/EN × 390×844 и 1366×768 × два MD; функционально дополнительно RU/EN × 320×567 и 844×390.
- На итоговой правке отдельно проверены видимость последнего совпадения после перерасчёта высоты, снятие подсветки и запрос без текстовых слов (`type:note`).
- Лимит 300 совпадений, переходы по кругу, сохранение DOM при свойствах заметки, точный текст после снятия подсветки, «Показать ещё», закрытие/раскрытие версии клавишей Enter — успешно.
- API-поиск после отдельного перезапуска процесса измерен отдельно от UI; это не сравнение до/после и не холодный дисковый кэш.

Текст в редакторе и полной версии сверялся по SHA-256. Проверены frontmatter, безопасное экранирование HTML, Unicode, пробелы и длинная неразрывная строка. В матрице открытия для каждого документа был один запрос тела и одной версии; последующие сценарии использовали кэш.

Оригинальные тела и описания двух синтетических заметок восстановлены и сверены по SHA-256; заметки возвращены в локальную корзину. Активных заметок снова 178. В итоговой фикстуре возвращён русский язык.

Production, Google OAuth/Drive и настоящие телефоны в этой проверке не принимались. Сайт по условиям задачи недоступен; Vercel 402 зафиксирован в предыдущем отчёте. Viewport WebKit не подтверждает поведение реального iPhone, клавиатуры или восстановления после блокировки экрана.

## English

Five separately committed and pushed changes reduce repeated full-source scans, defer closed history/version rendering, normalize search excerpts once, and highlight the retained sanitized reader incrementally. Next/previous match navigation keeps the reader DOM. A bounded, cancellable scroll correction keeps distant matches visible as content-visibility replaces estimated block heights. Large literal text is split at line boundaries for layout; the complete source text is preserved. Version preview begins at 24,000 characters and expands to 100,000; complete download and restore remain available.

The table above compares identical synthetic notes in isolated Local storage on Windows WebKit. These are descriptive single-run measurements, not a performance SLA. Application bootstrap is excluded. Search includes debounce/API/snippet rendering; history includes fetching and expanding one version, with a smaller progressive initial preview. Warm reader opening was 0.61–0.89 s. First opening still took 6.8–7.2 s and needs further profiling of body reads, token transfer and DOM insertion. Do not infer production or physical-device acceptance.

Validation covers Russian/English at 390×844 and 1366×768, with additional functional checks at 320×567 and 844×390: retained reader identity, 300-match cap and wraparound, exact text after clearing highlights, progressive version preview, lazy collapsed content and keyboard reopening. Source and version hashes were preserved. Final build and test evidence, including limitations, are in the adjacent JSON report. Only the two synthetic local notes were used; cleanup restored their original content/summary and returned them to trash.

Evidence / Данные: [2026-11-11-md-performance.json](audits/2026-11-11-md-performance.json).
