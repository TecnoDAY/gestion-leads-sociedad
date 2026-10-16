"""Current migration CTE/JSON exercised locally with the shared SQLite adapter."""
import unittest

from scripts.tests.test_daily_report_whatsapp import DailyReportHarness, ROOT


class ArrivalPartitionsTest(DailyReportHarness):
    migration = ROOT / 'supabase/migrations/202610160009_appointment_results_actor.sql'

    def event(self, channel, previous=None, arrival='16/10/2026', **kwargs):
        self.add(channel, previous, **kwargs)
        self.db.execute('update leads set "Fecha"=? where id=(select max(id) from leads)', (arrival,))

    def invariants(self, block):
        wa, calls, channels = block['whatsapp'], block['llamadas'], block['canales']
        self.assertEqual(wa['nuevos'] + wa['gestionados'], wa['total'])
        self.assertEqual(calls['nuevos'] + calls['gestionados'], calls['total_gestion'])
        self.assertEqual(calls['total_gestion'], channels['llamada'] + channels['data_dura'])
        self.assertEqual(wa['total'] + calls['total_gestion'], block['gestionados'])
        self.assertEqual(sum(v for k, v in channels.items() if k != 'total'), block['gestionados'])
        self.assertEqual(channels['total'], block['gestionados'])
        self.assertEqual(sum(block['procedencia'].values()), block['gestionados'])

    def test_all_channels_same_new_rule_and_no_combined_double_count(self):
        for channel in ('whatsapp', ' Llamada y WhatsApp ', 'INSTAGRAM', 'visita conservatorio', 'otros', '', None, 'correo', 'llamada', 'llamada data dura'):
            for previous, arrival in ((None, '16/10/2026'), (None, '15/10/2026'), ('CONTACTADO', '16/10/2026'), ('', '16/10/2026')):
                self.event(channel, previous, arrival)
        self.event('llamada', data_dura=True)
        self.event('llamada', 'CONTACTADO', data_dura=True)
        self.event('llamada', data_dura=None)
        b, = self.report()
        self.assertEqual(b['whatsapp'], {'nuevos': 16, 'gestionados': 16, 'total': 32})
        self.assertEqual(b['llamadas']['nuevos'], 6)
        self.assertEqual(b['llamadas']['gestionados'], 5)
        self.assertEqual(b['canales']['llamada_whatsapp'], 4)
        self.assertEqual(b['canales']['llamada'], 5)
        self.assertEqual(b['canales']['data_dura'], 6)
        self.invariants(b)

    def test_existing_lead_second_management_today_is_not_new(self):
        self.event('whatsapp')
        self.db.execute("insert into lead_gestiones values (2, 1, 'a', 'Ana', 'whatsapp', false, 'CONTACTADO', 'SEGUIMIENTO', '2026-10-16')")
        self.event('instagram', 'CONTACTADO')
        self.event('llamada', None, '15/10/2026')
        b, = self.report()
        self.assertEqual(b['whatsapp'], {'nuevos': 1, 'gestionados': 2, 'total': 3})
        self.assertEqual(b['llamadas']['nuevos'], 1)
        self.assertEqual(b['llamadas']['gestionados'], 0)
        self.invariants(b)

    def test_arrival_invalid_missing_future_or_delayed_never_changes_new(self):
        valid = ('2026-10-16', '16/10/2026', '16-10-2026', '16/10/26', ' 16-10-26 ')
        invalid = (None, '', 'basura', '31/02/2026', '29/02/2026', '00/10/2026', '16/13/2026', '2026-00-16', '16/10/0000', '16/10/9999', '17/10/2026', '15/10/2026', '2026-10-16T12:00:00Z', '999999999999/10/2026')
        for channel in ('whatsapp', 'llamada'):
            for arrival in valid + invalid:
                self.event(channel, arrival=arrival)
        b, = self.report()
        self.assertEqual(b['whatsapp'], {'nuevos': len(valid) + len(invalid), 'gestionados': 0, 'total': len(valid) + len(invalid)})
        self.assertEqual(b['llamadas']['nuevos'], len(valid) + len(invalid))
        self.assertEqual(b['llamadas']['gestionados'], 0)
        self.invariants(b)
        self.event('whatsapp', arrival='29/02/2024', date='2024-02-29')
        self.assertEqual(self.report(date='2024-02-29')[0]['whatsapp']['nuevos'], 1)

    def test_author_day_and_unassigned_isolation(self):
        self.event('whatsapp')
        self.event('llamada', arrival='15/10/2026', author='b', name='Bea')
        self.event('instagram', arrival='15/10/2026', date='2026-10-15')
        self.event(None, author=None, name='Una')
        self.event('visita conservatorio', 'CONTACTADO', author=None, name='Otra')
        self.assertEqual(self.report()[0]['whatsapp']['nuevos'], 1)
        self.assertEqual(self.report(author='b')[0]['llamadas']['nuevos'], 1)
        self.assertEqual(self.report(date='2026-10-15')[0]['whatsapp']['nuevos'], 1)
        blocks = self.report(author=None)
        self.assertEqual(sum(b['gestionados'] for b in blocks), 4)
        for b in blocks:
            self.invariants(b)
        names = {b['autor_name']: b for b in blocks}
        self.assertEqual(names['Una']['whatsapp']['nuevos'], 1)
        self.assertEqual(names['Otra']['whatsapp']['gestionados'], 1)
        self.assertEqual(self.report(author='missing'), [])
        self.assertEqual(self.report(date='2026-10-17')[0]['gestionados'], 0)

    def test_management_date_not_created_at_and_miami_appointments(self):
        self.db.execute('alter table leads add column created_at text')
        self.db.execute('alter table lead_gestiones add column created_at text')
        # add() uses positional inserts; insert this fixture explicitly instead.
        self.db.execute('insert into leads (id, "Fecha", created_at) values (1, ?, ?)', ('15/10/2026', '2026-10-16T16:00:00Z'))
        self.db.execute("insert into lead_gestiones (id, lead_id, autor_user_id, autor_name, canal, gestion_nueva, fecha_gestion, created_at) values (1, 1, 'a', 'Ana', 'whatsapp', 'CONTACTADO', '2026-10-16', '2026-10-17T00:30:00Z')")
        self.db.execute('insert into leads (id, "Fecha", created_at) values (2, ?, ?)', ('16/10/2026', '2026-09-01T16:00:00Z'))
        self.db.execute("insert into lead_gestiones (id, lead_id, autor_user_id, autor_name, canal, gestion_nueva, fecha_gestion, created_at) values (2, 2, 'a', 'Ana', 'whatsapp', 'CONTACTADO', '2026-10-16', '2026-10-15T16:00:00Z')")
        for stamp in ('2026-10-16T03:59:59Z', '2026-10-16T04:00:00Z', '2026-10-17T03:59:59Z', '2026-10-17T04:00:00Z'):
            self.db.execute("insert into lead_appointments (created_by_user_id, advisor_user_id, advisor_name, created_at, is_data_dura, campus) values ('a', 'b', 'Bea', ?, false, 'DORAL')", (stamp,))
        b, = self.report()
        self.assertEqual(b['whatsapp'], {'nuevos': 2, 'gestionados': 0, 'total': 2})
        self.assertEqual(b['citas']['total_agendados'], 2)
        self.assertEqual(self.report(author='b')[0]['citas']['total_agendados'], 0)
        self.assertEqual(self.report(date='2026-10-17')[0]['gestionados'], 0)


if __name__ == '__main__':
    unittest.main()
