# Reporte diario: el bloque de llamadas sin desglose de nuevos y gestionados

## Objetivo
En la tarjeta "Detalle de gestion" del reporte diario, el sub-bloque **Llamadas** muestra solo sus tres categorias (Llamadas del dia, Llamadas Data Dura y Llamada WhatsApp) y el total de llamadas. Se retiran las filas "Llamadas nuevas hoy" y "Llamadas gestionadas hoy", que confundian porque se confundian con las categorias de canal.

## Problema y por que
El equipo leia el bloque de llamadas como si "Llamadas nuevas hoy" fuera una categoria mas de canal, cuando en realidad es un reparto de tipo de evento (alta vs seguimiento) sobre las mismas llamadas. Con tres categorias de canal mas el total, esas dos filas no aportan y generan lecturas equivocadas (p. ej. pensar que hay mas llamadas de las que muestra el total).

## Alcance
Incluye:
- `src/legacy/reportes.js`: filas del sub-bloque Llamadas en `detallesBloqueHtml`.
- `src/legacy/help.js`: parrafo de ayuda del reporte diario.
- Tests de `scripts/tests/reporte-diario-detalle.test.mjs` y `scripts/tests/daily-report-arrival-sql.test.mjs`.

Excluye:
- El CSV diario: conserva sus 36 columnas, incluidas "Llamadas nuevos hoy" y "Llamadas gestionados hoy" (contrato con el equipo).
- La RPC `daily_management_report`, los conteos, la particion de canales y el KPI "Total llamadas".
- El grupo de WhatsApp de la tarjeta, que si sigue mostrando nuevos, gestionados y total.
- La validacion de integridad (`detalleGestionHoy`): la UI sigue invocando el helper del grupo llamadas, por lo que conteos invalidos o nuevos > total bloquean la pantalla y el CSV igual que antes.

## Restricciones
- No cambiar calculos, consultas ni base de datos.
- Mantener el orden pedido: Llamadas del dia, Llamadas Data Dura, Llamada WhatsApp, Total llamadas.
- `Total llamadas` sigue viniendo de `detalleGestionHoy(b, 'llamadas').total` (total validado), no de una suma cruda.

## No romper
- Invariante por bloque: `whatsapp.total + llamadas.total = gestured = canales.total`.
- `canales` sigue siendo una particion excluyente.
- El bloque de WhatsApp de la tarjeta conserva sus 3 filas y sus valores.
- El CSV conserva sus 36 columnas y su cabecera; sus columnas de nuevos/gestionados de llamadas siguen pobladas.
- La UI sigue bloqueando (aviso `role="alert"`) y el CSV rechazando la descarga ante conteos invalidos o nuevos > total.
- Tests existentes: siguen pasando salvo los que fijaban la presencia de las dos filas retiradas.

## TDD
- Modo: on
- Fuente: default
- Runner: `npm test`; focalizado `node --test scripts/tests/reporte-diario-detalle.test.mjs scripts/tests/daily-report-arrival-sql.test.mjs`.

## Tareas
- [x] T1 RED: los asserts nuevos fallan con el codigo anterior (2 tests en rojo) y con el orden de filas desordenado.
- [x] T2 GREEN: retirar las dos filas en `detallesBloqueHtml` y actualizar los tests.
- [x] T3 Ayuda: parrafo coherente con la pantalla y con el CSV.
- [x] T4 Suite completa, lint, build y QA.
- [x] T5 Revision independiente del diff.

## Criterios de aceptacion
- [x] El sub-bloque Llamadas muestra exactamente 4 filas: Llamadas del dia, Llamadas Data Dura, Llamada WhatsApp, Total llamadas.
- [x] El orden de esas 4 filas es el pedido (verificado con assert explicito).
- [x] No aparece ninguna fila de nuevos/gestionados de llamadas en la tarjeta.
- [x] El bloque de WhatsApp, Procedencia, Canales y Citas quedan intactos.
- [x] `Total llamadas` = 33 + 0 + 22 = 55 en el caso de referencia; el KPI y el CSV siguen cuadrando.
- [x] La UI sigue bloqueando y el CSV rechazando ante conteos invalidos o nuevos > total.
- [x] `npm test` (728 Node + 11 Python) y `npm run lint` en verde; `npm run build` OK; qa-gate estricto en verde.

