# Experiencia movil tipo app (navegacion, desbordamiento y usabilidad)

## Objetivo

Que en pantallas moviles la app se sienta como una aplicacion nativa: navegacion
inferior como puerta de entrada unica, cabecera compacta sin desplazamiento
horizontal, y todo el contenido vivo dentro del ancho de pantalla. Verificado
con render real (Chromium headless), no solo con lectura de codigo.

## Problema y por que

El usuario reporta que "arriba hay un menu que hay que mover de un lado a otro":
no parece una app movil. Causas verificadas en el codigo (no visualmente):

1. Breakpoints inconsistentes: la barra inferior `#bottomNav` solo aparece
   <640px, pero las tarjetas de leads/citas/campanas y `#mobileLeadsList`
   (`md:hidden` / `hidden md:block`) se activan <768px. Entre 640-767px conviven
   pestañas superiores horizontales con layouts de tarjeta.
2. `.topbar-actions` tiene `overflow-x: auto` en movil (src/index.css ~905):
   la cabecera se recorre lateralmente para alcanzar SQL&RLS/tema/app/refresh.
3. `setCitasViewMode` fuerza vista `timeGridDay` solo con `innerWidth < 640`
   (index.html ~2976): en 640-767px la vista semana desborda.
4. Bloque CSS de `.mobile-lead-card` duplicado integro (lineas ~204-224 y
   ~226-246 de src/index.css).
5. `#toastContainer` y `#idleBanner` se anclan a `bottom: .5rem` en movil:
   quedan debajo/detrás de la barra inferior (z-40).

## Alcance

Incluye:
- Unificar el breakpoint movil en 768px para navegacion: barra inferior visible
  <768px, pestañas superiores ocultas <768px, `main` con padding inferior para
  no quedar tapado.
- Cabecera movil compacta: solo estado + refresh + Nuevo Lead; acciones
  duplicadas en el menu "Mas" (app, tema, ayuda, usuarios, catalogos, salir) se
  ocultan en la cabecera <768px; sin `overflow-x` lateral.
- Calendario de citas: forzar `timeGridDay` en viewport <768px al activar modo
  calendario (antes <640px).
- Toasts y banner de inactividad por encima de la barra inferior.
- Limpieza del CSS duplicado de tarjetas de leads y reglas muertas de
  `.mobile-tabs` (menu superior ya oculto en movil).
- Verificacion renderizada con Chromium headless a 360/390/640/767px sobre el
  build, con sondas de desbordamiento horizontal por vista y capturas.

Excluye (decision explicita):
- Convertir en PWA ni tocar service worker/notificaciones.
- Cambiar logica de negocio, permisos, datos, Supabase ni contratos.
- Redisenar componentes que ya funcionan (tarjetas de leads, formularios <640px
  ya tienen font-size 1rem y min-height 2.75rem verificados).
- Unificar breakpoints de filtros/tableros entre 640-767px (ya caben; YAGNI).
- Touch/range/behavior de la feature Instagram en curso (diff local ajeno).

## Restricciones

- Sin commit, push, PR, merge ni deploy sin peticion explicita.
- Preservar el diff local en curso (canal Instagram: index.html, reportes.js,
  tests, migracion) — no tocar esas lineas.
- Riesgo bajo: CSS + 1 constante JS de UI; sin persistencia, seguridad ni
  contratos. Sin verificador independiente obligatorio; checks funcionales
  obligatorios si (lint, tests, sonda de render).
- No anadir dependencias: la sonda de render usa el chromium del sistema
  (`/usr/bin/chromium`) sobre `dist/` copiado a /tmp/opencode.

## No romper

- `pnpm lint` (tsc --noEmit + check-app.mjs) y `pnpm test` (782 tests) en verde.
- Escritorio >=768px: barra inferior oculta, pestañas superiores visibles,
  sidebar >=1100px intacto.
- `body.session-ready > div.sticky { display:none }` (oculta tabs en sidebar).
- Login/logout: `#bottomNav.is-visible` se anade/quita igual; solo cambia el
  breakpoint CSS que lo esconde en escritorio.
- CSP estricta: sin atributos de evento inline (data-ev sigue igual).
- Los 782 tests no afirman sobre bottomNav/mobile-tabs/innerWidth (grep
  verificado), pero si sobre HTML de reportes: por eso no se toca esa zona.

## TDD

Modo: off. Fuente: default (sin politica de proyecto ni instruccion explicita;
es cambio de CSS/UI donde la sonda de render es el check funcional).
Runner: `pnpm lint` y `pnpm test` + sonda Chromium headless sobre build.

## Tareas

- [x] T1 Linea base: `pnpm lint` + `pnpm test` + build en verde antes de tocar.
- [x] T2 Navegacion: breakpoint 768px (bottomNav, mobile-tabs, padding main),
  cabecera compacta sin overflow-x, toasts/idle sobre la barra inferior.
- [x] T3 Limpieza CSS: bloque `.mobile-lead-card` duplicado y reglas muertas
  de `.mobile-tabs` en el bloque 639px; paginacion movil movida al bloque 767px.
