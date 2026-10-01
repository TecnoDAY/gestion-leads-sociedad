# Reconciliacion de leads reales 2026

## Objetivo

Comparar la hoja real `Leads Entrantes` con `public.leads`, restaurar solo diferencias con identidad suficientemente corroborada y dar de alta el lote aprobado mediante el flujo nativo de contactos.

## Problema y por que

El CSV no contiene el ID del CRM. Tiene 5.917 candidatos frente a 5.817 leads remotos, telefonos repetidos, filas sin telefono utilizable, duplicados y valores ambiguos. Vaciar/reimportar rompería IDs y relaciones; emparejar solo por telefono puede unir personas distintas.

## Alcance

- Parser reproducible del CSV con 44 columnas y comillas dobles correctas.
- Snapshot read-only de leads con IDs, fingerprints y campos protegidos.
- Clasificacion: equivalente, restaurable con clave solida, probable, ambiguo y sin coincidencia.
- Informe privado del delta exacto; sin PII en Git ni en el chat.
- Aplicacion posterior solo del lote aprobado. Para las altas, se acepta expresamente que el trigger nativo añada un contacto nuevo por teléfono nuevo.

Fuera de alcance: borrar ausentes, fusionar duplicados, corregir fechas/Mes por inferencia, importar otras hojas, tocar credenciales, citas, notas, gestiones, historico, catalogos, usuarios o campañas, y modificar contactos preexistentes.

## Restricciones

- El CSV fuente es `~/Descargas/Gestion Sociedad Actoral  2026 - Leads Entrantes.csv` (fuera del repo) y su SHA-256 esperado es `14a24c5b8740af8bc4309b8a911d02e0cb93c35601e72c4b60609c08cabbe6ba`.
- Ningún dato personal se versiona. Informes con PII viven fuera del repo con permisos `0600`.
- No actualizar `Telefono` en el lote de restauracion. En las altas aprobadas, el trigger puede crear 60 contactos nuevos, pero no modificar contactos preexistentes.
- No commit, push o deploy sin petición explícita.

## No romper

- IDs, `created_at`, `updated_at`, `contact_id`, `archived_at`, `archived_by` y `whatsapp_message_id` existentes.
- Contenido completo de todas las tablas salvo las 60 altas en `public.leads` y los 60 contactos nuevos generados por su trigger.
- Triggers, RLS, funciones y relaciones existentes.
- Leads archivados y leads ausentes del CSV.

## TDD

Modo: off | Fuente: default | Runner: pruebas Node con datos sintéticos + `npm test && npm run lint && npm run build && git diff --check`.

## Tareas

- [x] **T1 Cruce reproducible.** Parser/clasificador stdlib sin PII embebida; reproduce inventario/categorías contra el snapshot aprobado y rechaza output dentro del repo.
- [x] **T2 Informe privado.** Manifiesto agregado y CSV privados generados con permisos 0600; 467 sólidos separados de 16 probables, 436 ambiguos y 110 sin coincidencia.
- [x] **T3 Preflight de aplicacion.** Snapshot fresco sin drift, actor SQL sin UID, triggers verificados y transaccion de ensayo completa con ROLLBACK.
- [x] **T4 Aplicacion controlada.** Aprobada por el humano: 467 UPDATE selectivos sin Telefono ni campos protegidos; transaccion auto-verificable aplicada y comprometida.
- [x] **T5 Altas y excepciones.** Insertados solo los 60 nuevos aprobados: teléfono y nombre+campaña ausentes en DB, teléfono no duplicado de forma ambigua, con campaña Doral canónica. El trigger creó 60 contactos nuevos y ninguna fila preexistente cambió. Los demás casos siguen en revisión.
- [x] **T6 Verificacion del lote restaurado.** Comparacion fresca: 467 diferencias sólidas reducidas a cero; conteos de tablas no objetivo intactos y gates locales en verde. Excepciones/altas siguen T5.
- [x] **T7 Lote final: 39 altas + 5 correcciones de campaña.** Reglas aprobadas: teléfono = contacto; SN no bloquea; consulta distinta con teléfono existente se enlaza al mismo contacto; Repetido excluye. 39 altas (29 nuevos teléfonos, 3 sin teléfono, 7 contacto existente) + 5 campañas corregidas en una transacción atómica única.

## Criterios de aceptacion

