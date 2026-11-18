# Browser archive capture

The bookmark viewer offers Fast HTML and Browser capture. Both produce a scriptless HTML document with embedded CSS, images and fonts. Browser capture first renders public content in a fresh Chromium context at 1280 × 900 and stores a JPEG cover inside the integrity-checked snapshot. It does not sign in to third-party sites or inherit any user cookies.

Each capture uses a separate child process with a minimal environment (no application credentials), a 40-second deadline, one concurrent browser, 120 requests and a 12 MiB network budget. Every GET is fulfilled by the existing DNS-pinned public-resource broker, including redirects. Private IPs, non-HTTP URLs, POSTs, service workers, web sockets, downloads and embedded frames are blocked. Chromium uses its sandbox on Linux; an unavailable sandbox fails capture instead of disabling it. A dead proxy also prevents unhandled browser network requests from connecting directly.

VPS provisioning: run `sudo bash deploy/vps/install-capture.sh`, set `PLAYWRIGHT_BROWSERS_PATH=/var/cache/smena-capture` in `/etc/smena-manager/smena.env`, then restart the application. Keep the Chromium installation version aligned with the pinned Playwright dependency after upgrades. The ordinary fast mode does not require Chromium.

Local synthetic verification: `SMENA_TEST_RENDER=1 node --test tests/server/bookmark-render.test.js`. The test renders an in-memory public fixture through the same worker and broker protocol. It does not access team documents or a third-party account.

Limits: no authenticated content, video playback, canvas serialization, infinite scrolling or page-specific interactions are promised. The capture records the visible page after network settling; incomplete external resources remain visible in the report. The original website is not contacted when opening a saved copy.

Implementation references: [Playwright request routing and service-worker limitations](https://playwright.dev/docs/api/class-browsercontext#browser-context-route), [Chromium sandbox guidance](https://playwright.dev/docs/docker).
