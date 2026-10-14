# Feature: Fase 0 — línea base de calidad y seguridad

## Objetivo

Establecer una línea base reproducible del estado actual antes de extraer el
Centro de ayuda o modificar otra zona del panel. La línea base debe distinguir
entre cobertura automatizada existente, recorridos críticos sin cobertura de
navegador y alertas de seguridad conocidas.

## Problema y por qué

El proyecto ya dispone de tests unitarios y de integración, pero no existe un
registro actual único que confirme el estado de `test`, `lint` y `build`, ni un
inventario de los recorridos críticos que siguen sin prueba de navegador. ZAP
tampoco debe ejecutarse a ciegas contra producción: primero hay que definir la
línea base y el entorno autorizado.

## Alcance

- Ejecutar y registrar `pnpm test`, `pnpm run lint` y `pnpm run build`.
- Inventariar la cobertura existente de login, roles, leads, citas, usuarios,
  reportes y Centro de ayuda.
- Identificar los recorridos críticos sin prueba de navegador.
- Definir el uso incremental de ZAP: Baseline pasivo por fase, escaneo
  autenticado y controlado para zonas sensibles, y auditoría completa final.
- Trabajar en la rama `phase-0-baseline`, sin modificar `main`.

## Restricciones

- No extraer todavía el Centro de ayuda.
- No instalar React, Playwright ni otra dependencia de navegador en esta fase.
- No cambiar comportamiento, esquema de Supabase ni datos de producción.
- No ejecutar ZAP contra producción ni hacer escaneo activo sin entorno y
  autorización explícitos.
- No hacer commit, merge, push ni despliegue sin petición explícita.

## No romper

- Los scripts existentes de `package.json` y el uso de `pnpm` como gestor
  canónico.
- Los tests, el lint y el build actuales.
- El comportamiento observable del panel y sus flujos de autenticación,
  autorización, leads, citas, usuarios y reportes.
- La rama `main`, que debe permanecer sin cambios de esta fase.

## TDD

- Modo: off
- Fuente: default
- Runner: `pnpm test`

Esta fase es de caracterización y verificación. No añade código de producto;
los huecos de cobertura se registran para fases posteriores.

## Tareas

- [x] T1: Ejecutar la línea base de tests, lint y build; registrar cada comando,
  resultado y salida resumida.
- [x] T2: Inventariar los tests existentes por recorrido crítico y localizar
  cobertura de comportamiento del Centro de ayuda.
- [x] T3: Registrar los recorridos críticos que requieren pruebas de navegador
  y la decisión de herramienta para una fase posterior.
- [x] T4: Definir el protocolo ZAP incremental y dejar identificado el bloqueo
  de entorno/URL si no existe un staging autorizado.
- [x] T5: Revisar el resultado completo de la fase y preparar criterios de
  entrada para la extracción del Centro de ayuda.

## Criterios de aceptación

- [x] La rama activa es `phase-0-baseline` y `main` no ha sido modificada.
- [x] `pnpm test`, `pnpm run lint` y `pnpm run build` tienen evidencia real
  registrada.
- [x] Cada recorrido crítico está clasificado como cubierto, parcialmente
  cubierto o pendiente de navegador.
- [x] El Centro de ayuda tiene una lista concreta de comportamientos a
  caracterizar antes de extraerlo.
- [x] El protocolo ZAP distingue Baseline pasivo, escaneo autenticado y
  auditoría activa final; no se escanea producción por defecto.
- [x] No se ha cambiado código de producto ni se ha desplegado nada.

## Decisiones aceptadas

- Rama de trabajo: `phase-0-baseline`.
- Se conserva `main` intacta hasta que el humano autorice una migración.
- ZAP se usará incrementalmente después de cada fase y también en una
  auditoría completa final.
- La instalación de pruebas de navegador queda fuera de esta fase para evitar
  introducir una dependencia antes de medir el hueco real.

## Reutilización investigada

- `package.json`: ya proporciona los runners oficiales de test, lint y build.
- `scripts/tests/`: contiene suites de Node y Python para helpers, citas,
  reportes, sesiones, integridad y webhook.