- [x] El clasificador reproduce 5.917 candidatos, el inventario remoto vigente y las categorías verificadas sin depender del orden.
- [x] Ninguna fila ambigua/probable se escribe automáticamente; las altas proceden solo del sublote aprobado de sin coincidencia.
- [x] Cada UPDATE conserva ID y campos protegidos y modifica exclusivamente campos aprobados.
- [x] Todas las tablas no objetivo mantienen hash de contenido idéntico; `lead_contacts` solo recibe las 60 altas autorizadas.
- [x] Ningún dato personal aparece en Git, logs del chat o documentación.
- [x] El lote añade exactamente 60 leads activos y 60 contactos, restaura ambas secuencias tras el ensayo y deja intactas todas las filas preexistentes y tablas no autorizadas.

## Decisiones aceptadas

- Sincronizacion selectiva en vez de truncate/reimport.
- Los 4.888 equivalentes no se escriben.
- Los 16 fallback requieren revision humana; los 436 ambiguos y 110 sin coincidencia no se consideran altas automáticamente.
- Mes y fechas dudosas se conservan como fuente; no se corrigen por inferencia.
- El humano aprobó 60 altas con teléfono, aceptó la creación nativa de contactos y el mapeo `Kids Doral Ingles` → `Kids doral inglés`.
- El humano definió la regla de negocio definitiva: el teléfono normalizado es la identidad del contacto; el nombre (incluido `SN`) no bloquea altas; una consulta distinta con teléfono existente crea un lead nuevo enlazado al mismo contacto; `Repetido` excluye la fila.

## Reutilizacion investigada

- `title_case_text`, `normalize_agent_name`, `normalizePhone` y `parseFechaLead` son las reglas canónicas de comparación.
- Los fingerprints remotos permiten guardas de concurrencia sin descargar credenciales ni tablas ajenas.
- No se crea una dependencia ni un sistema de importación nuevo.

## Evidencia

