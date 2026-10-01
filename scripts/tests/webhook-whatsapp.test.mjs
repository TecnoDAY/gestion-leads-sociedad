import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { transform } from 'esbuild';

const source = await readFile(new URL('../../supabase/functions/meta-whatsapp-webhook/index.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
const secret = 'synthetic-test-secret';
const dbError = { code: 'XX000', message: 'DO_NOT_EXPOSE synthetic phone/name/message' };
const message = (id, from = '525500000001') => ({ id, from, text: { body: 'SYNTHETIC_PRIVATE_TEXT' } });
const value = (messages) => ({ messages, contacts: messages.map((m) => ({ wa_id: m?.from, profile: { name: 'SYNTHETIC_PRIVATE_NAME' } })) });
const payload = (...groups) => ({ entry: groups.map((messages) => ({ changes: [{ value: value(messages) }] })) });

function harness(options = {}) {
  const rows = [];
  const contacts = new Map();
  const rpcPhones = [];
  const windowQueries = [];
  const logs = [];
  let handler;
  let insertAttempts = 0;
  const env = {
    SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key',
    META_APP_SECRET: secret, META_WEBHOOK_VERIFY_TOKEN: 'synthetic-verify', WHATSAPP_DEDUP_DAYS: '0',
    ...options.env,
  };
  const client = {
    async rpc(name, args) {
      assert.equal(name, 'lead_contact_id_for');
      rpcPhones.push(args.p_phone);
      if (options.rpcError) return { data: null, error: dbError };
      if (options.rpcEmpty) return { data: null, error: null };
      if (!contacts.has(args.p_phone)) contacts.set(args.p_phone, contacts.size + 1);
      return { data: contacts.get(args.p_phone), error: null };
    },
    from(table) {
      assert.equal(table, 'leads');
      let field;
      let expected;
      const query = {
        select() { return query; },
        eq(column, val) { field = column; expected = val; return query; },
        gte(column, val) { assert.equal(column, 'created_at'); assert.ok(Number.isFinite(Date.parse(val))); return query; },
        limit(n) { assert.equal(n, 1); return query; },
        async maybeSingle() {
          if (field === 'contact_id') {
            windowQueries.push(expected);
            if (options.windowThrow) throw dbError;
            if (options.windowError) return { data: null, error: dbError };
          } else {
            assert.equal(field, 'whatsapp_message_id');
            if (options.duplicateReadThrow) throw dbError;
            if (options.duplicateReadError) return { data: null, error: dbError };
            if (options.duplicateReadEmpty) return { data: null, error: null };
          }
          return { data: rows.find((row) => row[field] === expected) ?? null, error: null };
        },
        insert(lead) {
          return {
            async select() {
              insertAttempts += 1;
              if (options.failOnceId === lead.whatsapp_message_id) {
                options.failOnceId = null;
                return { data: null, error: dbError };
              }
              if (options.unrelatedConflict || rows.some((row) => row.whatsapp_message_id === lead.whatsapp_message_id)) {
                return { data: null, error: { ...dbError, code: '23505' } };
              }
              if (options.insertEmpty) return { data: [], error: null };
              const triggerPhone = lead.Telefono.replace(/\D/g, '');
              if (!contacts.has(triggerPhone)) contacts.set(triggerPhone, contacts.size + 1);
              const row = { ...lead, id: rows.length + 1, contact_id: contacts.get(triggerPhone) };
              rows.push(row);
              return { data: [{ id: row.id }], error: null };
            },
          };
        },
      };
      return query;
    },
  };
  vm.runInNewContext(code, {
    require: (url) => { assert.equal(url, 'https://esm.sh/@supabase/supabase-js@2.117.1'); return { createClient: () => client }; },
    Deno: { env: { get: (key) => env[key] }, serve: (fn) => { handler = fn; }, readTextFileSync: () => { throw new Error('unavailable'); } },
    Request, Response, URL, TextEncoder, crypto: webcrypto,
    console: { error: (...args) => logs.push(args.join(' ')), log: (...args) => logs.push(args.join(' ')) },
  });
  return {
    rows, contacts, rpcPhones, windowQueries, logs, get insertAttempts() { return insertAttempts; },
    async post(body, signature) {
      const raw = typeof body === 'string' ? body : JSON.stringify(body);
      const sig = signature ?? `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
      const response = await handler(new Request('https://synthetic.invalid/webhook', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': sig } }));
      return { status: response.status, body: await response.json() };
    },
    request: (url, init) => handler(new Request(url, init)),
  };
}

test('procesa todos los mensajes de entries y changes; receipts no crean leads', async () => {
  const h = harness();
  const body = payload([message('batch-a')], [message('batch-b'), message('batch-c')]);
  body.entry[0].changes.push({ value: value([message('batch-d')]) });
  body.entry[1].changes.push({ value: { statuses: [{}] } });
  const result = await h.post(body);
  assert.equal(result.status, 200);
  assert.equal(result.body.results.length, 4);
  assert.equal(h.rows.length, 4);
});

test('fallo parcial devuelve 503; retry conserva persistidos sin duplicarlos', async () => {
  const h = harness({ failOnceId: 'retry-b' });
  const body = payload([message('retry-a'), message('retry-b'), message('retry-c')]);
  assert.equal((await h.post(body)).status, 503);
  assert.deepEqual(h.rows.map((r) => r.whatsapp_message_id), ['retry-a', 'retry-c']);
  const retry = await h.post(body);
  assert.equal(retry.status, 200);
  assert.equal(h.rows.length, 3);
  assert.equal(retry.body.results.filter((r) => r.duplicate).length, 2);
});

test('entregas concurrentes del mismo message.id producen una escritura', async () => {
  const h = harness();
  const body = payload([message('concurrent-id')]);
  const results = await Promise.all([h.post(body), h.post(body)]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  assert.equal(h.rows.length, 1);
  assert.equal(h.insertAttempts, 2);
  assert.equal(results.filter((r) => r.body.results[0].duplicate).length, 1);
});

test('23505 no relacionado no se confirma como duplicado', async () => {
  const h = harness({ unrelatedConflict: true });
  const result = await h.post(payload([message('unrelated')]));
  assert.equal(result.status, 503);
  assert.equal(result.body.results[0].duplicate, undefined);
});

for (const flag of ['duplicateReadError', 'duplicateReadThrow', 'duplicateReadEmpty']) {
  test(`23505 con ${flag} exige reintento`, async () => {
    const h = harness({ [flag]: true });
    const body = payload([message('read-failure')]);
    assert.equal((await h.post(body)).status, 200);
    const result = await h.post(body);
    assert.equal(result.status, 503);
    assert.equal(result.body.results[0].duplicate, undefined);
    assert.equal(h.rows.length, 1);
  });
}

for (const flag of ['windowError', 'windowThrow', 'rpcError', 'rpcEmpty', 'insertEmpty']) {
  test(`${flag} no confirma persistencia`, async () => {
    const h = harness({ [flag]: true, env: { WHATSAPP_DEDUP_DAYS: '30' } });
    assert.equal((await h.post(payload([message('transient')]))).status, 503);
    assert.equal(h.rows.length, 0);
  });
}

test('normalizacion conserva digitos internacionales y contacto del trigger/ventana', async () => {
  for (const from of ['+1 (202) 555-0101', '5512345678', '+52 55 0000 0001', '1234567']) {
    const h = harness({ env: { WHATSAPP_DEDUP_DAYS: '30' } });
    const digits = from.replace(/\D/g, '');
    assert.equal((await h.post(payload([message('phone-a', from)]))).status, 200);
    assert.equal(h.rows[0].Telefono.replace(/\D/g, ''), digits);
    assert.deepEqual(h.rpcPhones, [digits]);
    assert.equal(h.contacts.size, 1);
    const result = await h.post(payload([message('phone-b', from)]));
    assert.equal(result.status, 200);
    assert.equal(result.body.results[0].duplicate, true);
    assert.equal(h.rows.length, 1);
    assert.deepEqual(h.windowQueries, [h.rows[0].contact_id, h.rows[0].contact_id]);
  }
});

test('mensajes poison se omiten explicitamente sin impedir el resto del lote', async () => {
  const h = harness();
  const body = payload([null, message('number', 1234567890), message('object', {}),
    message('short', '12'), message(undefined), message(''), message('   '), message(123), message('valid')]);
  const result = await h.post(body);
  assert.equal(result.status, 200);
  assert.equal(result.body.results.filter((r) => r.reason === 'invalid_message_id').length, 4);
  assert.equal(result.body.results.filter((r) => r.skipped).length, 8);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].whatsapp_message_id, 'valid');
});

test('config dedup invalida usa default; cero desactiva; extremos validos', async () => {
  for (const setting of [undefined, '', 'bad', '-1', '1.5', '3651', '99999999999999999999', '30', '3650', ' 7 ', '0']) {
    const h = harness({ env: { WHATSAPP_DEDUP_DAYS: setting } });
    assert.equal((await h.post(payload([message('config')]))).status, 200);
    assert.equal(h.windowQueries.length, setting === '0' ? 0 : 1);
  }
});

test('config ausente/signatura invalida no escriben; GET/OPTIONS/receipts conservan contrato', async () => {
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'META_APP_SECRET']) {
    const h = harness({ env: { [key]: undefined } });
    assert.equal((await h.post(payload([message('config')]))).status, 503);
    assert.equal(h.rows.length, 0);
  }
  const h = harness();
  assert.equal((await h.post(payload([message('signature')]), 'sha256=bad')).status, 403);
  assert.equal((await h.post({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).status, 200);
  assert.equal((await h.post('{')).status, 200);
  const get = await h.request('https://synthetic.invalid/?hub.mode=subscribe&hub.verify_token=synthetic-verify&hub.challenge=ok');
  assert.equal(get.status, 200);
  assert.equal(await get.text(), 'ok');
  assert.equal((await h.request('https://synthetic.invalid/', { method: 'OPTIONS' })).status, 200);
  assert.equal(h.rows.length, 0);
});

test('respuestas y logs no incluyen telefonos, nombres, texto ni mensajes de DB', async () => {
  const h = harness({ failOnceId: 'private' });
  const body = payload([message('private')]);
  const failure = await h.post(body);
  const success = await h.post(body);
  const duplicate = await h.post(body);
  const exposed = JSON.stringify([failure, success, duplicate, h.logs]);
  for (const privateValue of ['525500000001', 'SYNTHETIC_PRIVATE_NAME', 'SYNTHETIC_PRIVATE_TEXT', 'DO_NOT_EXPOSE']) {
    assert.ok(!exposed.includes(privateValue), privateValue);
  }
});

test('migracion aborta duplicados sin borrar datos y protege message.id con indice unico', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/202609300003_webhook_whatsapp_message_id.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /\b(delete|truncate)\b/i);
  assert.match(sql, /having count\(\*\) > 1/i);
  assert.match(sql, /raise exception/i);
  assert.match(sql, /create unique index if not exists leads_whatsapp_message_id_uidx/i);
  assert.match(sql, /where whatsapp_message_id is not null/i);
});
