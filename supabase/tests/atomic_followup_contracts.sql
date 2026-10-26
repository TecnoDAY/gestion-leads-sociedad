-- SOLO en una base LOCAL AISLADA con esquema completo y correctiva aplicada.
-- NO ejecutar en remoto ni sobre leads reales. Crea fixtures y termina ROLLBACK.
-- Ejemplo: psql -X -v ON_ERROR_STOP=1 -v isolated_local=1 -h 127.0.0.1
--   -p 54322 -U postgres -d postgres -f supabase/tests/atomic_followup_contracts.sql
-- No es una prueba de concurrencia ni de idempotencia tras timeout de red.
-- Los casos "solo par" envian SOLO esas dos claves: NO reproducen el payload
-- completo de leadUpdateFields ni la fecha que el modal inicializa a hoy.
-- Esa UI aun puede registrar una gestion: pendiente decision UX y prueba E2E.
\set ON_ERROR_STOP on
\if :{?isolated_local}
\if :isolated_local
\else
\echo 'ABORT: isolated_local debe ser 1; nunca usar una base compartida/remota.'
\quit 3
\endif
\else
\echo 'ABORT: requiere -v isolated_local=1 y una base local aislada.'
\quit 3
\endif

begin;
set local search_path = public, pg_temp;

-- Helpers de prueba, solo en pg_temp y dentro de esta transaccion.
create function pg_temp.call_followup_route(route text, lead_id bigint, fields jsonb, advisor uuid)
returns public.leads language plpgsql as $$
begin
  case route
    when 'followup' then return public.update_lead_followup(lead_id, fields);
    when 'full' then return public.update_lead_full(lead_id, fields);
    when 'appointment' then
      return public.update_lead_with_appointment(
        lead_id, jsonb_build_object('GESTION', 'Agendado') || fields,
        now() + interval '1 day', 'fixture', advisor,
        '{"student_name":"Alumno fixture","contact_email":"alumno@example.invalid","student_age":18}'::jsonb,
        'WESTON'
      );
    else raise exception 'unknown_test_route';
  end case;
end;
$$;

create function pg_temp.expect_followup_error(route text, lead_id bigint, fields jsonb, advisor uuid, expected_state text, expected_message text)
returns void language plpgsql as $$
begin
  begin
    perform pg_temp.call_followup_route(route, lead_id, fields, advisor);
  exception when others then
    if sqlstate <> expected_state or sqlerrm <> expected_message then
      raise exception 'Expected %/%, got %/% (route=%, fields=%)', expected_state, expected_message, sqlstate, sqlerrm, route, fields;
    end if;
    return;
  end;
  raise exception 'Expected error %/% but call succeeded (route=%, fields=%)', expected_state, expected_message, route, fields;
end;
$$;

do $$
declare
  actor uuid := gen_random_uuid();
  advisor uuid := gen_random_uuid();
  route text;
  actor_role text;
  lead_id bigint;
  contact_id bigint;
  counter integer := 0;
  fixture_phone text;
  baseline public.leads;
  saved public.leads;
  pair jsonb := '{"proxima_accion":"Llamar","fecha_seguimiento":"2028-02-29"}'::jsonb;
  invalid_case record;
  before_count bigint;
  appointment_count bigint;
  event_count bigint;
  fixture_appointment_id bigint;
