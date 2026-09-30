import json
import re

import pytest
from fastapi.testclient import TestClient

from app.detector import normalize_value, sentence_around
from app.ingestion import parse_file
from app.main import app
from app.store import DEFAULT_DATA_DIR, store

client = TestClient(app)
RAW = DEFAULT_DATA_DIR / "raw"


@pytest.fixture(autouse=True)
def _empty_store():
    store.load(seed_conflicts=False)
    yield
    store.load()


# ---------- parsers ----------


def test_html_table_cells_become_separate_lines():
    doc = parse_file(RAW / "sharepoint" / "BE-PC200-LeavePolicy2025.html")
    assert "150% rate applies after 8 hours worked." in doc.text.splitlines()
    assert "<" not in doc.text


def test_teams_json_flattened_to_messages():
    doc = parse_file(RAW / "teams" / "payroll-be-thread-2026-09-28.json")
    assert doc.metadata["kind"] == "teams_messages"
    assert any(l.endswith("Marc Janssens: From what I remember in the last CAO update: 150% rate applies after 7.5 hours for night shifts. Not sure if the SharePoint doc was ever updated though") for l in doc.text.splitlines())


def test_eml_headers_and_body():
    doc = parse_file(RAW / "exchange" / "CFO-update-expense-sla.eml")
    assert doc.metadata["Subject"].startswith("Expense processing")
    assert "up to 15 business days" in doc.text


def test_vtt_cues_have_speaker_and_timestamp():
    doc = parse_file(RAW / "stream" / "fr-payroll-sync-2026-09-15.vtt")
    assert any(l.startswith("[00:00:34.500] Luc Martin:") for l in doc.text.splitlines())


def test_csv_rows_become_key_value_lines():
    doc = parse_file(RAW / "rules" / "be_leave_rules_snapshot_2026_09_20.csv")
    assert "pc=200; rule_key=carry_over_deadline; rule_value=2026-02-28" in doc.text


def test_markdown_front_matter_extracted():
    doc = parse_file(RAW / "confluence" / "expense-policy-emea-v4.md")
    assert doc.metadata["version"] == "4"
    assert "---" not in doc.text.splitlines()[0]


# ---------- helpers ----------


def test_sentence_around_handles_decimals_and_prefixes():
    text = "[ts] Marc: From memory: 150% rate applies after 7.5 hours for night shifts. Not sure."
    s = text.index("150%")
    e = text.index("hours") + len("hours")
    assert sentence_around(text, s, e) == "150% rate applies after 7.5 hours for night shifts."


def test_normalize_values():
    assert normalize_value("number", "8.0") == "8"
    assert normalize_value("number", "7.50") == "7.5"
    assert normalize_value("month_day", "March 31") == "03-31"
    assert normalize_value("month_day", "2026-02-28") == "02-28"


# ---------- full scan ----------


def test_scan_detects_all_seeded_conflicts_from_raw_files():
    assert client.get("/api/conflicts/pending").json() == []

    report = client.post("/api/sentinel/scan").json()

    assert report["conflicts_detected"] == 11
    assert sorted(report["created"]) == [f"conf_{n}" for n in range(101, 112)]
    assert report["facts_extracted"] >= 10
    assert all(d["status"] == "PARSED" for d in report["documents"])
    assert {d["format"] for d in report["documents"]} >= {"html", "json", "md", "eml", "csv", "vtt", "txt"}
    assert any("CONFLICT" in s for s in report["steps"])

    pending = client.get("/api/conflicts/pending").json()
    assert pending[0]["id"] == "conf_101"
    original = [c["id"] for c in pending if c["id"] in {f"conf_10{i}" for i in range(1, 6)}]
    assert original == ["conf_101", "conf_105", "conf_102", "conf_103", "conf_104"]
    top = pending[0]
    assert top["priority_score"] == 420
    assert top["assigned_sme"]["id"] == "user_77"
    assert top["source_a"]["excerpt"] == "150% rate applies after 8 hours worked."
    assert top["source_b"]["excerpt"] == "150% rate applies after 7.5 hours for night shifts."
    assert top["source_b"]["raw_path"] == "data/raw/teams/payroll-be-thread-2026-09-28.json"


