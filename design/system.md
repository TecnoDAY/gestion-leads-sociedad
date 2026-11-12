# Project visual system — CRM de admisiones

Sincronización incremental para las vistas conceptuales de Inicio. Fuentes de verdad: `src/index.css` (incluido el bloque final Global vibrant palette) y `src/kanban/kanban.css`. No es un sistema inicial propuesto. Las variantes aprobadas de tabla se conservan.

Sources: `src/index.css` (theme, light overrides, focus styles, dashboard surfaces) and `src/kanban/kanban.css` (light-theme variables). Source files were not changed.

## Colors
- page: `#f6f7fb` — surface, text or interface; source: src/index.css.
- surface: `#ffffff` — surface, text or interface; source: src/index.css and src/kanban/kanban.css.
- subtle: `#f8fafc` — surface, text or interface; source: src/index.css and src/kanban/kanban.css.
- head: `#f1f5f9` — surface, text or interface; source: src/index.css and src/kanban/kanban.css.
- line: `#e2e8f0` — surface, text or interface; source: src/index.css and src/kanban/kanban.css.
- border: `#cbd5e1` — surface, text or interface; source: src/index.css and src/kanban/kanban.css.
- ink: `#0f172a` — surface, text or interface; source: src/index.css and src/kanban/kanban.css.
- text: `#334155` — surface, text or interface; source: src/index.css.
- muted: `#475569` — surface, text or interface; source: src/index.css and src/kanban/kanban.css.
- accent: `#4338ca` — surface, text or interface; source: src/index.css.
- focus: `#6366f1` — surface, text or interface; source: src/index.css.
- green: `#047857` — status feedback; source: src/index.css.
- greenBg: `#d1fae5` — status feedback; source: src/index.css.
- amber: `#92400e` — status feedback; source: src/index.css.
- amberBg: `#fef3c7` — status feedback; source: src/index.css.
- rose: `#be123c` — status feedback; source: src/index.css.

## Extensión verificada — Inicio y tema oscuro
Los alias de maqueta siguientes describen valores reales, no nuevas variables de producción.

| Alias / token de origen | Valor | Uso | Fuente |
| --- | --- | --- | --- |
| --app-accent-soft | #e0e7ff | Superficie suave y texto de navegación | src/index.css |
| deep-accent | #312e81 | Sidebar y hover de calendario | src/index.css |
| dark-surface / --kb-card-bg | #1e293b | Tarjetas oscuras | src/index.css; src/kanban/kanban.css |
| dark-page / --kb-column-header-bg | #0f172a | Fondo oscuro | src/index.css; src/kanban/kanban.css |
| dark-border / --kb-card-border | #334155 | Separadores oscuros | src/index.css; src/kanban/kanban.css |
| dark-text / --kb-text | #e2e8f0 | Texto principal oscuro | src/kanban/kanban.css |
| dark-muted / --kb-text-muted | #94a3b8 | Texto secundario oscuro | src/kanban/kanban.css |
| --app-link (dark) | #a5b4fc | Enlaces oscuros | src/index.css |

