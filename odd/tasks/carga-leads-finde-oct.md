# Carga de leads del finde 2-5 octubre 2026

## Objetivo

Cargar en `public.leads` los 63 registros del CSV `leads nuevos del 4,5,6 de octubre - Hoja 1.csv` (fechas reales 2, 3, 4 y 5 de octubre de 2026) sin duplicar: lo que ya existe con mismo teléfono y fecha se actualiza, el resto se inserta.

## Problema y por que

Por errores del sistema la asesora no pudo revisar el fin de semana; sus 63 gestiones solo viven en un CSV. La asesora hizo pruebas y ya introdujo 2 de esos leads en el sistema (ids 5959 y 5961), por lo que una carga ingenua duplicaria. `public.leads` no tiene constraint unico de negocio (solo `whatsapp_message_id`), asi que `ON CONFLICT` no sirve y la dedup debe hacerse en la propia migracion.

## Alcance

- Generar `supabase/migrations/202610050003_import_leads_finde_oct.sql` con Python desde el CSV (patron de `202609240005-7_import_leads_historico_2025_*`).
- Backup `_bkp_leads_20261005` de los 2 leads que se actualizan.
- Dedup idempotente por teléfono (digitos) + Fecha normalizada; teléfono vacío/invalido usa tel+fecha+nombre.
- Aplicacion en Supabase y verificacion posterior.

Fuera de alcance: `lead_gestiones`, `lead_notes`, citas, contactos existentes (el trigger `leads_set_contact_id` crea los suyos), RLS, triggers, catalogos, histórico, borrar o archivar leads, commit/push/deploy.

## Restricciones

- Fuente: `/home/miguel/Descargas/leads nuevos del 4,5,6 de octubre  - Hoja 1.csv` (63 filas, 17 columnas, UTF-8, separador coma).
- Clave de dedup: `regexp_replace(Telefono,'\D','')` + `Fecha` normalizada (sin cero a la izquierda del día); filas sin teléfono válido usan nombre como tercera parte de clave.
- Fecha almacenada en formato `DD/MM/YYYY` (exigido por el RPC; el CSV usa `d/mm/aaaa`).
- Campaña canónica del catálogo: `Kids Doral Ingles` → `Kids doral inglés`; el resto ya casan (el trigger `trg_leads_normalize_catalog_columns` normaliza mayúsculas).
- Sin PII en logs del chat ni en documentación fuera de la migración.
- No commit, push ni deploy sin peticion explicita.

## No romper

- IDs, `created_at`, `updated_at`, `contact_id`, `archived_at`, `archived_by`, `whatsapp_message_id` de leads existentes (los 2 UPDATE conservan id).
- Leads ajenos a las claves del CSV: ninguno puede cambiar.
- Triggers, RLS, funciones, RPC y catálogos existentes.
- Tablas no objetivo: `lead_contacts` solo recibe contactos nuevos que crea su propio trigger; el resto intactas.

## TDD

Modo: off | Fuente: default | Runner: no hay suite para migraciones SQL; verificacion funcional obligatoria por queries de conteo y anti-duplicados antes/después (se registra en Evidencia).

## Tareas

- [x] **T1 Generar la migracion.** Script Python local (stdlib) que limpia, normaliza, fusiona duplicados internos (pares identicos colapsan; Teresita y Diana se fusionan conservando `Información`) y emite el SQL con backup + staging + UPDATE/INSERT idempotente con asserts.
- [x] **T2 Preflight read-only.** 5.960 leads, 0 claves duplicadas en 2-5/10/2026, exactamente 2 claves existentes (5959, 5961), 0 archivados en rango, backup inexistente, catalogos usados todos activos.
- [x] **T2b Ensayo con ROLLBACK.** Transaccion completa ejecutada y revertida: asserts pasaron y la BD quedo intacta (5.960 leads, sin tabla backup).
- [x] **T3 Aplicar la migracion.** `apply_migration` `import_leads_finde_oct` → `success: true`.
- [x] **T4 Verificacion.** Todos los checks en verde (ver Evidencia).
- [x] **T5 Idempotencia.** Re-ejecucion en transaccion con ROLLBACK: sin excepcion (59 UPDATE / 0 INSERT, claves 59/59).

## Criterios de aceptacion

- [x] El SQL contiene exactamente 59 tuplas de datos (63 menos 4 colapsadas): 2 claves ya existentes, 57 altas nuevas.
- [x] Tras aplicar: `count(leads) = 6017`; en el rango 2-5/10/2026 hay 93 leads y 93 claves distintas → cero duplicados.
- [x] Los ids 5959 y 5961 conservan su id y reflejan el CSV; `lead_gestiones` sin cambios (87) y solo 59 leads tocados (57 creados + 2 actualizados).
- [x] Re-ejecutar el SQL no duplica nada (idempotencia verificada en ensayo: 0 altas).
- [x] `_bkp_leads_20261005` existe con las 2 filas originales (Mangui Herrera / obs original "Tiene 4 años").

## Decisiones aceptadas

- Dedup por teléfono+fecha (aprobado por el humano).
- Teresita Alvear y Diana: fusionar en 1 lead conservando `Información`, constancia en `OBSERVACIONES` (aprobado).
- Filas con teléfono `SN`: se insertan igualmente como leads sin teléfono (aprobado).
- Historial `lead_gestiones` no se escribe: los triggers requieren `auth.uid()` y solo 84/5.960 leads lo tienen (patrón de todas las cargas previas).
- Backup `_bkp_leads_20261005` antes de los 2 UPDATE (patrón `_bkp_lead_gestiones_20260926`).