begin
  -- Privilegios efectivos, no solo inspeccion textual de GRANT/REVOKE.
  if has_function_privilege('authenticated', 'public.update_lead_with_appointment(bigint,jsonb,timestamptz,text,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.update_lead_with_appointment(bigint,jsonb,timestamptz,text,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.update_lead_with_appointment(bigint,jsonb,timestamptz,text,uuid,jsonb)', 'EXECUTE') then
    raise exception 'Legacy appointment overload exposed';
  end if;
  if not has_function_privilege('authenticated', 'public.update_lead_with_appointment(bigint,jsonb,timestamptz,text,uuid,jsonb,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.update_lead_full(bigint,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.update_lead_followup(bigint,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.update_lead_full(bigint,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.update_lead_followup(bigint,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.update_lead_with_appointment(bigint,jsonb,timestamptz,text,uuid,jsonb,text)', 'EXECUTE') then
    raise exception 'Canonical RPC permissions changed';
  end if;

  insert into auth.users(id, email) values (actor, actor::text || '@example.invalid'), (advisor, advisor::text || '@example.invalid');
  insert into public.user_access(user_id, email, nombre, role, activo)
  values (actor, actor::text || '@example.invalid', 'Actor fixture', 'admin', true),
         (advisor, advisor::text || '@example.invalid', 'Asesora fixture', 'agente', true);
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);

  -- Ejercita cada ruta como admin y las rutas CRM tambien como agente.
  foreach actor_role in array array['admin', 'agente'] loop
    update public.user_access set role = actor_role where user_id = actor;
    foreach route in array array['followup', 'full', 'appointment'] loop
      if actor_role = 'agente' and route = 'full' then continue; end if;
      counter := counter + 1;
      fixture_phone := '1999555010' || counter::text;
      if exists(select 1 from public.lead_contacts where phone_normalized = fixture_phone) then
        raise exception 'Fixture phone collision: use a fresh isolated database';
      end if;
      insert into public.leads("Nombre", "Telefono", "GESTION", "OBSERVACIONES ")
      values ('SN', fixture_phone, 'Información', 'Original') returning * into baseline;
      lead_id := baseline.id;
      contact_id := baseline.contact_id;
      if contact_id is null then raise exception 'Contact fixture not linked by real trigger'; end if;
      select count(*) into before_count from public.lead_gestiones where lead_gestiones.lead_id = baseline.id;

      -- Fallos por valores (no basta que existan ambas claves), tipos, ISO y limite.
      for invalid_case in
        select * from (values
          ('{"proxima_accion":"Llamar"}'::jsonb, 'followup_pair_required'),
          ('{"fecha_seguimiento":"2028-02-29"}'::jsonb, 'followup_pair_required'),
          ('{"proxima_accion":"Llamar","fecha_seguimiento":null}'::jsonb, 'followup_pair_required'),
          ('{"proxima_accion":" ","fecha_seguimiento":"2028-02-29"}'::jsonb, 'followup_pair_required'),
          ('{"proxima_accion":null,"fecha_seguimiento":"2028-02-29"}'::jsonb, 'followup_pair_required'),
          ('{"proxima_accion":"Llamar","fecha_seguimiento":""}'::jsonb, 'followup_pair_required'),
          ('{"proxima_accion":"Llamar","fecha_seguimiento":"29/02/2028"}'::jsonb, 'fecha_seguimiento_invalida'),
          ('{"proxima_accion":"Llamar","fecha_seguimiento":"2027-02-29"}'::jsonb, 'fecha_seguimiento_invalida'),
          ('{"proxima_accion":"Llamar","fecha_seguimiento":"2028-04-31"}'::jsonb, 'fecha_seguimiento_invalida'),
          ('{"proxima_accion":"Llamar","fecha_seguimiento":"infinity"}'::jsonb, 'fecha_seguimiento_invalida'),
          ('{"proxima_accion":"Llamar","fecha_seguimiento":"2028-2-9"}'::jsonb, 'fecha_seguimiento_invalida'),
          ('{"proxima_accion":true,"fecha_seguimiento":"2028-02-29"}'::jsonb, 'followup_string_required'),
          ('{"proxima_accion":[],"fecha_seguimiento":"2028-02-29"}'::jsonb, 'followup_string_required'),
          ('{"proxima_accion":"Llamar","fecha_seguimiento":20280229}'::jsonb, 'followup_string_required'),
          (jsonb_build_object('proxima_accion', repeat('a', 201), 'fecha_seguimiento', '2028-02-29'), 'proxima_accion_too_long')
        ) as cases(fields, message)
      loop
        perform pg_temp.expect_followup_error(route, lead_id,
          invalid_case.fields || '{"OBSERVACIONES":"No debe persistir","Nombre":"No persistir"}'::jsonb, advisor, '22023', invalid_case.message);
        select * into saved from public.leads where id = lead_id;
        if to_jsonb(saved) is distinct from to_jsonb(baseline)
           or (select nombre from public.lead_contacts where id = contact_id) is distinct from 'SN'
           or (select count(*) from public.lead_gestiones where lead_gestiones.lead_id = baseline.id) <> before_count
           or exists(select 1 from public.lead_appointments where lead_appointments.lead_id = baseline.id) then
          raise exception 'Partial mutation after rejection: %/%', route, invalid_case.message;
        end if;
      end loop;

      perform pg_temp.expect_followup_error(route, lead_id, pair || '{"Nombre":" "}'::jsonb, advisor, '22023', 'nombre_required');
      perform pg_temp.expect_followup_error(route, lead_id, pair || '{"Telefono":"123"}'::jsonb, advisor, '22023', 'telefono_invalido');
      if route = 'followup' or actor_role = 'agente' then
        perform pg_temp.expect_followup_error(route, lead_id, pair || '{"AGENTE":"Otro"}'::jsonb, advisor, '22023', 'followup_fields_only');
      elsif route = 'full' then
        perform pg_temp.expect_followup_error(route, lead_id, pair || '{"id":1}'::jsonb, advisor, '22023', 'protected_fields');
      else
        perform pg_temp.expect_followup_error(route, lead_id, pair || '{"id":1}'::jsonb, advisor, '22023', 'full_edit_fields_only');
      end if;

      if route = 'appointment' then
        -- Un fallo posterior al guardado del par tambien debe revertir todo.
        begin
          perform public.update_lead_with_appointment(lead_id,
            pair || '{"GESTION":"Agendado","Nombre":"No persistir"}'::jsonb,
            now() + interval '1 day', '', advisor, '{}'::jsonb, 'INVALID');
          raise exception 'Expected campus_invalid but call succeeded';
        exception when sqlstate '22023' then
          if sqlerrm <> 'campus_invalid' then raise; end if;
        end;
        select * into saved from public.leads where id = lead_id;
        if to_jsonb(saved) is distinct from to_jsonb(baseline)
           or (select nombre from public.lead_contacts where id = contact_id) is distinct from 'SN'
           or (select count(*) from public.lead_gestiones where lead_gestiones.lead_id = baseline.id) <> before_count
           or exists(select 1 from public.lead_appointments where lead_appointments.lead_id = baseline.id) then
          raise exception 'Appointment failure left a partial mutation';
        end if;
      end if;

      saved := pg_temp.call_followup_route(route, lead_id, pair || '{"Nombre":"Nombre corregido"}'::jsonb, advisor);
      if saved.proxima_accion is distinct from 'Llamar' or saved.fecha_seguimiento is distinct from date '2028-02-29'
         or (select nombre from public.lead_contacts where id = contact_id) is distinct from 'Nombre corregido' then
        raise exception 'Followup/contact not persisted: %', route;
      end if;
      -- Nombre por si solo NO es un evento de gestion; full/cita conservan
      -- el UPDATE comercial canonico, que SI registra exactamente una gestion.
      if (select count(*) from public.lead_gestiones where lead_gestiones.lead_id = baseline.id)
         <> before_count + case when route = 'followup' then 0 else 1 end then
        raise exception 'Unexpected management event count: %', route;
      end if;
      if route = 'appointment' then
        select count(*), min(id) into appointment_count, fixture_appointment_id
        from public.lead_appointments where lead_appointments.lead_id = baseline.id;
        if appointment_count <> 1 or not exists (
          select 1 from public.lead_appointments where id = fixture_appointment_id and campus = 'WESTON'
          and student_name = 'Alumno fixture' and contact_email = 'alumno@example.invalid' and student_age = 18
           -- Contrato vigente: solo admin puede elegir otra asesora.
           and advisor_user_id is not distinct from case when actor_role = 'admin' then advisor else actor end
        ) then raise exception 'Appointment/details/campus contract lost'; end if;
        select count(*) into event_count from public.lead_appointment_events where lead_appointment_events.appointment_id = fixture_appointment_id;
        if event_count <> 1 then raise exception 'Unexpected appointment events'; end if;
        if actor_role = 'admin' then
          -- Misma ruta prioritaria de la UI: campos exclusivos admin + sede.
          select count(*) into before_count from public.lead_gestiones where lead_gestiones.lead_id = baseline.id;
          saved := public.update_lead_followup_with_appointment_campus(lead_id,
            pair || jsonb_build_object('Nombre', 'Nombre corregido', 'Telefono', fixture_phone,
              'GESTION', 'Agendado', 'ULTIMA GESTION', 'Llamada', 'OBSERVACIONES', 'Cambio admin+sede',
              'Odoo', 'admin-fixture', 'LANDING', 'https://example.invalid/admin-campus'),
            fixture_appointment_id, 'DORAL');
          if saved."Odoo" is distinct from 'admin-fixture' or saved."LANDING" is distinct from 'https://example.invalid/admin-campus'
             or saved.proxima_accion is distinct from 'Llamar' or saved.fecha_seguimiento is distinct from date '2028-02-29'
             or not exists(select 1 from public.leads where id = lead_id and "Odoo" = 'admin-fixture'
               and "LANDING" = 'https://example.invalid/admin-campus' and proxima_accion = 'Llamar')
             or not exists(select 1 from public.lead_appointments where id = fixture_appointment_id
               and campus = 'DORAL' and student_name = 'Alumno fixture' and student_age = 18)
             or (select count(*) from public.lead_gestiones where lead_gestiones.lead_id = baseline.id) <> before_count + 1 then
            raise exception 'Admin full fields + existing campus not saved atomically';
          end if;
        end if;
        -- Reintento determinista: la transicion existente lo rechaza sin duplicar.
        perform pg_temp.expect_followup_error(route, lead_id, pair, advisor, '22023', 'agendado_transition_required');
      end if;

      -- Guardado del par por ambas RPCs, incluso despues de Agendado: no eventos.
      select count(*) into before_count from public.lead_gestiones where lead_gestiones.lead_id = baseline.id;
      saved := public.update_lead_followup(lead_id, jsonb_build_object('proxima_accion', repeat('a', 200), 'fecha_seguimiento', '2028-02-29'));
      if length(saved.proxima_accion) is distinct from 200 then raise exception 'Action limit truncated'; end if;
      saved := public.update_lead_followup(lead_id, '{"proxima_accion":null,"fecha_seguimiento":null}'::jsonb);
      if saved.proxima_accion is not null or saved.fecha_seguimiento is not null then raise exception 'JSON null clear failed'; end if;
      saved := public.update_lead_followup(lead_id, '{"proxima_accion":" \t","fecha_seguimiento":" "}'::jsonb);
      if saved.proxima_accion is not null or saved.fecha_seguimiento is not null then raise exception 'Whitespace clear failed'; end if;
      saved := public.update_lead_followup(lead_id, jsonb_build_object('proxima_accion', 'Llamar O''Brien; --', 'fecha_seguimiento', '2028-02-29'));
      if saved.proxima_accion is distinct from 'Llamar O''Brien; --' or saved.fecha_seguimiento is distinct from date '2028-02-29' then
        raise exception 'Quoted action not persisted';
      end if;
      saved := public.update_lead_followup(lead_id, '{"OBSERVACIONES":null,"INTERESADO EN":null}'::jsonb);
      -- OBSERVACIONES cuenta como gestion aunque sea null; revisar por separado.
      select count(*) into before_count from public.lead_gestiones where lead_gestiones.lead_id = baseline.id;
      if actor_role = 'admin' then
        saved := public.update_lead_full(lead_id, '{"proxima_accion":"","fecha_seguimiento":""}'::jsonb);
        if saved.proxima_accion is not null or saved.fecha_seguimiento is not null then raise exception 'Full clear failed'; end if;
        saved := public.update_lead_full(lead_id, pair);
      end if;
      saved := public.update_lead_followup(lead_id, pair);
      saved := public.update_lead_followup(lead_id, pair);
      if (select count(*) from public.lead_gestiones where lead_gestiones.lead_id = baseline.id) <> before_count then
        raise exception 'Followup-only created duplicate management';
      end if;
      if route = 'appointment' and (
        (select count(*) from public.lead_appointments where lead_appointments.lead_id = baseline.id) <> appointment_count
        or (select count(*) from public.lead_appointment_events where lead_appointment_events.appointment_id = fixture_appointment_id) <> event_count
      ) then raise exception 'Followup-only changed appointment/events'; end if;
    end loop;
  end loop;

  update public.user_access set role = 'trafficker' where user_id = actor;
  perform pg_temp.expect_followup_error('followup', lead_id, pair, advisor, '42501', 'crm_access_forbidden');
  perform pg_temp.expect_followup_error('appointment', lead_id, pair, advisor, '42501', 'crm_access_forbidden');
  perform pg_temp.expect_followup_error('full', lead_id, pair, advisor, '42501', 'admin_required');
  update public.user_access set role = 'admin', activo = false where user_id = actor;
  perform pg_temp.expect_followup_error('followup', lead_id, pair, advisor, '42501', 'active_user_required');
  perform pg_temp.expect_followup_error('appointment', lead_id, pair, advisor, '42501', 'active_user_required');
  perform pg_temp.expect_followup_error('full', lead_id, pair, advisor, '42501', 'admin_required');
  raise notice 'Atomic followup SQL checks passed; fixtures will be rolled back.';
end;
$$;

rollback;
