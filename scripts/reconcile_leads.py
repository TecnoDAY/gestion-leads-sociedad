#!/usr/bin/env python3
"""Compara Leads Entrantes con un snapshot hash de public.leads.

Los informes con datos personales se escriben fuera del repositorio y con
permisos 0600. Este programa nunca conecta a Supabase ni modifica datos.
"""

from __future__ import annotations

import argparse
import collections
import csv
import datetime
import hashlib
import json
import os
import re
from pathlib import Path


DATE_FIELDS = (1, 10, 12)
CATALOG_FIELDS = {0, 4, 5, 6, 13}
AGENT_FIELDS = {8, 14}
KEY_FIELDS = {
    "full": (3, 1, 2, 4),
    "name": (3, 1, 2),
    "camp": (3, 1, 4),
    "nophone": (1, 2, 4),
}
EXPECTED_CSV_SHA256 = "14a24c5b8740af8bc4309b8a911d02e0cb93c35601e72c4b60609c08cabbe6ba"
CANONICAL_CAMPAIGNS = {"kids doral ingles": "Kids doral inglés"}


def digest(value: str) -> str:
    return hashlib.md5(value.encode()).hexdigest()  # noqa: S324 - parity with PostgreSQL snapshot


def parse_date(value: str) -> str | None:
    value = value.strip()
    parts = re.split(r"[/-]", value)
    if len(parts) != 3 or not all(re.fullmatch(r"[0-9]+", part) for part in parts):
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}", value):
        year, month, day = map(int, parts)
    else:
        day, month, year = map(int, parts)
        if year < 100:
            year += 2000
    if not 2000 <= year <= 2100:
        return None
    try:
        return datetime.date(year, month, day).isoformat()
    except ValueError:
        return None


def normalize(field_index: int, value: str) -> str:
    if field_index in CATALOG_FIELDS:
        trimmed = value.strip(" ")
        normalized = trimmed[:1].upper() + trimmed[1:].lower()
        if field_index == 4:
            return CANONICAL_CAMPAIGNS.get(normalized.lower(), normalized)
        return normalized
    if field_index in AGENT_FIELDS:
        trimmed = value.strip(" ")
        return "Jessica" if trimmed.lower() == "jessi" else trimmed[:1].upper() + trimmed[1:].lower()
    if field_index == 3:
        return re.sub(r"[^0-9]", "", value)
    if field_index == 2:
        return re.sub(r"\s+", " ", value.strip(" ")).lower()
    if field_index == 11:  # Observaciones: comparación literal.
        return value
    return value.strip(" ")


def make_row(identifier: int, values: list[str], raw=None, canonical=None, archived=False) -> dict:
    raw_hashes = list(raw) if raw is not None else [digest(value) for value in values]
    canonical_hashes = (
        list(canonical)
        if canonical is not None
        else [digest(normalize(index, value)) for index, value in enumerate(values)]
    )
    dates = [parse_date(values[index]) for index in DATE_FIELDS]
    for index, parsed in zip(DATE_FIELDS, dates):
        canonical_hashes[index] = digest("DATE:" + parsed) if parsed else digest("RAWDATE:" + values[index].strip())
    return {
        "id": identifier,
        "values": values,
        "r": tuple(raw_hashes),
        "c": tuple(canonical_hashes),
        "date": dates[0],
        "archived": bool(archived),
    }


def load_source(csv_path: Path, fields: list[str]) -> tuple[list[dict], dict]:
    source = []
    exact_rows = collections.defaultdict(list)
    unnamed_cells = 0
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.reader(handle, delimiter=",", quotechar='"', doublequote=True)
        header = next(reader)
        if len(header) != 44:
            raise ValueError(f"expected 44 CSV columns, found {len(header)}")
        mapping = [header.index("Agente " if field == "AGENTE" else field) for field in fields]
        for csv_row, row in enumerate(reader, 2):
            if len(row) != len(header):
                raise ValueError(f"CSV row {csv_row} has {len(row)} columns, expected {len(header)}")
            if not (row[header.index("Nombre")].strip() or row[header.index("Telefono")].strip()):
                continue
            values = [row[index] for index in mapping]
            source.append(make_row(csv_row, values))
            exact_rows[tuple(row)].append(csv_row)
            unnamed_cells += sum(1 for index, value in enumerate(row) if not header[index] and value.strip())
    duplicate_groups = [rows for rows in exact_rows.values() if len(rows) > 1]
    return source, {
        "columns": len(header),
        "candidates": len(source),
        "duplicate_groups": len(duplicate_groups),
        "duplicate_rows": sum(map(len, duplicate_groups)),
        "duplicate_excess": sum(len(rows) - 1 for rows in duplicate_groups),
        "unnamed_nonblank_cells": unnamed_cells,
    }


