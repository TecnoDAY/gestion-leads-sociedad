# Catálogos de Mes/Campaña/Medio/Gestión gestionables por admin

## Objetivo
El admin crea, renombra y desactiva valores de las 4 listas (Mes, Campaña, Medio, Gestión) desde el dashboard; los filtros muestran valores del catálogo aunque tengan 0 leads; los leads existentes nunca se modifican.

## Problema y por qué
Los filtros se deducen hoy de los datos: con solo septiembre cargado, el filtro de Mes ofrece un único valor, y no hay dónde registrar un programa/medio/gestión nuevos por adelantado para filtrar cuando haya datos.

## Alcance
- **T1** Migración `supabase/migrations/202609240009_create_lead_catalogs.sql`: tabla `lead_catalogs` (kind mes/campana/medio/gestion, value único por kind, active) + RLS lectura activos sin escritura directa + RPCs admin (`create_lead_catalog`, `rename_lead_catalog`, `set_lead_catalog_active`); seed de 12 meses ENERO…DICIEMBRE + valores distintos de `leads`. La revisa y ejecuta el humano en SQL Editor.
- **T2** Modal admin "Catálogos" (`data-admin-only`): selector de lista, añadir, renombar, desactivar/reactivar; recarga filtros tras cada operación.
- **T3** Cableado: 4 filtros principales + formularios Nuevo (selects mes/medio/gestión + datalist campaña) y Editar (datalist mes/campaña/medio, select gestión) leen del catálogo ∪ valores presentes en datos.
- **T4** Verificación: build/lint/diff-check/node-check/qa-gate + checklist manual.

## Restricciones
- Sin nuevas dependencias; vanilla JS; patrón RLS/RPC ya auditado (referencia: migración 0008 lead_notes).
- Nunca SQL remoto sin revisión del humano; nunca commit/push sin petición explícita.
- Desactivar un valor solo lo oculta de filtros/formularios: no altera ni borra leads.

## No romper
- RPCs y RLS de `leads`, `lead_notes`, `user_access` existentes.
- `populateFilterOptions`/`populateSelect`/`applyFilters` y los ids `filterMes/filterCampana/filterMedio/filterGestion`.
- Formularios Nuevo/Editar: campos y `handleCreateLead`/`handleUpdateLead` siguen leyendo los mismos ids.
- Opción "Todos/Todas" inicial de cada filtro.

## TDD
Checks funcionales obligatorios (sin runner): build + lint + `git diff --check` + `node --check` inline + qa-gate + checklist manual (admin crea valor → filtra 0 resultados → registra lead → filtra 1 → desactiva → desaparece del filtro sin tocar el lead).

## Tareas
- [x] T1 migración catálogos + seed
- [x] T2 modal admin Catálogos (CRUD vía RPC)
- [x] T3 cableado filtros y formularios (catálogo ∪ datos)
- [x] T4 verificación e informe

## Criterios de aceptación
- [ ] Migración 0009 creada, NO ejecutada por el agente.
- [ ] Filtro de Mes ofrece 12 meses aunque haya 0 leads; mismo criterio para las otras 3 listas.
- [ ] Valor nuevo: aparece en filtros y formularios; con 0 leads filtra tabla vacía; tras registrar lead, filtra con 1.
- [ ] Desactivar: desaparece de filtros/formularios; leads con ese valor intactos; reactivar lo devuelve.
- [ ] Agente no ve el panel ni puede escribir en el catálogo (RPC rechaza con admin_required).
- [ ] build/lint/diff-check/node-check/qa-gate verdes.

## Decisiones aceptadas
- Las 4 listas incluyendo Mes (decisión humana), con el aviso de que ocultar un mes filtra datos reales (reversible).
- El catálogo manda aunque no haya leads (seed completo de meses).
- Renombrar no reclasifica leads: los filtros muestran catálogo ∪ valores en datos.
- Lectura del catálogo directa por PostgREST con RLS (mismo patrón que `leads`), sin RPC de lectura extra — menos código, misma seguridad. (Refinamiento aprobado sobre el plan inicial.)
- Una sola RPC genérica por operación con parámetro `kind` en vez de una por lista.

