# Production Next route Browser Mode PoC

This isolated proof checks whether a Vitest Browser Mode test can drive the actual production Next.js route through the Playwright provider. It is not a migration test and does not transfer or remove any Playwright E2E assertion.

Run `pnpm run test:browser:next-route-poc`. The script runs the existing production `pnpm run build` first; running `tests/config/browser/vitest.browser.next-route.config.ts` directly requires a current `.next/BUILD_ID` and a production `next start` server on the chosen port. The launcher owns the production server and Vitest lifecycle. By default it probes the loopback interface with port `0`, starts `next start` on that candidate, and retries a newly allocated candidate only if that owned child exits with `EADDRINUSE`; it then waits for the dashboard heading before starting Vitest with `NEXT_ROUTE_POC_PORT`. It stops only the server child it started. To choose a fixed port, use `NEXT_ROUTE_POC_PORT=3188 pnpm run test:browser:next-route-poc`; accepted values are decimal integers from 1024 through 65535. An occupied explicit port is reported without reuse or automatic reassignment. The BrowserCommand uses its provider BrowserContext to create and close a separate context/page; it does not access the Vitest orchestrator page.

The command navigates to `/`, reads the actual route heading and first production chart data row, clicks the CPI major chart's `総合` legend, and returns the route/data/DOM observations to Vitest assertions. This demonstrates one production route, one server-rendered data surface, and one chart interaction. It does not prove every Next route, async Server Component composition, data freshness contract, deployment environment, other browser engine, or parity for any migration candidate.

The local Next.js 16.3.5 Vitest guide says async Server Components are unsupported by the standard Next/Vitest integration. That documented integration limitation is separate from Vitest Browser Mode's browser APIs. This PoC controls a running production `next start` server through Playwright; it does not make the standard integration support async Server Components.

## Optional persistent Chromium server

Chromium Browser Mode can reuse a detached Playwright browser server across
commands. Start it, run a browser suite through the manager, inspect its status,
then stop it:

```sh
pnpm test:browser:server:start
pnpm test:browser:server:run -- pnpm test:browser:component:all
pnpm test:browser:server:status
pnpm test:browser:server:stop
```

`run` checks that the server is reachable and its Playwright version matches
the installed `@playwright/test`; it sets `PLAYWRIGHT_BROWSER_SERVER=1` for the
child command and returns that command's exit status. The Chromium provider
helper then reads `.cache/playwright-browser-server/state.json` and connects
to its loopback WebSocket endpoint with a 10-second timeout. To isolate server
state, set `PLAYWRIGHT_BROWSER_SERVER_STATE_DIR` to a directory for both the
manager commands and the test process. Starting the browser server does not
start or retain the Next.js production server: route commands still own their
existing build/readiness and Next.js lifecycle. Browser Mode test contexts
remain isolated and are closed according to their current lifecycle.

To reproduce the integration checks, run the manager lifecycle checks (start,
stop, concurrent connections, and state-directory isolation) and then the
provider checks (the full component suite and consecutive focused runs):

```sh
node --test tests/scripts/playwright-browser-server.integration.mjs
node --test tests/scripts/playwright-provider-vitest.integration.mjs
```

To include production-route cases, build first and enable route verification:

```sh
pnpm run build
PLAYWRIGHT_SERVER_VERIFY_ROUTES=1 node --test tests/scripts/playwright-provider-vitest.integration.mjs
```

These checks use a temporary isolated state directory and stop the persistent
browser in a `finally` cleanup, so they can be rerun without reusing prior
server state.