def load_snapshot(snapshot_path: Path) -> tuple[list[str], list[dict]]:
    snapshot = json.loads(snapshot_path.read_text())
    fields = snapshot["fields"]
    if len(fields) != 16:
        raise ValueError(f"expected 16 snapshot fields, found {len(fields)}")
    db_rows = []
    for row in snapshot["rows"]:
        values = [""] * len(fields)
        for index, value in zip(DATE_FIELDS, row["dates"]):
            values[index] = value
        db_rows.append(
            make_row(
                int(row["id"]),
                values,
                [row["r"][index : index + 32] for index in range(0, 512, 32)],
                [row["c"][index : index + 32] for index in range(0, 512, 32)],
                row["archived"],
            )
        )
    return fields, db_rows


def classify(source: list[dict], db_rows: list[dict]) -> dict:
    empty_phone = digest("")

    def key(row: dict, kind: str):
        return tuple(row["c"][index] for index in KEY_FIELDS[kind])

    source_index = {kind: collections.defaultdict(list) for kind in KEY_FIELDS}
    db_index = {kind: collections.defaultdict(list) for kind in KEY_FIELDS}
    for row in source:
        for kind in KEY_FIELDS:
            source_index[kind][key(row, kind)].append(row)
    for row in db_rows:
        for kind in KEY_FIELDS:
            db_index[kind][key(row, kind)].append(row)

    assigned = {}
    used_db_ids = set()
    proof = collections.Counter()
    for source_row in source:
        if source_row["c"][3] == empty_phone or source_row["date"] is None:
            continue
        for kind in ("full", "name", "camp"):
            source_group = source_index[kind][key(source_row, kind)]
            db_group = db_index[kind].get(key(source_row, kind), [])
            if len(source_group) != 1 or len(db_group) != 1:
                continue
            db_row = db_group[0]
            if db_row["id"] in used_db_ids:
                continue
            same_month_medium = source_row["c"][0] == db_row["c"][0] and source_row["c"][5] == db_row["c"][5]
            if kind == "full":
                second_unique_key = any(
                    len(source_index[secondary][key(source_row, secondary)])
                    == len(db_index[secondary].get(key(source_row, secondary), []))
                    == 1
                    for secondary in ("name", "camp")
                )
                if not second_unique_key:
                    continue
            elif not same_month_medium:
                continue
            assigned[source_row["id"]] = {"db": db_row, "proof": kind, "source": source_row}
            used_db_ids.add(db_row["id"])
            proof[kind] += 1
            break

    ambiguous = {}
    unmatched = []
    for source_row in source:
        if source_row["id"] in assigned:
            continue
        candidates = set()
        for kind in ("full", "name", "camp", "nophone"):
            if kind != "nophone" and source_row["c"][3] == empty_phone:
                continue
            candidates.update(row["id"] for row in db_index[kind].get(key(source_row, kind), []))
        if candidates:
            ambiguous[source_row["id"]] = sorted(candidates)
        else:
            unmatched.append(source_row)

    categories = collections.Counter()
    strong_restores = []
    fallback_review = []
    equivalents = []
    for item in assigned.values():
        source_row, db_row, proof_kind = item["source"], item["db"], item["proof"]
        raw_diff = [index for index in range(16) if source_row["r"][index] != db_row["r"][index]]
        business_diff = [index for index in range(16) if source_row["c"][index] != db_row["c"][index]]
        category = "modified" if business_diff else "format_only" if raw_diff else "raw_equal"
        categories[category] += 1
        record = {
            "source": source_row,
            "db": db_row,
            "proof": proof_kind,
            "raw_diff": raw_diff,
            "business_diff": business_diff,
        }
        if proof_kind == "full" and business_diff:
            strong_restores.append(record)
        elif proof_kind in ("name", "camp"):
            fallback_review.append(record)
        else:
            equivalents.append(record)

    ambiguous_db_ids = {db_id for ids in ambiguous.values() for db_id in ids}
    db_without_any_candidate = [
        row["id"] for row in db_rows if row["id"] not in used_db_ids and row["id"] not in ambiguous_db_ids
    ]
    return {
        "assigned": assigned,
        "proof": proof,
        "categories": categories,
        "strong_restores": strong_restores,
        "fallback_review": fallback_review,
        "ambiguous": ambiguous,
        "unmatched": unmatched,
        "db_without_any_candidate": db_without_any_candidate,
    }