- [x] T4 Citas: forzar `timeGridDay` <768px (constante `isMobile`).
- [x] T5 Verificacion renderizada: build + sonda de overflow por vista a
  360/390/640/767px + capturas; lint y tests tras los cambios.
- [x] T6 (hallazgo de T5, correccion autorizada "si encuentras errores"):
  viewHistorico desbordaba el documento (62px a 360, 70px a 1024) porque la
  pista 1fr de `.historical-filter-grid` crecia al min-content del par de
  fechas Desde/Hasta (`min-width: auto`). Fix: `min-width: 0` en los items de
  la cuadricula y en labels/inputs del par (regla base, cubre todos los anchos).

## Criterios de aceptacion

- [x] A 360, 390, 640 y 767px: ninguna vista activa produce scroll horizontal
  del documento (sonda: scrollWidth <= clientWidth + 1px de tolerancia).
- [x] A 360px la cabecera no tiene scroll lateral (topbar-actions sin overflow).
- [x] Barra inferior visible en movil con sesion, pestañas superiores ocultas
  <768px, y contenido no tapado (main padding-bottom).
- [x] A >=768px no hay barra inferior ni cambios visibles respecto a hoy.
- [x] pnpm lint y pnpm test en verde tras los cambios.
- [x] Sin regresion del diff local ajeno (git diff intacto en sus zonas).

## Decisiones aceptadas

- Breakpoint 768px (md de Tailwind) en vez de 640px: coincide con los layouts
  de tarjeta ya existentes y con `md:hidden` de la lista movil de leads.
- Ocultar en cabecera movil solo acciones duplicadas en el menu "Mas";
  estado+refresh+Nuevo Lead permanecen (el boton primario no se esconde).
- Citas: mantener los 4 modos disponibles; en movil el modo calendario abre en
  Dia (sem/mes siguen elegibles y FullCalendar los renderiza con scroll interno).
- Toasts/banner por encima de la nav con `env(safe-area-inset-bottom)`.

## Reutilizacion investigada

- `#bottomNav` + `#modalMore` (menu "Mas") ya existen en index.html (~1696-1724):
  se reutilizan tal cual; solo cambia el breakpoint CSS que los oculta.
- Tarjetas de leads (`tarjetaLeadMovilHtml`), paginacion movil y formularios a
  1rem ya existen: no se redisenan.
- `#citasCalendarApi.setView` ya existe (src/citas-calendar.js): solo cambia
  la condicion `isMobile` que lo invoca.
- Alternativas descartadas: tabs tipo app con scroll-snap (ya existian y son lo
  que molesta al usuario); PWA nueva (desproporcionado); extraer componentes
  (duplicacion solo en CSS, se borra en su lugar).

## Evidencia

- T1 (baseline): `pnpm lint` OK; `pnpm test` 782 pass / 0 fail (+11 Python OK);
  `pnpm build` OK.
- T2-T4: cambios en src/index.css (breakpoint 768, bloque <767px, cabecera sin
  overflow-x, toasts/idle sobre nav) e index.html (`isMobile < 768` en
  setCitasViewMode). `git diff` revisado: solo zonas propias.
- T5 (sonda Chromium headless sobre build, sesion simulada, CDP con
  Emulation.setDeviceMetricsOverride porque --window-size impone 500px min):
  - 360/390/640/767px: docOverflow 0 en las 6 vistas (dashboard, leads,
    historico, reporte, citas, campanas); topbarActionsOverflow 0; bottomNav
    block; mobile-tabs none; btnApp/btnTheme none; 5 modales caben (fits true).
  - 1024px: docOverflow 0 en todo; bottomNav none; mobile-tabs block;
    btnApp/btnTheme visibles (escritorio intacto).
  - Check funcional 360px: nav 360x69 dentro del viewport, main padding-bottom
    88px > 69px de nav, botones Inicio/Leads/Citas/Mas.
  - Capturas en /tmp/opencode/mobile-check/shot-360-*.png (este modelo no
    procesa imagenes: quedan para revision humana; la evidencia verificada
    aqui es la numerica).
- T6: sonda pre-fix señalo viewHistorico 62px (360) y 70px (1024); inspeccion
  CDP mostro pista 1fr de 366.75px en contenedor de 294px por min-content del
  par de fechas (min-width auto). Post-fix: docOverflow 0 en todos los anchos,
  incluido el caso preexistente de escritorio 1024px.
- Final: `pnpm lint` OK; `pnpm test` 783 pass / 0 fail (+11 Python OK). El +1
  test y los `?? 0` de instagram pertenecen al diff ajeno en curso (edicion
  concurrente del usuario a las 13:53, verificada por mtime; no tocada).
- No ejecutado: prueba manual en telefono fisico con datos reales (pendiente
  del usuario; la sonda no puede loguearse contra Supabase).

## Progreso

Estado: done. Ultima tarea: T6. Siguiente paso: revision en telefono real por
el humano; ninguno bloqueado.
