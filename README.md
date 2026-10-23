# Gestión de Leads 2026 — Sociedad Actoral

CRM web de admisiones para **Sociedad Actoral**: captación, seguimiento comercial, citas, campañas, análisis histórico y reportes del equipo. Conectado en tiempo real a **Supabase (PostgreSQL + RLS)** y listo para despliegue en **Vercel** o como archivo estático autocontenido. Incluye PWA instalable.

---

## 🌟 Módulos de la aplicación

La app se organiza en pestañas principales (barra superior / sidebar):

### 1. Inicio (Dashboard)
- **KPIs del funnel:** total de leads, citas agendadas, alumnos inscritos y tasa de conversión en tiempo real.
- **Prioridades rápidas** y acceso rápido a leads.
- **Citas del día** y bloque de leads recientes.
- **Filtros dinámicos:** mes, campaña, medio de captación, estatus de gestión y buscador de texto libre (nombre o teléfono).
- **Matriz cruzada interactiva (Gestión vs. Campaña):** tabla bidimensional con totales por fila/columna y filtrado al hacer clic en cualquier celda.

### 2. Leads
- Tabla paginada con acciones rápidas:
  - Enlace directo a WhatsApp (`https://wa.me/`) con saludo personalizado.
  - Badges de color por estatus comercial (Inscrito, Agendado, Información, Data Dura…).
  - Modal de edición rápida y registro de notas de seguimiento.
  - Alta de nuevos prospectos con cita opcional en la misma operación.
- Ficha del lead con historial de gestiones (append-only), notas del equipo, contactos, citas y datos de inscripción.
- Detección de teléfonos repetidos entre leads.

### 3. Citas
- Calendario del equipo en vistas **Día / Semana / Mes / Lista** (FullCalendar).
- Creación, resultado (Asistió / No asistió / Cancelada) y reprogramación de citas.
- Filtros por fecha, resultado, campaña, medio, asesor y sede (Doral / Weston).
- KPIs: total, programadas, asistieron, tasa de asistencia y desglose por estado y sede.
- Sedes Doral y Weston; citas históricas sin sede aparecen como "Sin sede".

### 4. Campañas
- Resultados por campaña con alcance, gasto y contadores del CRM.
- Comparación mensual y coste por resultado.
- Registro y corrección de métricas por período de fechas (Desde/Hasta) y por mes.
- Exportación a CSV. Acceso según rol (trafficker y supervisores).

### 5. Análisis histórico (2026)
- Evolución mensual (leads captados vs. inscripciones).
- Tendencia de conversión mes a mes.
- Rendimiento por campaña y canales de entrada.
- Cierres por asesor y tabla resumen consolidada.
- Datos históricos de 2025 de solo lectura.

### 6. Reportes
- **Reporte diario:** un bloque por asesora con canales reales, citas creadas, resultados e inscritos; notas manuales por asesora y fecha; exportación CSV.
- **Reporte por período:** captación, gestiones, inscripciones realizadas, matriz estado × campaña y actividad; exportación CSV.

### Otros
- **Centro de ayuda** integrado (offline, buscable).
- **Administración de usuarios** (activar/desactivar, roles, cierre automático por inactividad).
- **Catálogos** administrables (Mes, Campaña, Medio, Gestión, Agente).
- **Modal SQL & RLS** para inspeccionar políticas de seguridad y esquema.

---

## 👥 Roles y permisos

| Rol | Acceso |
| :--- | :--- |
| **Administrador** | Todo: leads, citas, catálogos, usuarios, edición de datos principales, eliminación. |
| **Asesora (agente)** | Leads y citas del equipo compartidos; gestiona sus propios leads; cierre por inactividad (4 min aviso / 5 min cierre). |
| **Supervisor** | Como asesora + filtro por asesor + edición de campañas. |
| **Trafficker (campañas)** | Solo Campañas y Reportes (solo lectura en reportes); no ve leads ni citas. |

La protección real está en Supabase (RLS y funciones RPC); la interfaz solo oculta opciones.

---

## 🛠️ Stack técnico