def select_new_leads(unmatched: list[dict], db_rows: list[dict]) -> tuple[dict, dict]:
    """Selecciona altas conforme a la regla de negocio basada en telefono."""
    empty_phone = digest("")
    db_phones = {row["c"][3] for row in db_rows if row["c"][3] != empty_phone}
    rejected = collections.Counter()
    no_phone = []
    new_phone_candidates = []
    existing_contact_candidates = []

    for row in unmatched:
        repeated = normalize(6, row["values"][6]) == "Repetido"
        if row["c"][3] == empty_phone:
            if repeated:
                rejected["empty_phone_repeated"] += 1
            else:
                no_phone.append(row)
        elif row["c"][3] in db_phones:
            if repeated:
                rejected["existing_phone_repeated"] += 1
            else:
                existing_contact_candidates.append(row)
        else:
            new_phone_candidates.append(row)

    by_phone = collections.defaultdict(list)
    for row in new_phone_candidates:
        by_phone[row["c"][3]].append(row)

    new_phone = []
    for rows in by_phone.values():
        usable = [row for row in rows if normalize(6, row["values"][6]) != "Repetido"]
        if len(usable) == 1:
            new_phone.append(usable[0])
            rejected["new_phone_duplicate_or_repeated"] += len(rows) - 1
        else:
            rejected["new_phone_duplicate_or_repeated"] += len(rows)

    new_phone.sort(key=lambda row: row["id"])
    no_phone.sort(key=lambda row: row["id"])
    existing_contact_candidates.sort(key=lambda row: row["id"])
    return {
        "new_phone": new_phone,
        "no_phone": no_phone,
        "existing_contact": existing_contact_candidates,
    }, dict(rejected)


def new_lead_payload(rows: list[dict], fields: list[str]) -> list[dict]:
    payload = []
    for row in rows:
        entry = {}
        if "kind" in row:
            entry["kind"] = row["kind"]
        entry["csv_row"] = row.get("csv_row", row.get("id"))
        values = dict(zip(fields, row["values"]))
        campaign_key = values["Campaña"].strip().lower()
        values["Campaña"] = CANONICAL_CAMPAIGNS.get(campaign_key, values["Campaña"])
        entry["values"] = values
        payload.append(entry)
    return payload


def campaign_only_payload(fallback_rows: list[dict], fields: list[str]) -> list[dict]:
    """Selecciona las correcciones aprobadas: diferencia exclusivamente en Campaña."""
    payload = []
    for item in fallback_rows:
        if [fields[index] for index in item["business_diff"]] != ["Campaña"]:
            continue
        campaign = item["source"]["values"][fields.index("Campaña")]
        campaign = CANONICAL_CAMPAIGNS.get(campaign.strip().lower(), campaign)
        payload.append(
            {
                "id": item["db"]["id"],
                "csv_row": item["source"]["id"],
                "expected_raw_fingerprint": "".join(item["db"]["r"]),
                "campaign": campaign,
            }
        )
    payload.sort(key=lambda item: item["id"])
    return payload


def ensure_private_output(output_dir: Path, repo_root: Path) -> None:
    output_dir = output_dir.resolve()
    repo_root = repo_root.resolve()
    try:
        output_dir.relative_to(repo_root)
    except ValueError:
        pass
    else:
        raise ValueError("private reconciliation output must be outside the repository")
    output_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(output_dir, 0o700)


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    os.chmod(path, 0o600)


def write_review_csv(path: Path, records: list[dict], fields: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["CSVrow", "DBid", "proof", "changed_fields", *fields])
        for item in records:
            changed = ";".join(fields[index] for index in item["business_diff"])
            writer.writerow(
                [item["source"]["id"], item["db"]["id"], item["proof"], changed, *item["source"]["values"]]
            )
    os.chmod(path, 0o600)