## Decisiones aceptadas
- La retirada es solo de pantalla: el CSV mantiene el desglose de nuevas y gestionadas de llamadas porque su cabecera es un contrato con el equipo.
- La UI sigue llamando a `detalleGestionHoy(b, 'llamadas')` aunque ya no muestre nuevos/gestionados: `total` validado y garantia de que la UI y el CSV rechazan la misma data incoherente.
- La ayuda aclara que el CSV si mantiene ese desglose, para que la asimetria sea explicita.

## Reutilizacion investigada
- Implementacion canonica: `detallesBloqueHtml` (`src/legacy/reportes.js`), que ya construia las cuatro tarjetas del bloque por asesora; no hizo falta logica nueva.
- `filasDetalle` y `tablaDetalle` reutilizadas tal cual: solo cambia el array de filas del sub-bloque.
- Alternativa descartada: ocultar las filas con CSS o con un flag -> deja las filas en el DOM y rompe la asertacion de ausencia y la lectura por lectores de pantalla. Se eliminan del markup.
- Alternativa descartada: quitar tambien las columnas del CSV -> rompe el contrato de 36 columnas acordado con el equipo.

## Revision independiente (T5)
Veredicto: PASS CON OBSERVACIONES, ninguna bloqueante. Confirmado: orden y contenido exactos del sub-bloque, ninguna fila eliminada por error en los otros bloques, balance de canales intacto, origen de los valores correcto, validacion fail-closed conservada en UI y CSV, ayuda coherente, ningun otro consumidor de esas dos filas en el repo (el bundle de `dist/` es artefacto local ignorado por git).

Observaciones atendidas:
- Tests: se anade assert explicito del ORDEN de las 4 filas (verificado en rojo al inyectar un orden desordenado).
- Tests: se unifica el conteo de filas en `/<tr>/g` (antes `/<tr/g` mas laxo) y la negativa pasa a comprobar el HTML completo, no solo el slice.
- Tests: se corrige un typo en el comentario ("se retired" -> "se retiró").
- Ayuda: se aclara que el CSV mantiene el desglose de nuevas y gestionadas.

Observaciones informativas (no tocadas, fuera de alcance):
- El mensaje de error "Llamadas nuevos supera el total" ya no tiene una fila que lo explique en pantalla y oculta tambien las filas de WhatsApp: comportamiento fail-closed preexistente.
- `odd/tasks/reporte-diario-detalle-whatsapp-combinado.md` describe la subseccion de llamadas como "N/G/T": documento historico de solo lectura, no se altera.

## Evidencia
- T1 passed: con `src/legacy/reportes.js` en su version anterior, `node --test scripts/tests/reporte-diario-detalle.test.mjs scripts/tests/daily-report-arrival-sql.test.mjs` -> 2 tests en rojo. Con el orden de las 4 filas inyectado desordenado -> 2 tests en rojo (el assert de orden detecta el desorden).
- T2 passed: `src/legacy/reportes.js` y los dos ficheros de test actualizados; focalizado en verde (9/9).
- T3 passed: `src/legacy/help.js` actualizado; el parrafo nombra las tres categorias, el total, la ausencia de desglose y la aclaracion sobre el CSV.
- T4 passed: `npm test` -> 728 Node + 11 Python, 0 fallos; `npm run lint` (tsc + check-app) OK; `npm run build` OK (dist/ reconstruido, ignorado por git); `bash ~/.config/opencode/scripts/qa-gate.sh --strict` exit 0 con los cambios staged.
- T5 passed: revision independiente read-only del diff, veredicto PASS CON OBSERVACIONES; observaciones informative atendidas.
- Render verificado con datos de referencia: Llamadas del dia 33, Llamadas Data Dura 0, Llamada WhatsApp 22, Total llamadas 55, sin filas de nuevos/gestionados.

## Progreso
- Estado: implementado y verificado en LOCAL. Sin commit, sin push, sin despliegue.
- Bundle reconstruido en `dist/` (ignorado por git): falta publicar el frontend para que el cambio llegue al navegador.
- Siguiente paso: decision del usuario sobre commit/push y publicacion.
