import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "reconcile_leads.py"
SPEC = importlib.util.spec_from_file_location("reconcile_leads", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReconcileLeadsTest(unittest.TestCase):
    def make(self, identifier, values, archived=False):
        return MODULE.make_row(identifier, values, archived=archived)

    def base_values(self):
        return [
            "Septiembre", "1/9/2026", "Persona Uno", "305-555-0100",
            "Actuacion Adultos", "Whatsapp", "Información", "", "Jessi",
            "", "1/9/2026", "nota", "", "", "", "",
        ]

    def test_full_unique_business_change_is_strong(self):
        source_values = self.base_values()
        db_values = self.base_values()
        source_values[6] = "INSCRITO"
        result = MODULE.classify([self.make(2, source_values)], [self.make(10, db_values)])
        self.assertEqual(result["proof"], {"full": 1})
        self.assertEqual(len(result["strong_restores"]), 1)
        self.assertEqual(result["strong_restores"][0]["business_diff"], [6])

    def test_fallback_name_change_requires_review(self):
        source_values = self.base_values()
        db_values = self.base_values()
        source_values[2] = "Persona Corregida"
        result = MODULE.classify([self.make(2, source_values)], [self.make(10, db_values)])
        self.assertEqual(result["proof"], {"camp": 1})
        self.assertEqual(len(result["fallback_review"]), 1)
        self.assertEqual(len(result["strong_restores"]), 0)

    def test_duplicate_source_is_ambiguous(self):
        values = self.base_values()
        result = MODULE.classify(
            [self.make(2, values), self.make(3, values)],
            [self.make(10, values), self.make(11, values)],
        )
        self.assertEqual(len(result["assigned"]), 0)
        self.assertEqual(len(result["ambiguous"]), 2)

    def test_empty_phone_never_auto_matches(self):
        values = self.base_values()
        values[3] = "SN"
        result = MODULE.classify([self.make(2, values)], [self.make(10, values)])
        self.assertEqual(len(result["assigned"]), 0)
        self.assertEqual(result["ambiguous"], {2: [10]})

    def test_invalid_date_never_auto_matches(self):
        values = self.base_values()
        values[1] = "sin fecha"
        result = MODULE.classify([self.make(2, values)], [self.make(10, values)])
        self.assertEqual(len(result["assigned"]), 0)

    def test_output_inside_repo_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            repo = Path(root)
            with self.assertRaisesRegex(ValueError, "outside the repository"):
                MODULE.ensure_private_output(repo / "private", repo)

    def test_date_formats_and_invalid_calendar(self):
        self.assertEqual(MODULE.parse_date("1/9/2026"), "2026-09-01")
        self.assertEqual(MODULE.parse_date("2026-09-01"), "2026-09-01")
        self.assertEqual(MODULE.parse_date("1/9/26"), "2026-09-01")
        self.assertIsNone(MODULE.parse_date("31/4/2026"))

    def test_strong_restore_never_allows_phone_change(self):
        source_values = self.base_values()
        db_values = self.base_values()
        source_values[3] = "3055559999"
        result = MODULE.classify([self.make(2, source_values)], [self.make(10, db_values)])
        self.assertEqual(len(result["strong_restores"]), 0)

    def test_new_leads_follow_phone_business_rule(self):
        db = self.base_values()
        db[2], db[3] = "Existente", "3055550100"
        existing_name = self.base_values()
        existing_name[2], existing_name[3] = "Mismo Nombre", "3055550101"

        rows = []
        for identifier, name, phone, gestion in (
            (2, "Contacto Distinto", "3055550100", "Información"),
            (3, "Contacto Repetido", "3055550100", "Repetido"),
            (4, "Mismo Nombre", "3055550200", "Información"),
            (5, "Sin Telefono", "", "Información"),
            (6, "Nuevo", "3055550300", "Información"),
            (7, "Nuevo Repetido", "3055550400", "Repetido"),
            (8, "Nuevo Valido", "3055550400", "Información"),
            (9, "Duplicado A", "3055550500", "Información"),
            (10, "Duplicado B", "3055550500", "Información"),
        ):
            values = self.base_values()
            values[2], values[3], values[6] = name, phone, gestion
            rows.append(self.make(identifier, values))

        selection, rejected = MODULE.select_new_leads(
            rows, [self.make(20, db), self.make(21, existing_name)]
        )
        self.assertEqual([row["id"] for row in selection["new_phone"]], [4, 6, 8])
        self.assertEqual([row["id"] for row in selection["no_phone"]], [5])
        self.assertEqual([row["id"] for row in selection["existing_contact"]], [2])
        self.assertEqual(
            rejected,
            {
                "existing_phone_repeated": 1,
                "new_phone_duplicate_or_repeated": 3,
            },
        )

    def test_campaign_only_updates_need_exact_campaign_difference(self):
        source_values = self.base_values()
        db_values = self.base_values()
        source_values[4] = "Weston"
        result = MODULE.classify([self.make(2, source_values)], [self.make(10, db_values)])
        fields = [
            "Mes", "Fecha", "Nombre", "Telefono", "Campaña", "Medio", "GESTION", "Ciudad",
            "AGENTE", "Odoo", "Fecha de Atencion", "OBSERVACIONES ", "Fecha Última Gestión ",
            "ULTIMA GESTION", "ULTIMO AGENTE ", "LANDING",
        ]
        update = MODULE.campaign_only_payload(result["fallback_review"], fields)
        self.assertEqual(len(update), 1)
        self.assertEqual(update[0]["campaign"], "Weston")

        source_values[2] = "Otro Nombre"
        result = MODULE.classify([self.make(3, source_values)], [self.make(10, db_values)])
        self.assertEqual(MODULE.campaign_only_payload(result["fallback_review"], fields), [])

    def test_new_lead_payload_maps_only_approved_campaign(self):
        values = self.base_values()
        values[4] = "Kids Doral Ingles"
        payload = MODULE.new_lead_payload([self.make(2, values)], [
            "Mes", "Fecha", "Nombre", "Telefono", "Campaña", "Medio", "GESTION", "Ciudad",
            "AGENTE", "Odoo", "Fecha de Atencion", "OBSERVACIONES ", "Fecha Última Gestión ",
            "ULTIMA GESTION", "ULTIMO AGENTE ", "LANDING",
        ])
        self.assertEqual(payload[0]["csv_row"], 2)
        self.assertEqual(payload[0]["values"]["Campaña"], "Kids doral inglés")


if __name__ == "__main__":
    unittest.main()
