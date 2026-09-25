# Reporte diario del asesor (v1: solo vista + captura)

## Objetivo
Panel con el formato unificado de las tres hojas de reporte diario: números autocompletados desde el trabajo registrado del día y campos manuales editables, pensado para que el asesor lo complete y tome captura.

## Problema y por qué
Cada asesor llena su reporte a mano en hojas con formatos distintos (evidencia: 3 plantillas inconsistentes). El sistema ya registra cada cambio de estado (`lead_gestiones`) pero nadie lo agrega por día y asesor; así los números existen y se introducen dos veces.

## Alcance
- **T1** Panel "Reporte diario": selector de fecha (hoy por defecto) + bloques auto (gestión por medio con desglose por resultado, agendados día vs. Data Dura, inscritos, totales auto-suma) + bloques manual (hora inicio/fin, horas trabajadas, llamadas día/Data Dura/WhatsApp, visitas, problemas, observaciones) con aviso de no-guardado. Permisos: asesor solo ve lo suyo (`autor_name` = su `nombre` de `user_access`); admin ve todos con selector de asesor (valores activos del catálogo `agente`). Diseño limpio tipo hoja, legible en captura.
- **T2** Verificación: checks habituales + checklist manual.

## Restricciones
- Sin dependencias nuevas; vanilla JS; sin migraciones (v1 no toca base de datos).
- Sin PDF, CSV ni PNG en v1 (decisión humana aceptada; captura de pantalla).
- Nunca commit/push sin petición explícita.

## No romper
- Agregados existentes (`computeHistoricalAggregates`, KPIs, paneles histórico/mensual), RPCs y RLS de `leads`, `lead_notes`, `lead_catalogs`, `lead_gestiones`.
- `lead_gestiones` es de solo lectura para todos: el reporte solo consulta, nunca escribe.
- Formularios y filtros existentes intactos.

## TDD
Modo: off | Fuente: default | Runner: no disponible (sin runner; checks funcionales obligatorios).

## Tareas
- [x] T1 panel reporte diario (auto + manual + permisos + diseño captura)
- [x] T2 verificación e informe

## Criterios de aceptación
- [ ] El reporte de un asesor cuadra con sus gestiones de ese día (fuente: `lead_gestiones.fecha_gestion` + `autor_name`).
- [ ] Agendado sobre lead de un mes anterior al actual cae en "Agendados Data Dura", no en "día".
- [ ] Agregado por medio (Whatsapp / Facebook-Instagram / Aircall / Directo-Referido) según campo `Medio` del lead, con desglose de resultados.
- [ ] Asesor no ve reportes de otros; admin sí, con selector de asesor y fecha.
- [ ] Aviso visible de que los campos manuales no se guardan.
- [ ] La vista completa cabe legible en una captura.
- [ ] build/lint/diff-check/node-check/qa-gate verdes.

## Decisiones aceptadas
- Solo vista + captura en v1; PDF/CSV/guardado en v2 condicional (solo si se pide tras 1-2 semanas de uso).
- Fuente de datos única = `lead_gestiones` (prerrequisito: migración 202609250001 aplicada por el humano); sin retroactividad aceptada.
- Fechas pasadas recalculan lo auto; lo manual de días pasados queda vacío (sin persistencia, aceptado).
- Data Dura = el lead cuyo `Mes` es anterior al mes actual (mismo criterio que los estados DATADURA).
- Selector de asesor del admin desde el catálogo `agente` (mismo origen `user_access.nombre` que `autor_name`).

## Reutilización investigada
- Consulta `lead_gestiones` y patrón de la ficha (`loadLeadGestiones`, index.html ~2916) como referencia de acceso a la tabla.
- `normalizeLeadMonth`/`MONTH_CHRONO`/`normalizeGestion`/`groupGestionEstado` (index.html:3225-3287) para clasificar mes y estados sin reinventar.
- Patrón de paneles/pestañas existentes (barra de pestañas ~L127, panel histórico) para la estructura y estilos del nuevo panel.
- Categorías de medio: valores del select `newMedio` existente.

## Evidencia
- Estado: implementado en `index.html`; medios desconocidos se agrupan en "Directo o Referido" para no perder gestiones.
- `npm run build`: OK (Vite build; warning informativo de configLoader).
- `npm run lint`: OK (`tsc --noEmit`).
- `git diff --check`: OK.
- `node --check` sobre scripts inline: OK.
- `bash ~/.config/opencode/scripts/qa-gate.sh`: no verde; bloqueado por `.env.example` preexistente detectado como fichero sensible.
- T1 reabierta por segunda verificación: se restaura completamente la pestaña dashboard al cerrar sesión (DOM y estilos), se reinician fecha/aviso del reporte y se ignoran respuestas asíncronas de generaciones de sesión obsoletas.
- Segunda reapertura verificada: Fix 2 (Data Dura enero) y el núcleo de Fix 1 se conservan; se corrigió la regresión de pestaña tras logout/login y los tres menores solicitados. `npm run build`: OK; `npm run lint`: OK; `git diff --check`: OK; `node --check` scripts inline: OK; `qa-gate`: bloqueado por `.env.example` preexistente detectado como fichero sensible.
- Verificador final (3ª ronda): RESULT success — helper `setDashboardTabState` compartido con `switchTab` (sin duplicación desincronizada), trazas logout→login limpias desde Reporte e Histórico, `lead_gestiones` solo-lectura (0 escrituras), XSS escapado, `sessionGeneration` tras cada `await`.
- T2 suite final (ejecutada): build 203.07 kB OK, lint OK, `git diff --check` OK, `node --check` 2/2 OK, 0 `getElementById` sin id, qa-gate sin hallazgos nuevos (solo `.env.example` preexistente). Único fichero modificado vs 4a74155: `index.html` (88+/6−).
- Checklist manual pendiente del humano: confirmar migración `202609250001` aplicada; asesor abre Reporte → números cuadran con sus gestiones del día → rellena manuales → captura; agendado sobre lead de mes anterior en "Agendados Data Dura"; admin con selector de asesor, sin selector el agente.

## Progreso
- Estado: implementación completa y verificada en local (T1-T2 passed; T1 cerrada tras 2 reaberturas con fixes de logout, enero y regresión de pestaña).
- Última tarea: T2.
- Siguiente paso: prueba manual del humano; v2 (PDF/CSV/guardado) condicional a uso real; commit cuando lo pida.
- Bloqueos: prueba manual; commit/push pendiente de petición explícita.