- Comparación read-only verificada independientemente: 4.888 solo formato, 483 modificados probables (467 clave completa + 16 fallback), 436 ambiguos y 110 sin coincidencia.
- Snapshot remoto estable a `2026-10-01 17:11:27Z`: 5.817 leads, fingerprint `cb0cf1fe10a56b7b815f4dceb6536381`.
- `scripts/reconcile_leads.py`: parser estándar (`doublequote=True`), SHA del CSV obligatorio, índices de unicidad en ambos conjuntos completos, fechas DMY/ISO validadas y output privado fuera del repo.
- `scripts/tests/test_reconcile_leads.py`: 7/7 passed (match sólido, fallback, duplicados, teléfono vacío, fecha inválida, privacidad y calendario). Integrado en `npm test`.
- Ejecución real: `/tmp/opencode/reconcile-leads-2026/`, directorio 0700 y 6 ficheros 0600. `summary.json` reproduce 5.917/5.817, full5355/camp10/name6, formato4888, restore467, fallback16, ambiguos436, unmatched110 y 11 IDs DB sin candidato.
- Informes privados: `strong-restores.csv` (467 registros + encabezado; puede tener líneas físicas adicionales por saltos en texto), `fallback-review.csv`, `ambiguous-review.csv`, `unmatched-review.csv`; `manifest.json` contiene sus SHA-256. No están en Git.
- Gates posteriores: npm test 175/175 Node + 7/7 Python, lint, build y diff-check passed.
- Autorizacion humana posterior a revisar el informe: aplicar solo los 467 matches sólidos; excluir Telefono/campos protegidos y mantener intactos fallback/ambiguos/unmatched.
- Payload privado `strong-apply.json`: 467 IDs únicos, fingerprints crudos por fila, cambios no vacíos y 0 claves Telefono; 349.728 bytes. No se versiona.
- Preflight remoto `2026-10-01 17:24:48Z`: postgres, `auth.uid()` nulo, 5.817 leads y fingerprint sin drift `cb0cf1fe10a56b7b815f4dceb6536381`. Triggers efectivos: normalización general; contacto solo INSERT/UPDATE OF Telefono; historial solo UPDATE OF GESTION y función ignora actor nulo.
- Primera generación del SQL fue rechazada por PostgreSQL en análisis por placeholders locales no interpolados; no hubo ejecución ni cambios. Generador privado corregido y validado estáticamente antes de reintentar.
- Ensayo completo con `ROLLBACK`: 467 filas encontradas, fingerprints/archivado comprobados, targets aplicados temporalmente, campos protegidos idénticos y hashes completos de todas las otras tablas públicas idénticos. Resultado tras rollback: 5.817/5.810, fingerprint original.
- Aplicacion: mismo SQL salvo COMMIT; SHA-256 `1dc53efb853e7b5b989626a51d1031c372a8c45391f26cf78b24414fbb7cbda6`. Resultado: 5.817 leads, 5.810 activos, fingerprint nuevo `81fdb3305f909ef56cb34fbf3a0463d0`. La transaccion habría abortado ante drift, campo protegido o side effect.
- Comparacion post-aplicacion contra snapshot fresco: full5355, fallback16, formato5355, strong_restore0, ambiguos436, unmatched110; prueba que las 467 diferencias sólidas desaparecieron y las excepciones permanecieron intactas.
- Verificacion post: contactos4955, notas7, gestiones11, citas8, eventos14, historico4348, catalogos63, campaign_stats0 y notas diarias0; mismos conteos de baseline. Durante la transaccion se compararon hashes completos, no solo conteos.
- Informe post sin PII adicional en `Descargas/Revision Leads 2026/post-apply-summary.json` (0600), SHA-256 `df7adb21bac62c4f00a43af39cb43ed856a4bda7256d0ae16c777f540960570b`.
- Analisis de altas: de 110 sin coincidencia se excluyeron 15 con teléfono ya existente, 29 con nombre+campaña existente, 3 sin teléfono y 3 filas repetidas/duplicadas internamente. Lote aprobado: 60 teléfonos únicos; 12 campañas Doral canonizadas y 28 agentes `Jessi` normalizados por el trigger a `Jessica`.
- Dos errores se detectaron antes de escribir: `leads.id` es identidad `ALWAYS` (resuelto con IDs explícitos y `OVERRIDING SYSTEM VALUE`) y el primer SQL privado contenía un alias inválido (PostgreSQL lo rechazó en análisis, sin ejecución). La regla local Doral también se corrigió después para que el clasificador no genere 11 fallback falsos.
- Ensayo completo con `ROLLBACK`: creó temporalmente 60 leads y 60 contactos, verificó valores/enlaces, filas preexistentes y hashes de todas las otras tablas; restauró `leads_id_seq=5825` y `lead_contacts_id_seq=4966`. Estado posterior idéntico: 5.817/5.810 leads y 4.955 contactos.
- Aplicacion de altas: SQL privado SHA-256 `bb308024a06a96ff437e89b7ffa4f981081144e173a48fc670515d867391b8bc`; resultado 5.877 leads, 5.870 activos, 5.015 contactos y fingerprint leads `1383356b3aa58b46ec052c2d10b73c4d`.
- Verificacion remota `2026-10-01 18:03:20Z`: IDs 5826..5885 activos y enlazados (60/60), campaña canónica 12/12, Jessica 28/28; secuencias alineadas (`leads=5885`, `contacts=5026`). Notas7, gestiones11, citas8, eventos14, histórico4348, catálogos63, estadísticas0 y notas diarias0 permanecen iguales; la transacción comparó hashes completos.
- Comparacion post-alta: full5414, format_only5411, strong_restore0, fallback16, ambiguos438 y unmatched49. El incremento de 2 ambiguos y la reducción de 61 unmatched reflejan las filas fuente duplicadas que ahora encuentran candidato; no hubo una alta adicional. El selector no propone más altas (`approved_candidates=0`).
- Informe agregado post-alta `Descargas/Revision Leads 2026/post-insert-summary.json` (0600), SHA-256 `71671819e84ca4c01f7bba1aa2cff484b731789398e9bdac7d415bfedb74fae4`.
- Gates finales: `npm test` 175/175 Node + 10/10 Python, `npm run lint`, `npm run build` y `git diff --check` correctos. QA/risk/reliability sin hallazgos del cambio; `qa-gate` solo avisa del `.env.example` ya rastreado y ajeno a esta tarea.
- Lote final 2026-10-01: nuevas reglas de negocio aprobadas — el teléfono normalizado (7-15 dígitos) es la identidad de contacto; el nombre (incluido `SN`) no bloquea altas; consulta distinta con teléfono existente crea lead nuevo sobre el mismo contacto; `Repetido` excluye. Selector extendido con pruebas 11/11.
- Payload final generado sobre snapshot fresco sin drift (5.877 leads, fingerprint `1383356b3aa58b46ec052c2d10b73c4d`): 39 altas (29 teléfono nuevo, 3 sin teléfono, 7 contacto existente) + 5 actualizaciones de solo Campaña; excluidos 8 repetidos con teléfono existente y 2 duplicados internos repetidos.
- Errores detectados y corregidos antes de escribir: sentencia `IF FALSE` fuera de bloque DO y alias inválido en el SELECT del INSERT; PostgreSQL los rechazó en análisis sin ejecutar. Además, un test local esperaba la regla antigua (excluir nombre repetido) y se actualizó a la regla aprobada.
- Ensayo completo con `ROLLBACK`: 5 updates + 39 inserts verificados; contactos existentes solo reutilizados (nombre/ciudad/teléfono visible nunca reemplazados, `updated_at` permitido en los 7 reutilizados); hashes de todas las demás tablas idénticos; secuencias restauradas (leads=5885, contacts=5026).
- Aplicación en una única transacción atómica, SQL privado SHA-256 `074c51e13992268daf2832625d072553ade7a4ce6fe08486ca3fea1c37837c07`: resultado 5.916 leads totales, 5.909 activos, 5.044 contactos; fingerprint leads `af004548604bfaa6ac494cfb9843398a`.
- Verificación remota `2026-10-01 18:48:46Z`: 36 nuevos enlazados a contacto (29+7), 3 con `contact_id` nulo, 39 activos; secuencias alineadas (`leads=5924`, `contacts=5062`); notas7, gestiones11, citas8, eventos14, histórico4348, catálogos63, estadísticas0 y notas diarias0 sin cambios.
- Comparación post-final: full5455, fallback11 (bajaron 5 aplicados), strong_restore0, unmatched9 (1 de los excluidos por repetido halló candidato entre las nuevas altas — comportamiento esperado), nuevas altas elegibles=0. Informe agregado `Descargas/Revision Leads 2026/post-final-summary.json` (0600), SHA-256 `b68c562d1a359422654621524180b031df4c7497c7722b6edbd56822dee24864`.
- Pendiente de revisión humana: 11 fallback complejos y ambiguos restantes; 10 repetidos quedaron excluidos a propósito.
- Corrección de Mes aprobada por el humano 2026-10-01: 42 filas `Septiembre 4` → `Septiembre` (todas con Fecha de septiembre 2026) y el lead 5327 `Jess` → `Agosto` (mes de la fila anterior: id 5326 con Mes `Agosto` y misma Fecha 26/08/2026). Transacción con guardas de pre/post-conteo; `Septiembre` quedó en 468 (426+42), total 5.916 intacto, sin cambios en contactos ni otras tablas.
- Bug de gráficos históricos (código, no datos): `renderHistoricalAnalytics` buscaba `monthlyStats[m]` con la etiqueta visible (`SEPTIEMBRE 2025`) en vez de la clave (`2025-09`), lanzando excepción y vaciando todos los gráficos. Fix: usar `activeMonths` para los datos y `monthLabels` solo como etiqueta; las comprobaciones de `window.Chart` y el aviso se movieron tras KPIs/tabla para que el panel funcione aunque el CDN falle. Regresión cubierta por 2 tests nuevos que instancian los 8 gráficos con canvas/`Chart` sintéticos (npm test 177/177 + 11/11 Python, lint, build y diff-check OK).
- Bug "mes duplicado" en el modal Nuevo Lead: la opción estática `SEPTIEMBRE` coexistía con la canónica `Septiembre` del catálogo porque `fillSelectFromCatalog` comparaba valores sensibles a mayúsculas. Fix: clave de comparación `trim().toLocaleLowerCase('es')` que migra la selección al valor canónico y solo añade el valor actual si no tiene equivalente. Regresión cubierta con 1 test (npm test 178/178 + 11/11 Python, lint, build, diff-check OK).

## Progreso

- Estado: T1-T6 completadas, incluidas las 39 altas y 5 correcciones del lote final. Sin borrados; contactos existentes solo completados en campos vacíos por el trigger nativo.
- Última tarea: lote final atómico aplicado y verificado (5.916/5.909 leads, 5.044 contactos, strong_restore=0).
- Siguiente paso: decisión humana sobre los 11 fallback complejos y los ambiguos restantes; no se aplicarán automáticamente.
- Bloqueos: ninguno para el lote aprobado. La regla de contacto es: teléfono = contacto único; lead nuevo conserva consultas anteriores.
