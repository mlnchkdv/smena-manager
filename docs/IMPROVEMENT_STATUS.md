# Improvement status / Статус улучшений

This checklist records the 14-point hardening pass from October 2026. Code changes are pushed to `main`; production-only checks remain explicitly marked.

Этот список фиксирует 14-пунктовый этап улучшений за октябрь 2026 года. Изменения кода отправлены в `main`; проверки, которые требуют production-аккаунта, отмечены отдельно.

| # | Area / Область | Result / Результат |
|---:|---|---|
| 1 | Production ACL isolation | Server-side project/file/comment/notification/graph projections and direct API checks are covered by tests; production two-account drill is read-only and documented. |
| 2 | Backup/restore and attachments | Restore remains atomic; partial recovery uploads are deleted on failure; corruption and empty-destination checks are covered. |
| 3 | Cron observability | Readiness now reports cron health and the next daily 04:00 UTC execution; HTTP 200 is not treated as proof of a successful run. |
| 4 | Google OAuth/Gmail | Minimum scopes, token storage, rotation and revocation procedures are documented; provider status remains visible to administrators. |
| 5 | Storage capacity | Workspace status exposes bytes, warning threshold, percentage and `ok`/`warning`/`over-limit` state. |
| 6 | Synchronization | Revision polling supports conditional ETag requests, avoiding unchanged workspace payloads. |
| 7 | Frontend performance | The initial bundle has a 600 KiB build budget; graph and PDF remain lazy-loaded. |
| 8 | CI/E2E | CI runs the isolated Russian/English matrix across Chromium, Firefox and WebKit with per-run data and ports. |
| 9 | Graph scale | Graph responses expose visible totals, edge totals, limit and truncation state; layout and 10k-node regressions are tested. |
| 10 | File reliability | Range suffix, invalid range, resumable upload and safe preview paths are covered by server tests. |
| 11 | Maintainability | Task-key allocation is extracted from the monolithic actions module; further domain extraction can continue without behavior changes. |
| 12 | Schema migrations | Ordered pure migration registry is used before validation and rejects missing steps. |
| 13 | Notification audit | Delivery totals/cron history are persisted; diagnostic test cooldown is claimed atomically across workers. |
| 14 | Accessibility/responsive | WCAG routes, RU/EN flows, mobile sizes and 200% zoom settings are exercised in E2E. |

## Remaining production evidence / Недостающие production-артефакты

The following cannot be proven by a local build: a fresh Vercel cron execution and automatic backup, a two-account ACL drill against current team data, Gmail token revocation/rotation, and a real slow-network large-file transfer. Run `docs/PRODUCTION_ACCEPTANCE.md` during an approved maintenance window and attach redacted request IDs only.

Локальная сборка не доказывает свежий Vercel cron и automatic backup, двухаккаунтную проверку ACL на текущих данных команды, отзыв/ротацию Gmail-токена и реальную передачу большого файла по медленной сети. Выполняйте `docs/PRODUCTION_ACCEPTANCE.md` в согласованное окно и прикладывайте только замаскированные request ID.
