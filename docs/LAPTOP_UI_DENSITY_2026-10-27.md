# Laptop interface density — 27 October 2026

## Request and findings

The five supplied screenshots showed Files, Inbox, Notifications, Bookmarks and
Home on a laptop. Large controls consumed vertical space before useful content.
The coarse-pointer media query applied phone-sized controls even at desktop
widths. Inbox tabs could scroll vertically, and bookmark cards reserved space for
empty metadata and stretched to the tallest adjacent card. Short bookmark
descriptions also offered an unnecessary expansion control.

## Delivered changes

1. **9697626 — Adaptive control minimums.** Shared tokens set 32 px minimums in
   the coarse-pointer rules above 900 CSS px, with normal desktop form text.
   Layouts up to 900 px retain 44 px targets and 16 px form text where the touch
   rules apply. Fine-pointer controls keep their existing 30 px baseline.
   Large buttons and text areas retain their appropriate component sizing.
2. **b6edaa3 — Inbox and notification rows.** The heading and category strip no
   longer shrink within the flex column. Category labels retain their widths,
   scroll horizontally and remain reachable with keyboard focus. Vertical
   overflow is disabled in that strip. Desktop notification rows use less padding.
3. **7d21a42 — Bookmark content density.** Cards size independently, without
   reserved description/tag rows. The expansion control appears only when the
   rendered excerpt is actually clipped. A ResizeObserver updates that decision
   as wrapping changes; opening and closing the full description still works.
4. **4178135 — File catalog density.** Desktop text-file tiles use a smaller type
   icon, tighter header and footer, and a 32 px selection control. Pagination,
   batch-operation and folder buttons use the shared adaptive minimum. Mobile
   file selection remains 44 px.
5. **7aff32b — Home and notification layout.** The empty personal-task panel uses
   a compact horizontal arrangement on desktop. Page starts and summary spacing
   are tighter. Notification filters and bulk actions share an aligned toolbar.
   Two missing Russian strings in the overdue empty state were translated.

These changes do not alter file storage, project permissions, authentication,
notification delivery, or team content.

## Validation

- Production was checked through the authenticated interface at
  `https://smena-manager.vercel.app/`, with Russian and English navigation.
  Home, Inbox, Notifications, Bookmarks and Files were inspected. Language was
  returned to Russian; no notification was marked read or cleared by the audit.
- Production checks covered 390, 1280 and 1600 CSS px across those routes.
  Local targeted checks covered 320, 390, 1024, 1280 and 1600 px in both languages,
  including a coarse-pointer browser context.
- At 1280 px before the changes, production file controls measured about 44 px
  and the first file row started at y=403. After the catalog changes, its first
  row started at y=364 and text-file cards measured about 108 px. At 1600 px,
  upload measured 32 px. Mobile file selection measured 44 px at 390 px.
- The production desktop Home empty-state body measured about 77 px in Russian
  and 71 px in English; its mobile version retained the stacked arrangement.
- Inbox category strips had no vertical overflow. Local keyboard checks brought
  the final category fully into view at all tested widths in both languages.
- Local bookmark checks covered empty, short and long descriptions, viewport
  changes, expansion and collapse. Short descriptions hid the expansion control;
  clipped descriptions retained it. Cards did not stretch to match their peers.
- `npm run check:ui`: **15 passed**, five responsive cases in each of Chromium,
  Firefox and WebKit.
- `npm run check:ergonomics`: **360 passed**, Russian/English, light/dark,
  comfortable/compact, against the isolated local fixture.
- ESLint, Prettier, CSS token validation and production build passed. Initial
  JavaScript remained within the 600 KiB budget (about 583.4 KiB at the build check).

## Evidence and limits

Additional local measurements/scripts and screenshots are in the ignored
`output/playwright/laptop-*` files. Production DOM measurements were saved in
`output/playwright/laptop-production-metrics.json`; entries captured during
catalog/module loading are intermediate observations, not empty-data assertions.
Later observations confirmed all three production files had loaded.

The in-app browser temporarily stopped responding during navigation. Rebinding
after a browser-control reset allowed the production checks to continue. Its
screenshot endpoint reported `Unable to capture screenshot`; the preview images
for this delivery therefore use the explicitly identified local Layout QA fixture.
The temporary viewport override was reset through the browser capability.

These are browser viewport and engine checks, not hands-on testing of physical
phones or the user's laptop display scaling. Team data was not changed.
