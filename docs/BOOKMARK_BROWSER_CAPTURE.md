# Browser archive capture

The bookmark viewer offers Fast HTML and Browser capture. Both produce a scriptless HTML document with embedded CSS, images and fonts. Browser capture first renders public content in a fresh Chromium context at 1280 × 900 and stores a JPEG cover inside the integrity-checked snapshot. It does not sign in to third-party sites or inherit any user cookies.

Each capture uses a separate child process with a minimal environment (no application credentials), a 40-second deadline, one concurrent browser, 120 requests and a 12 MiB network budget. Every GET is fulfilled by the existing DNS-pinned public-resource broker, including redirects. Private IPs, non-HTTP URLs, POSTs, service workers, web sockets, downloads and embedded frames are blocked. Chromium uses its sandbox on Linux; an unavailable sandbox fails capture instead of disabling it. A dead proxy also prevents unhandled browser network requests from connecting directly.

Managed VPS deployments provision the pinned Chromium version before switching the live release. Linux dependencies are installed by the trusted root deployment; browser downloads run as `smena-build` in `/var/cache/smena-capture`, outside private application data. Installed binaries become root-owned and read-only. On Ubuntu 24.04, executable-specific AppArmor profiles permit creation of the Chromium sandbox without disabling the global user-namespace restriction. A synthetic capture runs as `smena` with the service restrictions before activation; failure leaves the current release running. Application startup never installs packages or downloads a browser.

For repair of an already managed current release, run `sudo bash deploy/vps/install-capture.sh`. It uses the same provisioning and readiness check as CI. The renderer uses `/var/cache/smena-capture` by default, so no protected environment edit is needed. An explicit `PLAYWRIGHT_BROWSERS_PATH` override must point to a compatible, readable installation. Fast HTML does not require Chromium.

Local synthetic verification: `SMENA_TEST_RENDER=1 node --test tests/server/bookmark-render.test.js`. The test renders an in-memory public fixture through the same worker and broker protocol. It does not access team documents or a third-party account.

Limits: no authenticated content, video playback, canvas serialization, infinite scrolling or page-specific interactions are promised. The capture records the visible page after network settling; incomplete external resources remain visible in the report. The original website is not contacted when opening a saved copy.

Implementation references: [Playwright request routing and service-worker limitations](https://playwright.dev/docs/api/class-browsercontext#browser-context-route), [Chromium sandbox guidance](https://playwright.dev/docs/docker).
