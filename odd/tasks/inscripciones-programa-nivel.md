# Inscripciones por programa y nivel (Teatro Musical / Actuacion)

## Objetivo
Poder registrar y seguir por programa y nivel las personas inscritas, con
historial, para reportar la evolucion de las inscripciones por semana, mes o
trimestre.

## Problema y por que
El CRM solo guardaba el estado `INSCRITO` (o `INSCRITO DATADURA`) en `leads`.
No habia forma de saber en que programa y nivel esta la persona, ni cuando se
inscribio, ni que paso con las que dejaron el programa. Los reportes contaban
personas, no inscripciones, y no permitian medir la evolucion.

## Alcance
Incluye:
- Tabla `lead_program_enrollments` (una fila = una inscripcion de una persona
  en un programa) con indice unico parcial: una inscripcion vigente por
  programa y persona.
- RPC `save_lead_enrollments`: valida programa/nivel, cierra (no borra) lo
  retirado, conserva el historial de cambios de nivel y de bajas, y exige
  sesion CRM activa.
- Seccion "Inscripcion" en los formularios de alta y de edicion: visible solo
  para `INSCRITO` e `INSCRITO DATADURA`.
- Reglas: una persona puede estar en los dos programas; un nivel vigente por
  programa; la fecha de inscripcion la declara la asesora y puede quedar
  pendiente de completar.
- Reporte por periodo con el desglose por programa y nivel y descarga CSV de
  inscripciones (una fila por inscripcion).

Excluye: pagos, horarios y gestion academica. No se reconstructe un
historial que no existe: los inscritos anteriores quedan "pendientes de
completar" y la asesora los completa con la fecha que conozca.

## Reglas acordadas
1. Programa y nivel son obligatorios al pasar a inscrito.
2. Una persona puede estar en Teatro Musical, en Actuacion o en los dos.
3. Un solo nivel vigente por programa; cambiar de nivel cierra la fila
   anterior y abre la nueva (historial conservado).
4. La fecha de inscripcion la introduce la asesora si la conoce; si no, queda
   pendiente de completar (nunca se inventa una fecha).
5. Completar hoy una inscripcion antigua NO cuenta como inscripcion nueva de
   hoy: los reportes agrupan por `fecha_inscripcion`, no por `created_at`.
6. Si la persona deja de estar inscrita, sus inscripciones se cierran (no se
   borran) y la persona sigue inscrita si conserva otro programa.
7. Si deja de estar inscrita del todo, sus inscripciones se cierran con motivo
   `cambio_estado`.

## No romper
- Contratos RPC de `create_lead`, `update_lead_followup`, `update_lead_full`,
  `update_lead_with_appointment` y `management_period_summary`.
- Golden de fase 34 (`fixtures/fase34-golden.json`): el payload del lead no
  cambia; las inscripciones van en su propia RPC.
- Suite actual: 683 Node + 22 Python; `npm run check:app`; `npm run build`.

## TDD
Modo: on (nuevas reglas puras en `src/legacy/inscripciones.js` con test
propio en `scripts/tests/inscripciones.test.mjs`). Runner: `npm test`.

## Tareas
- [x] T1 Reglas puras: programas, niveles, deteccion de inscrito, validacion de fecha y payload (`src/legacy/inscripciones.js`).
- [x] T2 Test de las reglas puras (`scripts/tests/inscripciones.test.mjs`, 18 casos).
- [x] T3 Migracion `202610200001_lead_program_enrollments.sql`: tabla, indice unico, RLS y RPC de guardado.
- [x] T4 Migracion aplicada en remoto y verificada: tabla, RPC, indice, politica y permisos (solo `authenticated`).
- [x] T5 UI: seccion de inscripcion en alta y edicion, visible solo para inscritos.
- [x] T6 Guardado: alta y edicion validan y envian la inscripcion; cambio de estado cierra lo retirado.
- [x] T7 Arneses de test actualizados (`t5-frontend-edge.test.mjs`, `formularios-lead.test.mjs`).
- [x] T8 Reporte por periodo: desglose por programa y nivel + CSV de inscripciones.
  - Migracion `202610200002_lead_enrollments_report.sql`: RPC `lead_enrollments_report`
    (personas vs inscripciones, por programa/nivel, por mes, pendientes, altas, bajas y
    cambios de nivel) y `lead_enrollments_detail` (filas para el CSV).
  - Card "Inscripciones por programa y nivel" en el reporte por periodo, con su boton
    de descarga CSV (una fila por inscripcion, telefono como texto y estado de la fecha).
  - El trafficker no ve la seccion (sin PII).