- `odd/tasks/reduccion-monolito.md`: documenta el patrón strangler existente y
  evidencia histórica de checks verdes.
- `index.html`: contiene el markup y la implementación actual del Centro de
  ayuda; se caracterizará sin moverlo en esta fase.

## Evidencia

### T1 — línea base ejecutada

- `pnpm test`: **passed** — 395 tests Node, 0 fallos; 11 tests Python, OK.
- `pnpm run lint`: **passed** — `tsc --noEmit` y `check-app` OK; 2 bloques,
  99 overrides de tema claro y 1129 utilidades usadas.
- `pnpm run build`: **passed** — Vite 8.3.4; `dist/index.html` generado y
  posteriormente inlineado como archivo autocontenido.

### T2/T3 — cobertura actual

| Recorrido | Estado actual | Evidencia | Hueco pendiente |
|---|---|---|---|
| Login y sesión | Parcial | `session-isolation.test.mjs`, `t5-frontend-edge.test.mjs` | Login real en navegador, errores de credenciales y cierre visual |
| Roles y permisos | Parcial | `backend-integrity.test.mjs`, `idle-timeout-preferencia.test.mjs`, `session-isolation.test.mjs` | Recorrido real con cuentas admin, supervisor, agente y trafficker |
| Leads | Parcial | `leads-helpers.test.mjs`, `t5-frontend-edge.test.mjs`, `webhook-whatsapp.test.mjs` | Alta, edición, filtros y permisos desde navegador con backend de prueba |
| Citas | Parcial | `citas-calendar.test.mjs`, `citas-helpers.test.mjs`, `verify-report-integration.test.mjs` | Abrir calendario, crear/editar y comprobar interacción visual |
| Usuarios | Parcial | `backend-integrity.test.mjs`, `idle-timeout-preferencia.test.mjs`, `t5-frontend-edge.test.mjs` | Gestión visual de usuarios y acciones por rol en navegador |
| Reportes | Parcial | `reportes-helpers.test.mjs`, `campaign-monthly-rollup.test.mjs`, `verify-report-integration.test.mjs`, `t5-frontend-edge.test.mjs` | Navegación, filtros y exportación desde navegador |
| Centro de ayuda | Parcial | `t5-frontend-edge.test.mjs` inspecciona el bloque y textos en las pruebas de líneas 1256–1281 | Abrir/cerrar, búsqueda, sección profunda, foco y responsive en navegador |

No hay runner de navegador instalado (`@playwright` y Puppeteer ausentes), por
lo que no se declara cobertura E2E. La herramienta queda para una fase
posterior, después de concretar entorno, cuentas de prueba y recorridos.

### T4 — seguridad incremental

El repositorio ya contiene un informe histórico:
`docs/security/zap-baseline-2026-10-11.html`, generado contra una URL de
Vercel. Su resumen registra 0 alertas High, 3 Medium, 1 Low y 14
Informational; se conserva como referencia histórica, no como una nueva
verificación de esta rama.

Protocolo aceptado:

1. Cada fase: ZAP Baseline pasivo sobre un staging autorizado; comparar alertas
   nuevas contra la referencia y no bloquear por avisos ya aceptados.
2. Login, roles, sesiones y leads: contexto autenticado con cuentas de prueba,
   endpoints incluidos/excluidos explícitamente y sin datos reales.
3. Cierre de migración: escaneo completo activo sobre staging, revisión de
   falsos positivos y comprobación separada por rol.

Estado: pendiente la URL/entorno staging autorizado para ejecutar una nueva
línea base. No se ejecutó ZAP contra producción.

## Progreso

- Estado: completada
- Última tarea: T5 completada con línea base, inventario y protocolo ZAP
- Siguiente paso: caracterizar el Centro de ayuda antes de extraerlo en una
  fase independiente
- Bloqueos: falta URL/entorno staging autorizado para ZAP; falta decidir la
  herramienta E2E cuando se aborde la cobertura de navegador