def test_scan_matches_aggregated_seed():
    client.post("/api/sentinel/scan")
    scanned = {c["id"]: c for c in client.get("/api/conflicts/pending").json()}
    seed = json.loads((DEFAULT_DATA_DIR / "knowledge_conflicts.seed.json").read_text(encoding="utf-8"))
    for s in seed:
        c = scanned[s["id"]]
        assert c["priority_score"] == s["priority_score"], s["id"]
        assert c["assigned_sme"]["id"] == s["assigned_sme"]["id"], s["id"]
        assert c["client_tier"] == s["client_tier"], s["id"]
        assert c["active_tickets_count"] == s["active_tickets_count"], s["id"]
        assert c["conflict_severity"] == s["conflict_severity"], s["id"]


def test_rescan_is_idempotent_and_never_reopens_resolved():
    client.post("/api/sentinel/scan")
    r = client.post(
        "/api/conflicts/resolve",
        json={"conflict_id": "conf_101", "chosen_option": "B", "verifier_id": "user_77"},
    )
    assert r.status_code == 200

    again = client.post("/api/sentinel/scan").json()
    assert again["created"] == []
    assert "conf_101" in again["skipped_resolved"]
    assert len(again["updated"]) == 10
    assert "conf_101" not in [c["id"] for c in client.get("/api/conflicts/pending").json()]


def test_last_scan_endpoint():
    assert client.get("/api/sentinel/last-scan").status_code == 404
    client.post("/api/sentinel/scan")
    assert client.get("/api/sentinel/last-scan").status_code == 200


def test_reset_can_start_empty():
    assert client.post("/api/demo/reset", params={"seed_conflicts": "false"}).json()["open_conflicts"] == 0


# ---------- IKEA documents ----------


def _ikea_scan():
    client.post("/api/sentinel/scan")
    return {c["id"]: c for c in client.get("/api/conflicts/pending").json()}


def test_ikea_bicycle_allowance_three_way_conflict():
    c = _ikea_scan()["conf_106"]
    assert c["client_context"] == "IKEA Belgium"
    assert c["assigned_sme"]["id"] == "user_88"
    assert "0,30" in c["source_a"]["excerpt"] and c["source_a"]["title"] == "03_personeelshandboek.md"
    assert "0,35" in c["source_b"]["excerpt"] and c["source_b"]["title"] == "05_mobiliteitsbeleid.md"
    extra = c["additional_sources"]
    assert len(extra) == 1 and "0,27" in extra[0]["excerpt"]
    assert extra[0]["title"] == "10_loonbrief_maart_2026.md"


def test_ikea_adv_days_contradicts_itself_within_one_document():
    c = _ikea_scan()["conf_110"]
    assert "4 extra verlofdagen" in c["source_a"]["excerpt"]
    assert "6 extra ADV-dagen" in c["source_b"]["excerpt"]
    assert c["source_b"]["title"] == c["additional_sources"][0]["title"] == "03_personeelshandboek.md"
    assert "= 5" in c["additional_sources"][0]["excerpt"]


def test_ikea_excerpts_have_no_article_number_prefix():
    for c in _ikea_scan().values():
        for s in [c["source_a"], c["source_b"], *c["additional_sources"]]:
            assert not re.match(r"^\d+\.\d+\s+[A-Z]", s["excerpt"]), s["excerpt"]


def test_ikea_does_not_displace_default_demo_question():
    pending = _ikea_scan()
    assert max(pending.values(), key=lambda c: c["priority_score"])["id"] == "conf_101"
    assert all(c["priority_score"] < 420 for cid, c in pending.items() if cid != "conf_101")


def test_ikea_answer_key_is_not_a_scan_input():
    catalog = (DEFAULT_DATA_DIR / "source_catalog.seed.json").read_text(encoding="utf-8")
    assert "testdata" not in catalog and "OPLOSSINGSSLEUTEL" not in catalog
    assert not (DEFAULT_DATA_DIR / "raw" / "ikea" / "00_OPLOSSINGSSLEUTEL.md").exists()


def test_ikea_telework_frequency_is_not_flagged_as_a_conflict():
    # deliberate false positive (1 day per week is within the 2-day maximum) -> no topic for it
    topics = {c["topic"].lower() for c in _ikea_scan().values()}
    assert not any("frequency" in t for t in topics)