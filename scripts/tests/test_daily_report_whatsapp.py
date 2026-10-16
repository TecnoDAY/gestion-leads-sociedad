"""Execute the migration's reporting CTEs with stdlib SQLite, not a JS reimplementation.

Only PostgreSQL syntax/functions are adapted. This checks aggregation semantics,
not PL/pgSQL deployment, permissions or appointment time-zone conversion.
"""
import json
from pathlib import Path
import re
import sqlite3
import unittest


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'supabase/migrations/202610160006_daily_report_management_detail.sql'


class DailyWhatsAppTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.create_function('btrim', 1, lambda value: value.strip() if value else value)
        self.db.create_function('btrim', 2, lambda value, chars: value.strip(chars) if value and chars else value)
        self.db.create_function('_daily_report_data_dura', 3, lambda *_: False)
        self.db.executescript('''
          create table user_access (user_id text, nombre text, activo boolean, role text);
          create table leads (id integer, "Medio" text, "Mes" text, "Fecha" text);
          create table lead_gestiones (id integer, lead_id integer, autor_user_id text,
            autor_name text, canal text, is_data_dura boolean, gestion_anterior text,
            gestion_nueva text, fecha_gestion text);
          create table lead_appointments (created_by_user_id text, advisor_user_id text,
            advisor_name text, created_at text, resolved_at text, rescheduled_from_id text,
            is_data_dura boolean, campus text, status text);
          insert into user_access values ('a', 'Ana', true, 'agente'), ('b', 'Bea', true, 'agente');
        ''')
        sql = MIGRATION.read_text()
        # Run all report CTEs, including their actual filters and JSON shaping.
        sql = sql[sql.index('  with\n'):sql.index("  select jsonb_build_object(\n    'fecha'")]
        sql = re.sub(r"\((a\.(?:created_at|resolved_at)) at time zone 'America/New_York'\)::date", r'date(\1)', sql)
        sql = sql.replace('jsonb_build_object', 'json_object')
        sql = sql.replace('public._daily_report_data_dura', '_daily_report_data_dura')
        sql = re.sub(r'\bp_fecha\b', ':p_fecha', sql)
        sql = re.sub(r'\bp_autor_user_id\b', ':p_autor_user_id', sql)
        self.query = sql + ' select block from shaped'

    def add(self, canal, previous, medio='Instagram', author='a', date='2026-10-16', name='Ana', data_dura=False):
        event_id = self.db.execute('select count(*) + 1 from lead_gestiones').fetchone()[0]
        self.db.execute('insert into leads values (?, ?, ?, ?)', (event_id, medio, 'OCTUBRE', date))
        self.db.execute('insert into lead_gestiones values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        (event_id, event_id, author, name, canal, data_dura, previous, 'CONTACTADO', date))

    def report(self, author='a', date='2026-10-16'):
        return [json.loads(row[0]) for row in self.db.execute(
            self.query, {'p_fecha': date, 'p_autor_user_id': author})]

    def test_combined_new_and_followup(self):
        self.add('llamada y whatsapp', None)
        self.add('llamada y whatsapp', 'CONTACTADO', medio='Referido')
        block, = self.report()
        self.assertEqual(block['whatsapp'], {'nuevos': 1, 'gestionados': 1, 'total': 2})
        self.assertEqual(block['canales']['whatsapp'], 0)
        self.assertEqual(block['canales']['llamada_whatsapp'], 2)
        self.assertEqual(block['canales']['total'], 2)
        self.assertEqual(block['gestionados'], 2)

    def test_pure_and_combined_exclusive_totals_independent_of_origin(self):
        self.add(' WhatsApp ', None, medio='Referido')
        self.add('WHATSAPP', '', medio=None)  # Empty previous text is still NOT NULL.
        self.add(' Llamada y WhatsApp ', None, medio='Instagram')
        self.add('llamada y whatsapp', 'CONTACTADO', medio='Lead directo')
        self.add('llamada', None, medio='WhatsApp')  # Origin alone must not count.
        self.add('instagram', 'CONTACTADO', medio='WhatsApp Nuevo')
        self.add(None, None, medio='WhatsApp')
        block, = self.report()
        self.assertEqual(block['whatsapp'], {'nuevos': 2, 'gestionados': 3, 'total': 5})
        self.assertEqual(block['canales'], {
            'llamada': 1, 'data_dura': 0, 'llamada_whatsapp': 2, 'whatsapp': 2,
            'instagram': 1, 'visita': 0, 'sin_clasificar': 1, 'total': 7,
        })
        self.assertEqual(block['gestionados'], 7)
        self.assertEqual(sum(v for k, v in block['canales'].items() if k != 'total'), 7)
        self.assertEqual(sum(block['procedencia'].values()), 7)

    def test_advisor_and_date_isolation(self):
        self.add('whatsapp', None)
        self.add('llamada y whatsapp', 'CONTACTADO', author='b', name='Bea')
        self.add('llamada y whatsapp', None, date='2026-10-15')
        ana, = self.report()
        bea, = self.report(author='b')
        yesterday, = self.report(date='2026-10-15')
        self.assertEqual(ana['whatsapp'], {'nuevos': 1, 'gestionados': 0, 'total': 1})
        self.assertEqual(bea['whatsapp'], {'nuevos': 0, 'gestionados': 1, 'total': 1})
        self.assertEqual(yesterday['canales']['llamada_whatsapp'], 1)
        self.assertEqual(yesterday['whatsapp']['nuevos'], 1)
        self.assertEqual(sum(b['gestionados'] for b in self.report(author=None)), 2)
        self.assertEqual(self.report(author='missing'), [])

    def test_followup_channels_and_initial_events(self):
        # Canonical otros is residual, not only the literal 'otros'. NULL is
        # normalized by the real CTE. Visits keep their own category.
        for canal in ('whatsapp', 'llamada y whatsapp', ' Instagram ', 'otros', '', None, 'correo'):
            with self.subTest(canal=canal):
                self.add(canal, None)
                self.add(canal, 'CONTACTADO')
                self.add(canal, '')
        for canal in ('llamada', 'visita conservatorio'):
            self.add(canal, None)
            self.add(canal, 'CONTACTADO')
        self.add('llamada', 'CONTACTADO', data_dura=True)
        self.add('llamada', 'CONTACTADO', data_dura=None)
        block, = self.report()
        self.assertEqual(block['whatsapp'], {'nuevos': 2, 'gestionados': 14, 'total': 16})
        self.assertEqual(block['canales'], {
            'llamada': 3, 'data_dura': 1, 'llamada_whatsapp': 3, 'whatsapp': 3,
            'instagram': 3, 'visita': 2, 'sin_clasificar': 12, 'total': 27,
        })
        self.assertEqual(block['gestionados'], 27)
        # A legacy literal must not sneak into detail through residual otros.
        self.add(' Llamada Data Dura ', 'CONTACTADO')
        self.assertEqual(self.report()[0]['whatsapp'], block['whatsapp'])

    def test_extended_followups_advisor_date_and_unassigned_isolation(self):
        self.add('instagram', 'CONTACTADO')
        self.add(None, '', author='b', name='Bea')
        self.add('otros', 'CONTACTADO', date='2026-10-15')
        self.add('', 'CONTACTADO', author=None, name='Una')
        self.add('visita conservatorio', 'CONTACTADO', author=None, name='Otra')
        self.assertEqual(self.report()[0]['whatsapp'], {'nuevos': 0, 'gestionados': 1, 'total': 1})
        self.assertEqual(self.report(author='b')[0]['whatsapp']['gestionados'], 1)
        self.assertEqual(self.report(date='2026-10-15')[0]['whatsapp']['gestionados'], 1)
        unassigned = {b['autor_name']: b for b in self.report(author=None) if b['autor_user_id'] is None}
        self.assertEqual(unassigned['Una']['whatsapp']['gestionados'], 1)
        self.assertEqual(unassigned['Otra']['whatsapp']['total'], 0)

    def test_unassigned_authors_and_empty_day(self):
        self.add('llamada y whatsapp', None, author=None, name='Una')
        self.add('whatsapp', 'CONTACTADO', author=None, name='Otra')
        unassigned = {b['autor_name']: b for b in self.report(author=None) if b['autor_user_id'] is None}
        self.assertEqual(unassigned['Una']['whatsapp']['nuevos'], 1)
        self.assertEqual(unassigned['Una']['whatsapp']['gestionados'], 0)
        self.assertEqual(unassigned['Otra']['whatsapp']['gestionados'], 1)
        empty, = self.report(date='2026-10-17')
        self.assertEqual(empty['whatsapp'], {'nuevos': 0, 'gestionados': 0, 'total': 0})
        self.assertEqual(empty['canales']['total'], 0)


if __name__ == '__main__':
    unittest.main()