def run(csv_path: Path, snapshot_path: Path, output_dir: Path, repo_root: Path, expected_sha: str) -> dict:
    actual_sha = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    if expected_sha and actual_sha != expected_sha:
        raise ValueError(f"CSV SHA-256 changed: expected {expected_sha}, got {actual_sha}")
    fields, db_rows = load_snapshot(snapshot_path)
    source, source_stats = load_source(csv_path, fields)
    result = classify(source, db_rows)
    ensure_private_output(output_dir, repo_root)

    summary = {
        "csv_sha256": actual_sha,
        "source": source_stats,
        "database_rows": len(db_rows),
        "database_active": sum(not row["archived"] for row in db_rows),
        "database_archived": sum(row["archived"] for row in db_rows),
        "proof": dict(result["proof"]),
        "categories": {
            "raw_equal": result["categories"]["raw_equal"],
            "format_only": result["categories"]["format_only"],
            "modified_all_selected": result["categories"]["modified"],
            "strong_restore": len(result["strong_restores"]),
            "fallback_review": len(result["fallback_review"]),
            "ambiguous": len(result["ambiguous"]),
            "unmatched": len(result["unmatched"]),
        },
        "db_without_any_candidate_count": len(result["db_without_any_candidate"]),
        "db_without_any_candidate_ids": result["db_without_any_candidate"],
        "warning": "Unmatched is not automatically new; no report authorizes writes.",
    }
    write_json(output_dir / "summary.json", summary)
    write_review_csv(output_dir / "strong-restores.csv", result["strong_restores"], fields)
    write_review_csv(output_dir / "fallback-review.csv", result["fallback_review"], fields)

    apply_payload = []
    for item in result["strong_restores"]:
        changes = {
            fields[index]: item["source"]["values"][index]
            for index in item["business_diff"]
            if fields[index] != "Telefono"
        }
        if len(changes) != len(item["business_diff"]):
            raise ValueError(f"strong restore for DB id {item['db']['id']} attempted to change Telefono")
        apply_payload.append(
            {
                "id": item["db"]["id"],
                "csv_row": item["source"]["id"],
                "expected_raw_fingerprint": "".join(item["db"]["r"]),
                "changes": changes,
            }
        )
    write_json(output_dir / "strong-apply.json", apply_payload)

    selection, new_lead_rejections = select_new_leads(result["unmatched"], db_rows)
    insert_rows = [
        {"csv_row": row["id"], "kind": kind, "values": row["values"]}
        for kind in ("new_phone", "no_phone", "existing_contact")
        for row in selection[kind]
    ]
    insert_rows.sort(key=lambda item: item["csv_row"])
    insert_payload = new_lead_payload(insert_rows, fields)
    write_json(output_dir / "insert-new.json", insert_payload)
    campaign_payload = campaign_only_payload(result["fallback_review"], fields)
    write_json(output_dir / "campaign-only-apply.json", campaign_payload)
    summary["new_leads"] = {
        "approved_candidates": len(insert_payload),
        "by_kind": dict(collections.Counter(item["kind"] for item in insert_payload)),
        "rejected": new_lead_rejections,
    }
    summary["campaign_only_updates"] = len(campaign_payload)
    write_json(output_dir / "summary.json", summary)

    with (output_dir / "ambiguous-review.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["CSVrow", "candidate_DBids"])
        for source_id, db_ids in sorted(result["ambiguous"].items()):
            writer.writerow([source_id, ";".join(map(str, db_ids))])
    os.chmod(output_dir / "ambiguous-review.csv", 0o600)

    unmatched_path = output_dir / "unmatched-review.csv"
    with unmatched_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["CSVrow", *fields])
        for row in result["unmatched"]:
            writer.writerow([row["id"], *row["values"]])
    os.chmod(unmatched_path, 0o600)

    manifest = {}
    for path in sorted(output_dir.iterdir()):
        if path.is_file() and path.name != "manifest.json":
            manifest[path.name] = {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size}
    write_json(output_dir / "manifest.json", manifest)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--expected-sha256", default=EXPECTED_CSV_SHA256)
    args = parser.parse_args()
    summary = run(args.csv, args.snapshot, args.output_dir, args.repo_root, args.expected_sha256)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
