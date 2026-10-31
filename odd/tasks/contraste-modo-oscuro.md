# Contraste del modo oscuro
Apply the approved dark-theme mockup locally before any publication.

## Specs
- S1: "ahora nota quiero el el tema o el formato oscuro se ve oscuro pero con un mejor contrastes nota como se ve se pierden muchas letras y palabras y visualmente no me agrada"
- S2: "si exactamente como me lo planteas vamos a aplicarlo en local para confirmarlo y si no hay detalles hacerle push"

## Tasks
- T1 [S1] Inspect theme implementation and approved mockup; route: inline; commit: pending.
- T2 [S1,S2] Dark theme contrast across Inicio, Leads, Tareas, Citas and Tablero without altering the light theme; route: worker; commit: pending.
- T3 [S1,S2] Verify behavior, contrast, responsive layout and light theme locally; route: verifier; commit: pending.
- T4 [S2] Publish only after successful checks and local confirmation; route: parent; commit: pending.

## Evidence
- T1 causes found: `body` stays `#f6f7fb` in dark mode (src/index.css:163 with only a light override at :192); `text-slate-700/800/600/500` have no dark override so they render dark-on-dark (src/tasks/index.js:127,149,152,320,321 plus HTML); the Leads amber filter row (`bg-amber-50/60`, `text-amber-900`, `bg-slate-800 text-slate-800`) mixes light and dark; FullCalendar only overrides borders, not background CSS variables (src/index.css:419-430).
- T2 done inline (delegated worker failed twice with a provider error and zero tool calls). `scripts/tests/dark-theme-contrast.test.mjs` observed RED (7/8 failing), then GREEN 8/8 after 89 added lines at the end of src/index.css, all scoped to `[data-theme="dark"]`. `git diff --stat src/index.css` = 89 insertions, 0 deletions, so no light-theme rule changed.
- T2 checks: `npm run check:app` OK (108 light overrides, 1066 utilities); `node --test scripts/tests/t5-frontend-edge.test.mjs scripts/tests/reportes-helpers.test.mjs scripts/tests/citas-calendar.test.mjs` 219/219; `npm run build` OK; `git diff --check` clean; full `npm test` 874 pass / 6 fail, the same 6 pre-existing `fichaLeadHtml` failures seen before this change.
- T3 pending: user visual confirmation of the five views in dark mode on localhost:3000 (desktop and mobile).
- T3b (user report, log L3): the Reports section still rendered as a white block with the Inscritos card showing dark text on dark green. Fixed with a second dark block making `#reporteDiario`, `.report-viewbar`, the report intro, `.daily-*` cards, `.period-*` cards/tables and the amber notice follow the dark theme, plus light label/value colors on the Inscritos card. The earlier rules that restored Tailwind slate colors inside the report were removed. Evidence: README test `scripts/tests/dark-theme-contrast.test.mjs` 10/10 GREEN; 194 focused report/frontend tests pass; `npm run check:app` OK; `npm run build` OK; `git diff --stat src/index.css` = 156 insertions, 0 deletions, so the light theme remains untouched.

## Log
- L1: "ahora nota quiero el el tema o el formato oscuro se ve oscuro pero con un mejor contrastes nota como se ve se pierden muchas letras y palabras y visualmente no me agrada \n\n/tmp/gpX1b6Fu/pi-clipboard-41702144-e341-4150-adb9-70bc5c5d46f1.png\n/tmp/gpX1b6Fu/pi-clipboard-4648344a-6e3c-4511-9c00-a81c889a692f.png\n/tmp/gpX1b6Fu/pi-clipboard-f475689b-ea62-4f62-babe-6dabd8a72988.png\n/tmp/gpX1b6Fu/pi-clipboard-7efcbb66-f6dd-4c2f-91da-4870e51fe399.png\n/tmp/gpX1b6Fu/pi-clipboard-0df4c3af-6c42-4372-be90-9a69dda109f1.png\ncone stas capturas me entiendes la idea"
- L2: "si exactamente como me lo planteas vamos a aplicarlo en local para confirmarlo y si no hay detalles hacerle push"
L3: "la seccion de reporte se ve asi /tmp/gpX1b6Fu/pi-clipboard-395bca9b-57c5-4231-abf9-dde53392f28a.png /tmp/gpX1b6Fu/pi-clipboard-dbcf37b0-8cac-4ec0-a289-4c8525c0b22b.png corrigelo tambien"
