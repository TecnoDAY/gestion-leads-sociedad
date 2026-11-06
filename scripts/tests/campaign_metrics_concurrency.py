"""Public RPC race checks in the runner-owned, network-isolated PostgreSQL only."""
import json
import os
import select
import subprocess
import sys
import time

container = sys.argv[1]
assert container.startswith('crm-campaign-validation-'), 'Unexpected container'
info = json.loads(subprocess.check_output(['docker', 'inspect', container]))[0]
assert info['HostConfig']['NetworkMode'] == 'none'
assert not info['NetworkSettings']['Ports']
command = ['docker', 'exec', '-i', container, 'psql', '-X', '-Atq', '-h', '/tmp',
           '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=terse']
actor = '00000000-0000-4000-8000-000000000005'
claims = json.dumps({'sub': actor, 'role': 'authenticated'})
session = (f"begin; set local request.jwt.claim.sub='{actor}'; "
           f"set local request.jwt.claims='{claims}'; set local role authenticated; ")


def run(sql, authenticated=True):
    text = session + sql + '; commit;' if authenticated else sql
    p = subprocess.run(command, input=text, text=True, capture_output=True, timeout=15)
    assert (p.returncode, p.stderr) == (0, ''), (p.returncode, p.stdout, p.stderr)
    return p.stdout.strip()


def snapshot(campaign):
    return json.loads(run(f"select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') "
                          f"from public.list_campaign_metrics_v2('{campaign}') m"))


def insert(campaign, start, end):
    return f"public.insert_campaign_metric_v2('{campaign}','2026-11-{start:02d}','2026-11-{end:02d}',0,100,10)"


def correction(row_id):
    return f"public.correct_campaign_metric_v2('{row_id}','2026-11-15','2026-11-21',0,150,10,null,'Local race')"


def read_barrier(client, marker):
    output = b''
    deadline = time.monotonic() + 12
    while not output.endswith((marker + '\n').encode()):
        remaining = deadline - time.monotonic()
        assert remaining > 0, f'{marker} timeout'
        ready, _, _ = select.select([client.stdout], [], [], remaining)
        assert ready, f'{marker} timeout'
        chunk = os.read(client.stdout.fileno(), 65536)
        assert chunk, f'Client exited before {marker}'
        output += chunk
    return output.decode().splitlines()


def race(label, campaign, first_rpc, second_rpc):
    before = snapshot(campaign)
    clients = []
    app = 'campaign_race_b_' + campaign
    try:
        a = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
        clients.append(a)
        a.stdin.write((session + f"select to_jsonb(m) from {first_rpc} m; select 'READY';\n").encode())
        a.stdin.flush()
        lines = read_barrier(a, 'READY')
        assert len(lines) == 2 and lines[1] == 'READY', lines
        accepted = json.loads(lines[0])
        observer = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
        clients.append(observer)
        # Pin the regression: cache an activity view BEFORE writer B even exists.
        observer.stdin.write((f"begin; set local stats_fetch_consistency='snapshot'; "
                              f"select count(*) from pg_stat_activity where application_name='{app}'; "
                              "select 'OBSERVER_READY';\n").encode())
        observer.stdin.flush()
        assert read_barrier(observer, 'OBSERVER_READY') == ['0', 'OBSERVER_READY']
        b = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
        clients.append(b)
        b.stdin.write((session + f"set local application_name='{app}'; select to_jsonb(m) from {second_rpc} m; commit;\n").encode())
        b.stdin.flush()
        observer.stdin.write((f"""do $wait$ declare deadline timestamptz:=clock_timestamp()+interval '10 seconds';
        begin
          while not exists(select from pg_stat_activity where application_name='{app}'
            and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0) loop
            if clock_timestamp()>deadline then raise exception 'Second writer did not block'; end if;
            perform pg_stat_clear_snapshot();
            perform pg_sleep(0.01);
          end loop;
        end $wait$; commit;
        """).encode())
        observer.stdin.flush()
        out_o, err_o = observer.communicate(timeout=12)
        assert (observer.returncode, out_o, err_o) == (0, b'', b''), (observer.returncode, out_o, err_o)
        a.stdin.write(b'commit;\n')
        a.stdin.flush()
        out_a, err_a = a.communicate(timeout=12)
        assert (a.returncode, out_a, err_a) == (0, b'', b''), (a.returncode, out_a, err_a)
        out_b, err_b = b.communicate(timeout=12)
        assert (b.returncode, out_b, err_b) == (3, b'', b'ERROR:  overlapping_date_range\n'), (b.returncode, out_b, err_b)
        expected = sorted(before + [accepted], key=lambda r: r['id'])
        assert snapshot(campaign) == expected, 'Rejected writer mutated history or revisions'
        print(f'PASS: {label} serialized; rejected writer exit/stdout/stderr and unchanged history/revisions verified', flush=True)
    finally:
        for p in clients:
            if p.poll() is None:
                p.kill()
                p.communicate(timeout=5)


run(f"insert into auth.users(id,email) values('{actor}','concurrency@local.invalid'); "
    f"insert into public.user_access(user_id,email,nombre,role,activo) "
    f"values('{actor}','concurrency@local.invalid','LOCAL_CONCURRENCY','trafficker',true)", authenticated=False)
campaign = 'LOCAL_CONCURRENT_II'
race('insert/insert', campaign, insert(campaign, 1, 7), insert(campaign, 7, 14))
campaign = 'LOCAL_CONCURRENT_CI'
root = json.loads(run(f'select to_jsonb(m) from {insert(campaign, 1, 7)} m'))
race('correction/insert', campaign, correction(root['id']), insert(campaign, 15, 21))
campaign = 'LOCAL_CONCURRENT_CC'
first = json.loads(run(f'select to_jsonb(m) from {insert(campaign, 1, 7)} m'))
second = json.loads(run(f'select to_jsonb(m) from {insert(campaign, 8, 14)} m'))
race('correction/correction', campaign, correction(first['id']), correction(second['id']))
