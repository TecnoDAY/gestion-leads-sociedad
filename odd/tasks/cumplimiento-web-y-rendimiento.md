# Cumplimiento web, errores y rendimiento (local)

## Objetivo
Cerrar los huecos reales detectados en la auditoría del CRM (privacidad, indexación, favicon, 404, icono roto y carga inicial) con cambios mínimos, verificables y reversibles en local.

## Problema y por qué
La auditoría de los 20 puntos mostró: sin política de privacidad (se guardan nombres, teléfonos, correos y actividad de asesoras), sin control de indexación, favicon 404, 404 genérica de Vercel y Lighthouse móvil en 68 (LCP 4,4 s, 208 KiB de JS sin usar, 3,3 s de bloqueo de render). Además se detectó un error real de consola: el icono `users-check` no existe en la versión de Lucide cargada.

## Alcance
- T1 línea base + detección de errores reales de consola.
- T2 `public/robots.txt`, favicon, meta `noindex` y `public/404.html`.
- T3 `public/privacidad.html` + enlaces desde el login y el pie del panel.
- T4 corregir el icono inexistente.
- T5 carga diferida de Chart.js (solo la pestaña Histórico).
- T6 evaluar sustituir Tailwind CDN por CSS compilado (ya existe `src/index.css` con `@import "tailwindcss"`).
- T7 verificación final y documentación.

## Restricciones
- Solo local: **sin commit, push ni deploy**.
- No tocar autenticación, RLS, esquema de Supabase, migraciones ni datos.
- No reescribir a React ni cambiar de framework.
- Cambios en `index.html` deben seguir pasando `scripts/check-app.mjs` (tema claro).

## No romper
- `switchTab`/`setDashboardTabState` y el arranque de sesión.
- El fallback ya existente `if (!window.Chart)` en `renderHistoricalAnalytics` (línea ~5417).
- `updateChartTheme()` (ya tolera `window.Chart` ausente).
- `check-app.mjs`: bloques `<script>` con sintaxis válida y sin utilidades oscuras sin sobrescritura de tema claro.
- Tema claro/oscuro, `localStorage` de tema y el HTML imprimible del reporte.

## TDD
Modo: off | Fuente: usuario (pidió prueba y verificación, no un runner de test nuevo) | Runner: existente `npm run lint` + `npm test` + `npm run build`; comprobaciones funcionales con Lighthouse y chromium headless.

## Tareas
- [x] T1 línea base y errores de consola
- [x] T2 robots, favicon, noindex, 404
- [x] T3 privacidad + enlaces
- [x] T4 icono Lucide inexistente
- [x] T5 carga diferida de Chart.js
- [x] T6 Tailwind compilado (sustituye el CDN de runtime)
- [x] T7 verificación final y documentación (incluye 3 errores propios corregidos)

## Criterios de aceptación
- [x] `npm run lint`, `npm test` y `npm run build` en verde (245 tests node + 11 python).
- [x] `/robots.txt`, `/favicon.svg`, `/404.html` y `/privacidad.html` se sirven (200).
- [x] `noindex` presente en `index.html` y en `404.html`.
- [x] Cero mensajes de consola (antes: aviso Tailwind CDN, icono inexistente, aviso de formulario).
- [x] Lighthouse móvil medido antes/después con la misma configuración.
- [x] Sin cambio de aspecto: estilos calculados idénticos en tema oscuro y claro.
- [x] `is-crawlable` 1→0: única métrica que baja, y es la decisión de no indexar el CRM.

## Decisiones aceptadas
- `robots.txt` con `Disallow: /` **más** meta `noindex`: robots.txt impide rastreo, `noindex` impide indexación; ninguno de los dos es medida de seguridad de datos.
- No se instala analítica de terceros sobre el CRM (ya hay registro interno de sesiones).
- No se crea sitemap: el CRM queda `noindex`.
- Favicon SVG propio de ~1 KB, sin dependencias ni imágenes externas.

## Reutilización investigada
- Fallback existente `if (!window.Chart)` → permite carga diferida sin romper la pestaña.
- `updateChartTheme()` ya ignora la ausencia de Chart → el cambio de tema sigue funcionando.
- `src/index.css` con `@import "tailwindcss"` y plugin `@tailwindcss/vite` ya instalados → la ruta compilada existe.
- `scripts/check-app.mjs` como guarda de regresión del monolito.

## Evidencia
- Línea base: `npm run lint` OK; `npm test` 245 + 11 OK; `npm run build` OK.
- Lighthouse local, misma configuración, antes → después: performance **61 → 85**; accesibilidad **100 → 100**; mejores prácticas **96 → 100**; LCP **6,2 s → 3,3 s**; TBT 140 ms → 0 ms; TTI 6,4 s → 3,3 s; peso total **794 KiB → 286 KiB**; JS sin usar **414 KiB → 104 KiB**; `errors-in-console` 0 → 1 (limpio). SEO 100 → 63 por `is-crawlable`: es la decisión de `noindex` sobre el CRM, no un fallo.
- Consola antes: aviso "cdn.tailwindcss.com should not be used in production", icono `users-check` inexistente y aviso de formulario con contraseña sin usuario. Después: **cero mensajes**.
- Icono: `Object.keys(lucide)` en 1.49.0 → no existe `users-check`; correcto `user-round-check`.
- Tailwind compilado: `dist/assets/*.css` 51,71 kB (9,06 kB gzip); cobertura de las 427 clases usadas (incluidas las generadas por JS) verificada contra el CSS; comparación de estilos calculados en tema oscuro y claro entre versión original y nueva: **idénticos**; capturas comparadas píxel a píxel (diferencia media 3,8 en claro, 2,4 en oscuro, atribuible al redondeo oklch/rgb de la paleta v4, deltas de 1-4/255).
- Archivos servidos: `robots.txt`, `favicon.svg`, `404.html`, `privacidad.html` → 200. `/404.html` muestra el mensaje propio. En local `vite preview` tiene fallback SPA, así que la 404 por ruta inexistente se observa en Vercel (sitio estático con `404.html`).

### Errores encontrados y corregidos durante la implementación
1. `users-check` no existe en Lucide 1.49.0 → cambiado a `user-round-check` (svg inexistente en "Cierres por Asesor / Agente").
2. Aviso de Chromium por formulario con contraseña sin campo de usuario → proviene del modal "Define tu contraseña" (bisectado sobre el HTML real); corregido con `<input type="text" autocomplete="username" hidden>`.
3. Regresión propia de contraste: el enlace de privacidad con `text-slate-500` a 11 px bajaba `color-contrast` a 0 → cambiado a `text-slate-400`/`text-slate-300`; accesibilidad de vuelta a 100.
4. Los 3 tests que fijaban el runtime frontend fallaron al cambiar de motor: actualizados manteniendo su intención (fijar versiones externas y prohibir el CDN de Tailwind), y añadido `ensureChartJs` al arnés de `session-isolation` con `createElement`/`head` en el stub.
5. `chartJsCargando is not defined` en el test: la memoización pasó a vivir en `ensureChartJs.promise` para no depender de una variable de módulo.

## Progreso
- Estado: implementación completa y verificada en local (T1-T7 passed).
- Última tarea: T7.
- Siguiente paso: revisión humana. Pendiente real: rellenar los «COMPLETAR» de `public/privacidad.html` (datos del responsable, plazos, autoridad de control) y revisar el panel autenticado con una cuenta de prueba.
- Bloqueos: contenido legal (revisión humana); verificación visual del panel tras login; commit/push y deploy sin petición explícita.
