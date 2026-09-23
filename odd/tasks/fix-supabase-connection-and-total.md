# Fix conexion Supabase y total de leads

## Objetivo

Corregir la conexion del dashboard con Supabase y mostrar el total real de registros de `public.leads`, sin confundirlo con el limite de 1.000 filas devueltas por la API.

## Problema y por que

La URL configurada en `index.html` tiene un caracter omitido, provocando `ERR_NAME_NOT_RESOLVED`. La consulta actual carga como maximo 1.000 filas, por lo que `allLeads.length` no representa el total de la base de datos.

## Alcance

- Corregir la URL publica de Supabase.
- Consultar el conteo exacto con `head: true`.
- Usar ese conteo para el badge `TOTAL BD` y su subtitulo.
- Mantener la carga actual de filas y el comportamiento existente.
- Verificar build y consulta de conteo.

## Restricciones

- No usar la secret key en frontend.
- No migrar el dashboard a React en esta tarea.
- No cambiar tabla, politicas RLS ni esquema.

## No romper

- Lectura, insercion, actualizacion y Realtime existentes.
- IDs HTML y funciones globales del dashboard.
- La publishable key actual.

## TDD

Modo: off
Fuente: default
Runner: no disponible; se usaran checks de build y revision funcional del flujo.

## Tareas

- [x] T1. Corregir URL y separar conteo exacto de filas cargadas.
- [x] T2. Verificar build y consistencia del diff.
- [x] T3. Revisar cambios con verificador independiente y cerrar evidencia.

## Criterios de aceptacion

- [x] La URL es `https://hkkuyomlcqyxtzblowle.supabase.co`.
- [x] El conteo usa `select('*', { count: 'exact', head: true })`.
- [x] `TOTAL BD` usa el conteo exacto, no `allLeads.length`.
- [x] La publishable key no cambia y no aparece ninguna secret key.
- [x] `npm run build` termina correctamente.
- [x] El diff no contiene cambios fuera de alcance.

## Decisiones aceptadas

- Usar una consulta de conteo independiente es el cambio minimo para mostrar 5.810 sin exigir cargar todos los registros.
- La paginacion completa de tabla, filtros y graficos queda fuera de esta tarea.

## Reutilizacion investigada

- Se reutiliza la consulta y el estado existentes en `index.html`.
- No se agrega dependencia nueva ni se migra a React.

## Evidencia

- Estado: passed. La API respondio HTTP 200 con la URL corregida y confirmo `content-range: 0-0/5810`. Se agrego una consulta independiente con conteo exacto (`head: true`) en paralelo a la carga de filas y el estado `Supabase en vivo` ahora muestra `totalDatabaseCount`. El build y `git diff --check` pasaron; el verificador confirmo que no hay secret key ni cambios fuera de alcance. Permanece un warning preexistente de Vite sobre `__dirname`.

## Progreso

Estado: ready-to-commit
Ultima tarea: T3 verificada; `totalDatabaseCount` alimenta el badge `TOTAL BD`, el subtitulo KPI y el texto de conexion `Supabase en vivo`.
Siguiente paso: commit y push autorizados por el usuario.