- **Frontend:** Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`), TypeScript 7, FullCalendar 6, Lucide icons.
- **Backend:** Supabase (PostgreSQL, RLS, RPC, Edge Functions en Deno/TS).
- **Build estático:** `vite build` + `scripts/inline-dist.mjs` genera `dist/index.html` autocontenido.
- **PWA:** `manifest.webmanifest`, `sw.js`, iconos e instalación.
- **Calidad:** `tsc --noEmit`, `scripts/check-app.mjs`, tests con `node --test` y `unittest`.

---

## 🗄️ Esquema de la base de datos

### Tabla principal `leads` (Supabase, ~6.3k filas)

| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | Identificador único |
| `Mes` | `TEXT` | Mes de captación (ej: ENERO, FEBRERO…) |
| `Fecha` | `TEXT` | Fecha del lead (ej: 1/01/2026) |
| `Nombre` | `TEXT` | Nombre del prospecto o cliente |
| `Telefono` | `TEXT` | Teléfono / WhatsApp |
| `Campaña` | `TEXT` | Programa de interés / campaña de origen |
| `Medio` | `TEXT` | Canal de entrada (Instagram, Whatsapp, Referidos…) |
| `GESTION` | `TEXT` | Estatus comercial (INSCRITO, Agendado, Información, Data Dura…) |
| `Interesado en ` | `TEXT` | Programa en el que el lead está interesado (solo informativo) |
| `Ciudad` | `TEXT` | Ciudad o zona (Coral Gables, Doral, Weston…) |
| `AGENTE` | `TEXT` | Asesor asignado (Nina, Jessi, Loli, Ana…) |
| `Odoo` | `TEXT` | Registro en CRM Odoo (SI N., SI J., No…) |
| `Fecha de Atencion` | `TEXT` | Fecha de primer contacto |
| `OBSERVACIONES ` | `TEXT` | Notas de seguimiento comercial *(espacio al final)* |
| `Fecha Última Gestión ` | `TEXT` | Fecha de última interacción *(espacio al final)* |
| `ULTIMA GESTION` | `TEXT` | Canal de último seguimiento (Llamada, WhatsApp…) |
| `ULTIMO AGENTE ` | `TEXT` | Asesor de último seguimiento *(espacio al final)* |
| `LANDING` | `TEXT` | Página o formulario de captura |
| `PROGRAMA INSCRIPCION` | `TEXT` | Programa donde la persona se inscribe (opcional) |
| `INTERESADO EN` | `TEXT` | Programa de interés (catálogo), solo informativo |
| `contact_id` | `BIGINT FK → lead_contacts.id` | Contacto único por teléfono normalizado |
| `whatsapp_message_id` | `TEXT` | Id de mensaje de Meta (idempotencia del webhook) |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación (default `now()`) |
| `updated_at` | `TIMESTAMPTZ` | Última actualización |
| `archived_at` / `archived_by` | `TIMESTAMPTZ` / `UUID` | Archivado (soft delete) |

### Tablas relacionadas

| Tabla | Descripción |
| :--- | :--- |
| `leads_historico` | Leads de 2025 de solo lectura (~4.3k filas), importados desde CSV. |
| `lead_notes` | Notas append-only por lead (agentes insertan; solo admin edita/borra vía RPC). |
| `lead_gestiones` | Historial append-only de cambios de gestión (escrito por trigger). |
| `lead_appointments` | Citas independientes por lead (con sede, estudiante, correo, edad). |
| `lead_appointment_events` | Historial de resultados y reprogramaciones de citas (actor + timestamps). |
| `lead_contacts` | Contacto único por teléfono normalizado (deduplicación). |
| `lead_catalogs` | Catálogos administrables (Mes, Campaña, Medio, Gestión, Agente). |
| `lead_program_enrollments` | Inscripciones por programa y nivel (alta/baja con historial). |
| `daily_report_notes` | Notas manuales del reporte diario por asesora y fecha. |
| `campaign_stats` / `campaign_period_stats` | Métricas de campañas por período. |
| `user_access` | Allowlist y autoridad de roles (la app no confía en metadata). |
| `agent_sessions` | Sesiones operativas de asesoras (inicio, actividad, cierre). |
| `authorize_bootstrap` | Bootstrap de autorización. |
| `webhook_rate_limit` | Rate limit del webhook de WhatsApp. |
| `push_subscriptions` | Suscripciones push (PWA). |

Todas las tablas relevantes tienen **RLS habilitado**. Existen tablas de backup (`_bkp_*`) no usadas por la app.

---

## ⚡ Edge Functions (Supabase)

| Función | Descripción |
| :--- | :--- |
| `authorize-user` | Autorización de acceso de usuarios. |
| `change-user-email` / `auth-email-change-probe` | Cambio de correo de usuario. |
| `meta-whatsapp-webhook` | Ingesta de leads desde WhatsApp (Meta), con idempotencia y rate limit. |
| `notify-lead-change` | Notificaciones de cambios en leads. |

---

## 🚀 Despliegue en Vercel

1. Haz un fork o sube este repositorio a tu cuenta de GitHub.
2. En tu panel de **Vercel** (`vercel.com`):
   - Haz clic en **"Add New Project"**.
   - Importa el repositorio `gestion-leads-sociedad`.
   - Vercel detectará la configuración estática/Vite y desplegará `index.html`.
3. ¡Listo! Tu panel estará disponible en una URL `*.vercel.app`.

Los headers de seguridad (CSP, COOP/COEP, etc.) están definidos en `vercel.json`.

---

## 💻 Ejecución local

El CSS de Tailwind se compila con Vite (ya no se usa el CDN de runtime), así que hay dos formas correctas de usar el panel:

**Desarrollo** (recarga automática al editar):

```bash
pnpm install

