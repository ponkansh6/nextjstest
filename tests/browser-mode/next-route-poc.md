# Browser Mode local fixture contract

The active Browser Mode projects are `standard` and `pixel7`, each selecting
one local fixture test file. `pnpm run test:browser:all` runs standard and
then Pixel 7; it does not build Next or start a production server.

Four B12/B13 cases run in `pixel7.browser.test.tsx` against local component
and page fixtures: B12 #307 and B13 #473, #508, and #535. They use synthetic
pointer interactions. B12 #430 was removed because this fixture suite does
not perform Next route navigation. The retained cases do not verify production
route composition or trusted physical-touch delivery.

The historical production-route runner described by this filename is an
inactive legacy artifact. It is not called by package scripts, CI, or Husky
pre-push.
Pre-push runs both Browser Mode projects before the build, then invokes
`pnpm run measure:cache-e2e -- --skip-cache --port 3001` only to start Next on
`127.0.0.1:3001` and confirm readiness. That check performs no route or browser
interaction.

Each active project runner validates the complete Vitest JSON report against
its checked-in `fullName` manifest. `BROWSER_MODE_REPORT_PATH` retains the JSON
report under the repository or OS temporary directory; otherwise the temporary
report is removed on exit.