## Reutilizacion investigada

- Patron de import: `supabase/migrations/202609240005-7_import_leads_historico_2025_*.sql` (Python stdlib genera VALUES, transaccion, guard por si ya hay datos) → reutilizado.
- RPC `create_lead`/`create_lead_record` descartados: exigen `auth.uid()` activo y en forzarian `AGENTE`.
- Triggers que se disparan solos en INSERT directo: `trg_leads_normalize_catalog_columns`, `leads_set_contact_id`; `leads_record_gestion` y `set_lead_gestion_meta` se saltan sin `auth.uid()` (deseado).

## Evidencia

- Analisis previo: 63 filas, 5 pares telefono+fecha duplicados (2 identicos, 1 invalido con 2 personas distintas, 2 fusiones aprobadas), 2 claves ya en BD.
- T1: passed | comando: generador Python stdlib sobre el CSV | salida: "63 -> 59 claves -> colapsadas 1 -> finales 59"; fusiones: Teresita (Informacion), Diana (Informacion+campana Weston), Raymond (sin nota, solo diferia Medio/Fecha de Atencion).
- T2: passed | `execute_sql` read-only | total_leads=5960, claves_duplicadas=0, coincidencias=2 (ids 5959,5961), archivados_en_rango=0, backup_ya_existe=false, catalogos usados todos active=true.
- T2b: passed | ensayo completo con `rollback;` via `execute_sql` | salida `[]` (sin excepcion → asserts de 2 UPDATE / 57 INSERT / 59-59 claves cumplidos); tras rollback total=5960, backup_existe=false.
- T3: passed | `apply_migration` name=`import_leads_finde_oct` (project via MCP) | `{"success": true}`; `list_migrations` registra 27 migraciones con la nuestra entre ellas.
- T4: passed | `execute_sql` read-only | total_leads=6017, creados=57, actualizados=2, claves_duplicadas=0, claves_distintas=93=leads_en_rango, backup_filas=2, gestion_vacia=1 (id 4397, preexistente, ajeno al lote), lead_gestiones=87 sin cambios, contactos 5079→5125 (+46 creados por el trigger nativo), 0 fuera de catalogo en campana/gestion/medio/mes/agente, 0 archivados, fecha_mal_formato=0, mes_incorrecto=0.
- T4 detalle UPDATE: 5959 `Mangui Herrera`→`Mangi Herrera` y obs `Tiene 4 años`→`Tiene niña de 4 años`; 5961 conserva nombre/obs y gana `Fecha de Atencion=5/10/2026`. Ambos conservan id.
- T4 fusiones: Teresita id 6052 (Información/Locos adams), Raymond id 6072 (Vive lejos/Taller camara, unica fila), Diana id 6077 (Información/Taller camara); Horacio id 6056 y Onna id 6055 como leads separados con telefono `SN`.
- T5: passed | re-ejecucion de la migracion completa con `rollback;` | salida `[]` (sin excepcion: v_upd=59, v_ins=0, 59/59 claves).

### Errores detectados y corregidos en T1/T3

- [x] Typo `_csv_leades` en el `FROM` del INSERT → regenerado.
- [x] Nombres de columna reales con espacio final (`"OBSERVACIONES "`, `"Fecha Última Gestión "`, `"ULTIMO AGENTE "`) → mapeo `DB_COL` añadido.
- [x] `tel` de las 2 filas `SN` salia como `NULL` → el match daba NULL y una reejecucion las habria duplicado; corregido a `''`.
- [x] Corrupcion por `re.sub` con lambda y `\1` octal (caracteres `\x01\x02` y perdida de fecha/nombre en 2 filas) → filas reparadas y verificacion sin caracteres de control.
- [x] Assert `v_upd = 2` rompia la reejecucion (serian 59) → asserts en `{2,59}` / `{0,57}` mas control de estado final 59/59.
- [x] Nota de fusion se anadia tambien a Raymond, cuya unica diferencia era Medio/Fecha de Atencion → nota limitada a cambio real de gestion o campana.
- Descartado tras investigar: el formato `Fecha` sin rellenar (`5/10/2026`) no rompe nada — el informe diario solo extrae el año con `substring(p_fecha from '(19|20)[0-9]{2}')` y el rollup acepta `[0-9]{1,2}` en dia y mes.

- Cierre: passed | verificacion final antes del commit | total=6017, mis 57 leads ids 6026-6082 todos con el mismo `created_at` (2026-10-05 21:42:09), duplicados=0, claves_distintas=93=leads_en_rango, archivados_en_rango=0, backup=2, `lead_gestiones` de mis 2 UPDATE = 0 (sin historial, como estaba disenado).
- Atribucion de actividad ajena: los leads 5954-5968 creados/actualizados despues de mi carga y las 11 `lead_gestiones` nuevas pertenecen a la asesora Jessica usando la app (todas con `autor_user_id`), no al lote; la app seguia funcionando con normalidad tras la migracion.
- qa-gate: passed | exit=0 | 186 lineas anadidas, sin secretos, comentarios marcados ni catch vacios; unico aviso `.env.example` preexistente y no staged.

## Progreso

Estado: completado | Ultima tarea: cierre | Siguiente paso: ninguno (commit de la carga hecho) | Bloqueos: ninguno
