#!/usr/bin/env bash
# Disposable PostgreSQL only: no network, ports, host mounts or image downloads.
set -euo pipefail
races_only=false
case "$#:${1:-}" in
  1:-h|1:--help) printf '%s\n' 'Usage: bash scripts/test-campaign-postgres.sh [--races-only]' 'Uses the cached PostgreSQL image; never accepts a remote database target.' '  --races-only  Run only the three concurrency cases after local schema setup.'; exit 0 ;;
  1:--races-only) races_only=true ;;
  0:) ;;
  *) printf '%s\n' 'Usage: bash scripts/test-campaign-postgres.sh [--races-only] (no database arguments accepted)' >&2; exit 2 ;;
esac
cd "$(dirname "$0")/.."
container="crm-campaign-validation-$(date +%s)-$$"
cleanup() {
  code=$?
  trap - EXIT
  if docker container inspect "$container" >/dev/null 2>&1; then
    docker stop --timeout 3 "$container" >/dev/null || code=1
    deadline=$((SECONDS + 15))
    while docker container inspect "$container" >/dev/null 2>&1; do
      if (( SECONDS >= deadline )); then
        printf 'Cleanup timed out: %s\n' "$container" >&2
        code=1
        break
      fi
      sleep 1
    done
  fi
  exit "$code"
}
trap cleanup EXIT
docker run --detach --rm --pull=never --name "$container" --network none \
  --read-only --memory 512m --cpus 1 --pids-limit 128 --user postgres \
  --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m,mode=1777 \
  --entrypoint /bin/sh public.ecr.aws/supabase/postgres:17.6.1.166 \
  -c 'initdb -D /tmp/campaign-data --auth=trust --no-locale -E UTF8 >/tmp/initdb.log && exec postgres -D /tmp/campaign-data -k /tmp -c listen_addresses= -c shared_buffers=32MB -c max_connections=15' >/dev/null
deadline=$((SECONDS + 20))
until docker exec "$container" pg_isready -h /tmp -U postgres >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then docker logs "$container"; exit 1; fi
  sleep 1
done
local_psql() { docker exec -i "$container" psql -X -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -v isolated_local=1 "$@"; }
local_psql -q < supabase/tests/local_auth_fixture.sql
local_psql -q < supabase/migrations/00000000000000_baseline.sql
local_psql -q <<'SQL'
insert into public.campaign_stats(campaign_name,anio,mes,estado,alcance,gasto,resultados)
values('LOCAL_HISTORY_ONLY',2026,'OCTUBRE','pausada',1234,200,20);
insert into public.campaign_period_stats(campaign_name,desde,hasta,alcance,gasto,resultados)
values('LOCAL_HISTORY_ONLY','2026-10-01','2026-10-07',456,100,10);
create table public.local_historical_snapshot as
select 'monthly' as source,to_jsonb(s) as snapshot from public.campaign_stats s
union all select 'period',to_jsonb(s) from public.campaign_period_stats s;
SQL
for migration in supabase/migrations/20261030000{1,2,3,4,5}_*.sql; do
  printf 'Local migration: %s\n' "$migration"
  local_psql -q < "$migration"
done
local_psql -Atq -c "select 'Empty new source before tests: '||count(*) from public.campaign_metrics_history_v2;"
if [[ "$races_only" == false ]]; then
  local_psql < supabase/tests/campaign_metrics_spend_cost.sql
  local_psql < supabase/tests/campaign_metrics_test.sql
fi
python3 scripts/tests/campaign_metrics_concurrency.py "$container"
printf 'PASS: campaign PostgreSQL checks (races_only=%s).\n' "$races_only"