## Reutilización investigada
- Patrón RLS/RPC admin de `202609240008_create_lead_notes.sql` y `202609230001` (is_admin_user, revoke/grant, security definer + search_path).
- `populateFilterOptions`/`populateSelect` (index.html ~1813) como punto de cableado de filtros.
- Panel admin existente `panelAdminUsers` + botón `data-admin-only` como precedente de UI admin.

## Evidencia
- T1: `supabase/migrations/202609240009_create_lead_catalogs.sql` — tabla + política SELECT `is_active_user()` + revoke/grant sin escritura directa + 3 RPCs admin (`create` con reactivación en conflicto, `rename`, `set_active`) + seed 12 meses + valores distintos de `leads` (trim) con `on conflict do nothing`. Ejecutada por el humano el 2026-09-24 (Success en SQL Editor).
- Extensión "Agente" (aprobada por el humano): migración `202609240010_agent_catalog_kind.sql` — CHECK de `kind` ampliado con `'agente'`, las 3 RPCs re-creadas con la validación ampliada y seed `agente` desde `user_access.nombre` ∪ `Agente` de leads (excluye 'SN', igual que los filtros); NO ejecutada por el agente. Frontend: opción Agente en el selector, `catalogRows` con kind `agente`, `agenteList` (compartido por Nuevo/Editar) y `histFilterAgente` cableados con `catalogOptions`. Verificado: build 190.09 kB OK, lint OK, `git diff --check` OK, `node --check` OK, 0 ids inexistentes, qa-gate sin hallazgos nuevos. Separación catálogo ≠ cuentas mantenida: desactivar un nombre no toca `user_access` ni login.
- T2: botón `btnCatalogs` en cabecera (toggle idéntico a `btnAdminUsers`), modal `modalCatalogs` con selector de kind, alta con input, lista con renombrar/desactivar-reactivar; cierre de sesión limpia botón y modal; `openCatalogsModal` con guardia `isAdmin`.
- T3: `loadCatalogs`/`catalogOptions`/`fillSelectFromCatalog`/`fillDatalistFromCatalog`; `populateFilterOptions` usa catálogo ∪ datos (valor inactivo en catálogo se oculta aunque esté en datos; desconocidos en datos se muestran); formularios Nuevo (selects mes/medio/gestión + datalist campaña) y Editar (datalist mes/campaña/medio + select gestión con preservación de selección); init `refreshCatalogs()` tras `loadLeadsData()`; degradación elegante si la migración no está aplicada (catálogo vacío → no pisa el HTML, comportamiento actual).
- T4: build 189.87 kB OK, lint OK, `git diff --check` OK, `node --check` ambos scripts OK, 0 `getElementById` sin id en HTML, qa-gate sin hallazgos nuevos (solo `.env.example` preexistente).
- Checklist manual pendiente del humano: alta de valor → filtra 0 → registrar lead → filtra 1 → desactivar → desaparece del filtro con el lead intacto → reactivar; agente sin botón Catálogos (y RPC rechaza `admin_required`).

## Progreso
- Estado: 0009 aplicada y verificada en vivo por el humano (todo funciona); extensión "Agente" (0010) implementada y verificada en local.
- Última tarea: extensión Agente.
- Siguiente paso: prueba manual de la lista Agente; luego decidir commit.
- Bloqueos: prueba manual; commit/push pendiente de petición explícita.
- Nota: 0010 falló a primera por usar `"Agente"` en el seed (columna real `"AGENTE"`, migración 0003); corregido y reejecutado por el humano con Success el 2026-09-24 (la transacción abortada no aplicó nada previamente).