# Iniciar servidor local
pnpm dev
```

El panel estará disponible en `http://localhost:3000`.

**Archivo estático autocontenido** (sin servidor, para abrir directo o subir a cualquier alojamiento):

```bash
pnpm build
```

y abre `dist/index.html` en el navegador: lleva el CSS y el JavaScript incrustados.

> ⚠️ Abrir el `index.html` de la raíz del proyecto directamente ya no funciona: Tailwind necesita compilarse. Si lo haces, el propio panel muestra un aviso rojo con estas dos opciones.

---

## 🧪 Tests y calidad

```bash
# Typecheck + check de app
pnpm lint

# Solo check de app
pnpm check:app

# Tests (Node + Python)
pnpm test
```

- `scripts/check-app.mjs`: validaciones de la app (CSP, estructura, etc.).
- `scripts/tests/*.test.mjs`: tests de frontend/helpers.
- `scripts/tests/test_*.py`: tests de reportes y reconciliación.

---

## 🔐 Seguridad

- **RLS** habilitado en todas las tablas; la autoridad de roles vive en `user_access`, no en metadata del cliente.
- **CSP y headers** endurecidos (`vercel.json` + `scripts/csp-utils.mjs`).
- **Sesiones:** cierre por inactividad para asesoras; administrador/supervisor/trafficker no se desconectan por inactividad.
- **Archivado suave** (`archived_at` / `archived_by`) en leads.
- **Webhook de WhatsApp** con idempotencia (`whatsapp_message_id`) y rate limit.

---

## 📁 Estructura del proyecto

```
.
├── index.html              # App principal (SPA)
├── src/
│   ├── legacy/             # Lógica de la app (JS por módulo)
│   ├── citas-calendar.js
│   └── index.css
├── public/                 # Assets, PWA, fuentes
├── scripts/                # Build, checks, tests, reconciliación
├── supabase/
│   ├── functions/          # Edge Functions
│   └── migrations/         # Migraciones SQL (cronológicas)
├── odd/tasks/              # Registro de trabajo (ODD)
├── vercel.json             # Headers de seguridad
└── vite.config.ts
```

---

## 📝 Notas

- Los leads del mes de su fecha de llegada muestran una etiqueta verde "Nuevo".
- Los estados **Data Dura** (`INSCRITO DATADURA`, `AGENDADO DATADURA`) conservan el mes de origen del lead.
- Las citas se escriben y muestran en zona horaria de Miami (Doral/Weston).
- Los registros históricos de 2025 no admiten cambios desde la aplicación.