Inventario de color: 21 valores únicos (16 originales + 5 añadidos: #e0e7ff, #312e81, #1e293b, #94a3b8, #a5b4fc). Los tres alias oscuros restantes reutilizan valores originales. Semántica vigente: --app-accent #4338ca, --app-positive #047857, --app-pending #92400e, --app-negative #be123c, --app-on-color #ffffff.

## Typography
- App sans: Plus Jakarta Sans, system-ui, sans-serif; source: src/index.css @theme.
- App mono: JetBrains Mono, monospace; source: src/index.css @theme.
- Offline artboards use the declared system-ui/sans-serif and monospace fallbacks only; no font downloads.
- Existing sizes include .68rem, .75rem, .78rem, .8rem, .85rem, 1rem; source: src/index.css.
- Weight: 400, 600, 700, 800; source: src/index.css.

## Spacing and shape
- Existing spacing: .25rem, .5rem, .65rem, .75rem, 1rem, 1.15rem; source: src/index.css.
- Existing radii: .5rem, .65rem, .8rem, 1rem, 1.25rem, 9999px; source: src/index.css.
- Existing shadow: 0 8px 24px -20px rgba(15,23,42,.55); source: src/index.css dashboard metric cards.

## Componentes de Inicio — reglas sincronizadas
- Sidebar: gradiente de #4338ca a #312e81; elemento activo blanco con texto #4338ca; texto inactivo #e0e7ff. Fuente: src/index.css, Global vibrant palette.
- Dashboard: superficies neutras, borde superior de introducción 3px de acento; métricas con radios 1rem. Fuente: src/index.css.
- Tareas: superficies blancas y tintes índigo en claro; campos/controles móviles de al menos 2.75rem. Fuente: src/index.css, ajustes táctiles y Global vibrant palette.
- Citas: controles primarios índigo, hover #312e81; estados expresados en texto. Fuente: src/index.css.
- Tema oscuro: tarjetas #1e293b sobre #0f172a, bordes #334155, texto #e2e8f0 y secundario #94a3b8. Fuente: src/kanban/kanban.css.
- Los layouts de Inicio, tamaño de titulares y organización de agenda son propuestas de composición, no tokens de producción. Los filtros solo cambian muestras locales; ninguna acción guarda datos.

Inventario conservado: 2 familias tipográficas (con fallbacks offline), 6 tamaños tipográficos, 4 pesos, 6 espaciados, 6 radios, 1 sombra. Este inventario es una selección relevante, no el total de declaraciones CSS.

## Components and preview rules
- Light surfaces: white, slate separators and subdued headers; source: both CSS files.
- Keyboard focus: 2px #6366f1 outline, 2px offset; source: src/index.css.
- Positive: green; pending: amber; negative: rose; source: src/index.css light text overrides.
- Preserve textual status labels; never use color alone.
- New table column proportions and row sizing are layout proposals, not pre-existing tokens.
- No motion is needed. Offline preview controls do not access CRM data.

## Global variant — approved after the table preview
- Source: src/index.css, final Global vibrant palette block. Existing layout, visibility, permissions, data and status meanings remain unchanged.
- Global semantic tokens: --app-accent #4338ca; --app-positive #047857; --app-pending #92400e; --app-negative #be123c; --app-on-color #ffffff. All four filled colors have at least 4.5:1 contrast with white labels.
- Link accent: #4338ca on light surfaces, #a5b4fc on dark surfaces (existing source: src/index.css dark text/hover styles).
- Accent tint #e0e7ff and deep accent #312e81 already occur in src/index.css (light priority buttons and dark tooltip controls). Sidebar uses the deep accent with a white active item; inactive text uses the tint.
- Applies to navigation, primary actions, shared status chips, dashboard icon accents, table/report headers, exports, modal header accents, task controls, calendar controls, Kanban header accents and counters, and campaign metric actions.
- Neutral card/page backgrounds and dark-theme surfaces remain. Chart categories, matrix heatmap data cells and advisor-specific calendar event colors retain their distinct meanings.
- Typography, spacing, radii and shadows are unchanged from the existing system; this extension changes colors and accent borders only.

## Approved local variant — leads results table
- Initial approval was limited to this table and its controls. The user subsequently approved extending the same palette across the application; see Global variant below.
- Reuse accent #4338ca for the table header, export control and active pagination; white #ffffff foreground.
- Use solid green #047857 for positive/new badges, amber #92400e for scheduled badges and rose #be123c for negative badges, with white #ffffff text. Preserve every status label.
- Implementation: src/index.css, scoped to #leadsResultsPanel; desktop layout targets #leadsTable at min-width 768px. Existing mobile cards remain in use.
- Row height: 56px for ordinary rows, allowed to grow for extra information. Nine column widths: 5/10/17/16/11/10/11/10/10 percent; actions are slightly wider than the mockup to preserve all three admin controls. Table minimum width: 1170px; narrow desktop/tablet views scroll inside the table region.
