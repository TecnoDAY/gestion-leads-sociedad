# Consolidación de migraciones Supabase (pendiente)

> Contexto: auditoría detectó que las 82 migraciones no son autocontenidas
> (`supabase db reset` falla porque `public.leads` no se crea en ninguna migración).
> Este documento es un checklist para consolidarlas en una sola migración base.

## Prerequisitos

- CLI de Supabase instalada y autenticada (`supabase login`).
- Docker corriendo (`sudo systemctl start docker`).
- Proyecto vinculado (`supabase link --project-ref hkkuyomlcqyxtzblowle`).
- Working tree limpio (todo commiteado).

## Flujo

### 1. Extraer el DDL actual de producción (en tu máquina local)

> ⚠️ Este paso requiere la CLI autenticada y Docker corriendo.
> Ejecutar en tu máquina, NO en el sandbox del agente.

```fish
# Asegurar Docker corriendo
sudo systemctl start docker

# Extraer DDL completo del esquema public (excluyendo tablas de backup)
supabase db dump --linked --schema public \
  --exclude public._bkp_lead_gestiones_20260926 \
  --exclude public._bkp_leads_20261005 \
  -f /tmp/baseline.sql

# Verificar que se generó
wc -l /tmp/baseline.sql
head -20 /tmp/baseline.sql
```

> Nota: si el dump incluye `revoke` statements para anon/authenticated,
> son esperados (confirman que no tienen acceso). Pueden ignorarse en el diff.

Esto genera el DDL completo (tablas, columnas, constraints, índices, RLS, funciones, triggers).

### 2. Revisar y limpiar el dump

Abrir `/tmp/baseline.sql` y:

- [ ] Verificar que contiene `CREATE EXTENSION IF NOT EXISTS "btree_gist"` (necesario para el constraint EXCLUDE USING gist de campaign_period_stats). Si no está, agregarlo manualmente al inicio.

- [ ] Eliminar líneas `SET` y `SELECT pg_catalog.set_config(...)`.
- [ ] Eliminar `CREATE EXTENSION` si ya están en el schema por defecto.
- [ ] Verificar que `CREATE TABLE public.leads (...)` está completo.
- [ ] Verificar que todas las RLS policies están incluidas.
- [ ] Verificar que todas las funciones RPC están incluidas (con `CREATE OR REPLACE FUNCTION`).
- [ ] Verificar que los triggers están incluidos.
- [ ] Eliminar `OWNER TO` statements (Supabase los gestiona).

### 3. Crear la migración base

```fish
# Crear directorio de archivo para migraciones antiguas
mkdir -p supabase/migrations/archive

# Mover las 82 migraciones antiguas
mv supabase/migrations/2026*.sql supabase/migrations/archive/

# Copiar el dump limpio como migración base
cp /tmp/baseline.sql supabase/migrations/00000000000000_baseline.sql
```

### 4. Verificar que la baseline crea todo desde cero

```fish
supabase db reset
```

Debe completarse sin errores. Si falla, revisar el SQL del dump.

### 5. Verificar cero drift

```fish
supabase db diff --linked
```

Debe mostrar **sin cambios** (o solo diferencias triviales como comentarios). Si muestra diferencias, ajustar la baseline.

### 6. Verificar que los tests siguen pasando

```fish
npm test
npm run lint
npm run build
```

### 7. Commitear

```fish
git add supabase/migrations/
git commit -m "chore(db): consolidar 82 migraciones en baseline única"
git push origin main
```

## Rollback

Si algo falla, las migraciones originales están en `supabase/migrations/archive/`. Restaurar:

```fish
mv supabase/migrations/archive/*.sql supabase/migrations/
rm supabase/migrations/00000000000000_baseline.sql
```

## Notas

- La tabla `leads` se crea en la baseline (no en las migraciones originales).
- Las migraciones de datos (imports de leads histórico) también deben incluirse en la baseline o documentarse por separado.
- El archivo `supabase/migrations/README.md` puede necesitar actualización.
- No tocar las Edge Functions ni los secretos.
- Hacer backup de la BD antes de aplicar cambios en producción.

## Estado

- [ ] DDL extraído
- [ ] DDL limpiado
- [ ] Migración base creada
- [ ] db reset exitoso
- [ ] db diff sin drift
- [ ] Tests verdes
- [ ] Commiteado y pusheado
