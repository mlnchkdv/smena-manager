# Whiteboard edge resizing / Размер карточек за края

**Delivered / Опубликовано:** 4 November 2026, application commit `6acf0517dbe88b047092101ff1f2cafb8723fd38`. Production `app-version.json` confirmed this version. No schema migration or new service is required.

## Использование

1. Выберите карточку или рамку за её заголовок. В режиме холста появляются восемь маркеров: четыре края и четыре угла. В списке маркеров нет.
2. Потяните край для изменения одной стороны или угол для изменения двух сторон. Во время жеста показываются размеры, а связи следуют за границами карточки.
3. Отпустите мышь для сохранения. Escape или отмена указателя возвращает исходную геометрию. Один жест — одна операция истории; Ctrl/Cmd + Z отменяет, Ctrl/Cmd + Shift + Z повторяет.
4. С клавиатурой перейдите на нижний правый маркер и используйте стрелки: шаг 10, с Shift — 50 единиц холста. Редактор по-прежнему содержит числовые поля «Размер и положение».

Размер рамки меняется без перемещения или масштабирования вложенных карточек. Минимум карточки — 160×100, максимум — 2000×2000. Противоположный край остаётся на месте; шаг мыши — 10 единиц, с учётом текущего масштаба камеры. Изменения доступны только при соответствующих правах и отсутствии конфликта синхронизации.

## Usage

Select a card or frame by its title, then drag one of its four edges or four corners in Canvas mode. Dimensions appear during the gesture and connectors track the preview. Releasing commits one history operation. Escape/pointer cancellation restores the original geometry. Ctrl/Cmd + Z undoes; Ctrl/Cmd + Shift + Z redoes.

The bottom-right handle is a keyboard tab stop: arrows resize by 10 canvas units, Shift + arrows by 50. Numeric Size and position fields remain available. Resizing a frame does not move or scale its contents. Width is limited to 160–2000 and height to 100–2000; the opposite edge stays anchored. Pointer deltas account for camera zoom and snap to 10 units.

## Integrity and implementation / Целостность и реализация

- `src/shared/whiteboard-resize.js`: pure geometry, anchoring, snapping and coordinate/size limits.
- `src/features/project-whiteboard.js`: DOM-only gesture preview followed by `whiteboardCommand`, permission/conflict guard, workspace scope and original-node comparison. A changed or removed target cancels instead of overwriting a concurrent edit. No pointer-move writes.
- `src/views/project-whiteboard.js`: handles only for the primary selected editable node in Canvas; localized accessible names and instructions, one keyboard resize stop.
- `src/styles/views/project-whiteboard.css`: selected-only affordances, directional cursors and a temporary size label.
- `tests/server/whiteboard-resize.test.js`: eight directions, off-grid sizes, opposite anchors, coordinate and size boundaries, zoom-converted deltas and invalid input.

## Verification / Проверка

**Local synthetic workspace, no cloud credentials:** mouse drag changed 270×180 to 350×230; Undo returned 270×180; Redo returned 350×230; reload retained 350×230. Keyboard resize changed frame width 650→700 while both contained cards kept their coordinates and dimensions. A prior ArrowRight changed card width 260→270.

**Production, read-only content inspection:** eight localized resize controls appeared after selecting an existing board card on EN 320 px; Outline had zero resize controls. RU mobile follow-up and measured handle geometry are recorded in the current audit. Existing team card geometry was not modified. This does not constitute a new Google Drive write/reload acceptance test for resizing.

**Automated:** 645/645 server/shared tests pass; focused whiteboard suite 12/12; ESLint, UI token check and production build pass. Initial JavaScript remains 582.0 KiB / 600 KiB. Existing large-chunk and mixed static/dynamic import warnings remain.

Physical touch, pointer cancellation on actual phones, virtual keyboards and screen-reader operation remain unverified. See the [new audit](UI_UX_DEEP_REAUDIT_AFTER_Z_2026-11-04.md), especially AA08, for a follow-up on resize hit areas at small zoom levels. A browser viewport is not a real-device acceptance test.