- [x] T9 Organizacion visual de la seccion: una tarjeta por programa (casilla y
  nombre arriba; nivel y fecha debajo, al mismo ancho, apilados en movil),
  explicacion corta, el error de nivel junto a su campo y solo tras intentar
  guardar, aviso de baja cuando se desmarca un programa ya guardado, y borde
  rojo del select con error en ambos temas (`.inscripcion-campo-error`).
- [x] T10 Correccion de la visibilidad de los campos: el markup usaba el
  atributo `hidden` y el codigo quitaba la clase `hidden` (mismo nombre, distinto
  mecanismo), asi que marcar un programa no mostraba Nivel ni Fecha. Ahora solo
  se usa la propiedad `hidden`. El aviso de baja salia de dentro del bloque
  oculto: se movio fuera. Test propio `scripts/tests/inscripcion-dom.test.mjs`
  (8 casos, con mini-DOM) que reproduce el fallo; verificado que falla con el
  codigo anterior y pasa con el corregido.
- [x] T11 Mejora visual de la seccion: panel propio (`.inscripcion-panel`) con
  icono, titulo y explicacion en una sola linea; una tarjeta por programa con
  marca (TM/AC), acento propio (emerald = Teatro Musical, indigo = Actuacion)
  que se marca al activarla, chip "Sin fecha" mientras falte la fecha y sin el
  texto repetido en cada tarjeta. Verificado con render en Chromium en tema
  claro y oscuro.
- [x] T12 Mejora visual de los modales de lead (alta y edicion): cabecera con
  icono mas grande, nombre del lead destacado con ID y campana, chip del estado
  actual (verde si esta inscrito) que se actualiza al cambiar el desplegable,
  titulo de seccion con icono, boton de ayuda junto a la etiqueta (antes se
  solapaba con el texto) y chips "automatico" en los campos de solo lectura en
  lugar de repetir la misma frase debajo. Verificado con render en Chromium.
- [x] T13 Reduccion y embellecimiento de la ficha del lead: un 20% mas
  pequena (ancho 880 -> 704 px, rellenos, tarjetas, secciones), cabecera con
  icono mayor, avatar con la inicial del lead, icono por dato (telefono,
  campana, medio, asesores, ultima gestion) y por seccion.
- [x] T14 Vista rapida de inscritos en el dashboard: al pulsar "Inscritos", la
  lista muestra una etiqueta por programa (TM verde / AC indigo) con su nivel, en
  una sola linea y sin duplicar a la persona. Sin datos: "Inscripcion pendiente
  de completar"; cargando y error se distinguen. Una sola consulta por conjunto
  de leads visibles (el token descarta respuestas antiguas si cambia el filtro)
  y recarga al guardar una inscripcion. En movil la columna ocupa el ancho
  completo con su etiqueta. La campana sigue en las demas prioridades.
- [x] T15 Endurecimiento de la vista rapida de inscritos: la consulta usa la
  misma seleccion que se pinta (ocho personas, historico excluido), asi que solo
  se consulta a quien se ve. Tras un error no hay reintentos automaticos (se
  ofrece "Reintentar"). Las respuestas se descartan si cambia el filtro, se
  cierra la sesion o cambia el usuario. Al guardar una inscripcion (alta o
  edicion) se invalidan las etiquetas. La campana se conserva como dato
  secundario en la vista de inscritos.

## Criterios de aceptacion
- La seccion de inscripcion no aparece para estados distintos de inscrito.
- No se puede guardar un inscrito sin programa y nivel (validacion en cliente y en servidor).
- Una persona puede tener los dos programas a la vez, con un nivel vigente en cada uno.
- La fecha puede quedar vacia (pendiente) y el reporte la muestra como pendiente, sin atribuirla a un periodo.
- Retirar un programa o dejar de estar inscrito conserva el historial: nada se borra.
- Los reportes existentes no cambian sus totales.

## Verificacion
- `npm test`: 714 Node (712 pasan; 2 fallos preexistentes y ajenos a esta
  feature: `openDashboardAppointmentsDetail` y el aviso `aria-live` del
  reporte) + 22 Python OK.
- `npm run check:app` OK; `npm run build` OK.
- Remoto: tabla, RPC, indice unico parcial, politica RLS y permisos verificados
  con consultas de solo lectura; la RPC falla cerrado sin sesion CRM.
- Ambas migraciones aplicadas en remoto (`lead_program_enrollments`,
  `lead_enrollments_report`); solo `authenticated` puede ejecutarlas.
