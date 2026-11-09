# Métricas de campaña por rangos

## Estado: corregido y probado solo en local; sin despliegue

El frontend y las migraciones siguen en el árbol local, sin commit ni push de campañas. La cadena completa se aplica y se prueba únicamente en PostgreSQL 17.6 desechable, sin red ni puertos publicados. **No se accedió a Supabase real, no se modificaron históricos reales ni se hizo backfill.** La autorización actual no incluye aplicar migraciones fuera del entorno local.

- `202610300004_campaign_metrics_spend_cost.sql`: migración pendiente corregida del modelo de importe/coste; no se cambian los RPC v1 ni las tablas históricas.
- `202610300005_campaign_metrics_author_names.sql`: listado aditivo de autores, dependiente de 0004. El panel y el informe usan `list_campaign_metrics_with_authors_v2`.
- Estos archivos se validan como cadena nueva desde el baseline. **Si un entorno ya tiene otra versión de 0004 aplicada, no se debe reejecutar este archivo ni asumir que actualiza esa tabla**: antes hace falta verificar su esquema y preparar una migración de actualización explícitamente autorizada.

## Reproducir las pruebas SQL aisladas

Requisitos: Docker ya iniciado y la imagen local `public.ecr.aws/supabase/postgres:17.6.1.166`. No se instalan paquetes ni se descargan imágenes.

```bash
bash scripts/test-campaign-postgres.sh --help
bash scripts/test-campaign-postgres.sh
# Solo las carreras, sin repetir las aserciones secuenciales:
bash scripts/test-campaign-postgres.sh --races-only
```

El ejecutor no acepta destinos de base de datos. Crea un contenedor con red `none`, sin montajes del host, sistema raíz de solo lectura, datos temporales en RAM y límite de 512 MB/una CPU; lo elimina tanto al terminar como al fallar. No cambia el arranque del servicio Docker. Usa un socket Unix dentro del contenedor, no el puerto de Supabase local ni un frontend configurado contra servicios remotos.

1. Crea roles y funciones de autenticación ficticias con `supabase/tests/local_auth_fixture.sql`.
2. Aplica el baseline; siembra históricos ficticios y guarda su instantánea antes de aplicar 0001–0005.
3. Ejecuta `campaign_metrics_spend_cost.sql` sobre los RPC v2 con rol `authenticated`, comprobaciones RLS, errores y conservación del historial ante rechazos.
4. Ejecuta `campaign_metrics_test.sql` como regresión separada de los RPC v1, con sesión activa y rollback.
5. Ejecuta `campaign_metrics_concurrency.py`: dos escritores reales en casos inserción/inserción, corrección/inserción y corrección/corrección. El observador toma deliberadamente una instantánea de actividad antes de que exista el segundo escritor; debe refrescarla mientras espera el bloqueo real, antes de liberar la primera transacción. Así la prueba no depende de que ambos procesos arranquen justo a tiempo. Exige del segundo escritor código 3, stdout vacío, error exacto de solapamiento e historial/revisiones sin cambios adicionales.

Cualquier aserción fallida produce un código distinto de cero. `npm test` no ejecuta estas pruebas PostgreSQL; sí ejecuta las pruebas Node y Python habituales. `npm run lint` y `npm run build` siguen siendo comprobaciones separadas.

## Cálculos y correcciones

| Regla | Comportamiento |
|---|---|
| Entrada principal | Importe y coste por resultado; resultados aproximados = importe / coste. |
| Precisión | `numeric` sin escala fija en importe, coste y resultados. No se recorta el cociente a cuatro decimales al almacenar ni al agregar. La presentación puede abreviar decimales; una división periódica sigue teniendo la precisión finita de PostgreSQL/JavaScript. |
| Validación | Importe y coste son obligatorios, finitos y no negativos. Importe positivo requiere coste positivo; ambos cero producen cero. Leads opcionales y alcance no admiten negativos. |
| Fechas reales | Desde el 1 de noviembre de 2026, también exigido por los RPC. Octubre se prueba únicamente en la demo aislada o en regresiones v1 de la base desechable. |
| Mes completo | Suma de bloques vigentes completamente contenidos, sin marcar prorrateo. CPL ponderado = importe total / resultados totales. |
| Intersección parcial | Prorrateo por días inclusivos, marcado como estimado. |
| Leads Meta opcionales | Separados de los resultados derivados y del CRM. Un total incompleto se muestra no disponible. Nunca se suman Meta y CRM ni se inventan tolerancias. |
| Corrección | Añade una fila con motivo, autor y referencia a la raíz; no modifica ni borra filas anteriores. |
| Vigencia | Revisión por raíz, creciente incluso al corregir una versión antigua. Solo la última aporta al agregado y admite nueva corrección en el panel. Las fechas antiguas no reviven cuando cambia el rango. |
| Solapamiento | Ambas escrituras se serializan con el mismo bloqueo transaccional por campaña; comparan contra los rangos vigentes, incluidas las correcciones. Un rango liberado sí puede reutilizarse. |

Los RPC públicos v2 conservan sus nombres y parámetros. Las filas incorporan `revision` para ordenar versiones sin depender de timestamps iguales; el lector interno `current_campaign_metrics_v2` no es ejecutable por clientes. La demo usa la misma semántica de vigencia y solapamiento, sin llamadas remotas.

El alcance no se presenta en tabla, cabecera, resumen ni CSV, pero su columna y sus datos se conservan; el panel conserva el alcance al corregir. Los históricos mensuales y por períodos siguen siendo de solo lectura en la interfaz. Para rangos sin fuente CRM equivalente se muestra no disponible, no una cifra mensual reutilizada.

## Sesión, permisos y autores

No hay selector ni suplantación de rol. La edición exige una sesión activa de `admin`, `trafficker` o `supervisor`; `agente` solo consulta. La restricción se prueba también en los RPC, no únicamente ocultando controles. Las mutaciones directas de la tabla están revocadas para `authenticated`, y usuarios inactivos no pueden leer por RPC ni por RLS. Los nombres de sesión, autores y motivos se renderizan como texto.

El panel muestra `window.currentAccess.nombre`; si falta, muestra **Sesión no disponible**. En demo, cada escritura toma el identificador y nombre de esa sesión, nunca del payload. En real, el listado une `created_by` con los autores de `user_access`, tras comprobar usuario activo. Un nombre ausente usa el UUID conservado; sin UUID, `—`. No se concede acceso a un directorio general.

`p_campaign_name = null` permite listar las métricas que necesita el informe. PUBLIC y anon no reciben ejecución del listado. La demo se activa únicamente en loopback con `?campaignDemo=1`, usa memoria aislada y no concede automáticamente permisos.

## Límites de la evidencia

La fixture modela claims con funciones locales: **no demuestra Supabase Auth, JWT firmados, PostgREST ni compatibilidad con el esquema desplegado**. Las pruebas DOM/RPC simuladas tampoco sustituyen una prueba visual de navegador. El dictamen independiente y cualquier revisión nativa se registran en `odd/tasks/campanas-rangos.md`; no se deducen de que la migración compile ni autorizan un despliegue. La revisión independiente confirmó las 52 aserciones SQL, la regresión v1 y las pruebas de frontend, pero la nueva ejecución independiente de las carreras corregidas está pendiente de autorizar su copia aislada en el directorio temporal del sistema. La corrección del observador tiene RED/GREEN local determinista; no equivale todavía a ese dictamen independiente final. La evaluación nativa tampoco estuvo disponible por un binario de paquete ausente.
