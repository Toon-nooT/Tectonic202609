import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import store

client = TestClient(app)

SARAH = "user_77"


@pytest.fixture(autouse=True)
def _reset():
    store.load()
    yield
    store.load()


def test_pending_sorted_by_priority_desc():
    data = client.get("/api/conflicts/pending").json()
    scores = [c["priority_score"] for c in data]
    assert scores == sorted(scores, reverse=True)
    assert data[0]["id"] == "conf_101"
    assert data[0]["priority_score"] == 420  # 3 x 14 x 10


def test_pending_filtered_by_sme():
    data = client.get("/api/conflicts/pending", params={"sme_id": SARAH}).json()
    assert [c["id"] for c in data] == ["conf_101", "conf_104"]


def test_early_finish_returns_single_top_conflict():
    r = client.post("/api/calendar/trigger-early-finish", json={"sme_id": SARAH})
    body = r.json()
    assert r.status_code == 200
    assert body["triggered"] is True
    assert body["conflict"]["id"] == "conf_101"
    assert "20 min gap" in body["headline"]
    assert "Volvo Group" in body["context_anchor"]


def test_early_finish_unknown_sme_404():
    r = client.post("/api/calendar/trigger-early-finish", json={"sme_id": "nope"})
    assert r.status_code == 404


def test_traffic_call_queues_phone_outreach():
    r = client.post(
        "/api/commute/trigger-traffic-call",
        json={"sme_id": SARAH, "traffic_context": {"commuting": True, "traffic_level": "high"}},
    )
    body = r.json()
    assert r.status_code == 200
    assert body["triggered"] is True
    assert body["status"] == "CALL_QUEUED"
    assert body["conflict"]["id"] == "conf_101"
    assert "option A" in body["call_script"]
    assert [o["option"] for o in body["voice_options"]] == ["A", "B"]
    assert body["phone_masked"] != "+32-470-100-777"
    assert "777" in body["phone_masked"]
    assert len(client.get("/api/outreach").json()) == 1


def test_traffic_call_not_commuting_not_triggered():
    r = client.post(
        "/api/commute/trigger-traffic-call",
        json={"sme_id": SARAH, "traffic_context": {"commuting": False}},
    )
    assert r.json()["triggered"] is False


def test_traffic_call_rejects_foreign_conflict():
    r = client.post(
        "/api/commute/trigger-traffic-call",
        json={"sme_id": SARAH, "conflict_id": "conf_102"},
    )
    assert r.status_code == 403


def test_search_before_and_after_resolution():
    before = client.get("/api/search", params={"q": "Volvo overtime rules"}).json()
    assert before["results"][0]["kind"] == "CONFLICT_WARNING"

    resolved = client.post(
        "/api/conflicts/resolve",
        json={"conflict_id": "conf_101", "chosen_option": "B", "verifier_id": SARAH},
    )
    assert resolved.status_code == 200
    fact = resolved.json()
    assert fact["verified_answer"].startswith("150% rate applies after 7.5 hours")
    assert fact["verified_by"] == "Sarah De Vos (Senior Payroll Lead)"
    assert fact["trust_score"] == 0.98
    assert "BE-PC200-LeavePolicy2025.html" in fact["archived_conflict_note"]

    after = client.get("/api/search", params={"q": "Volvo overtime rules"}).json()
    assert after["results"][0]["kind"] == "VERIFIED"
    assert all(r["kind"] != "CONFLICT_WARNING" for r in after["results"])

    pending_ids = [c["id"] for c in client.get("/api/conflicts/pending").json()]
    assert "conf_101" not in pending_ids


def test_resolve_twice_conflicts():
    payload = {"conflict_id": "conf_101", "chosen_option": "A", "verifier_id": SARAH}
    assert client.post("/api/conflicts/resolve", json=payload).status_code == 200
    assert client.post("/api/conflicts/resolve", json=payload).status_code == 409


def test_resolve_requires_assigned_sme():
    r = client.post(
        "/api/conflicts/resolve",
        json={"conflict_id": "conf_101", "chosen_option": "A", "verifier_id": "user_81"},
    )
    assert r.status_code == 403


def test_resolve_custom_requires_answer():
    r = client.post(
        "/api/conflicts/resolve",
        json={"conflict_id": "conf_101", "chosen_option": "CUSTOM", "verifier_id": SARAH},
    )
    assert r.status_code == 422


def test_demo_reset_reopens_conflicts():
    client.post(
        "/api/conflicts/resolve",
        json={"conflict_id": "conf_101", "chosen_option": "A", "verifier_id": SARAH},
    )
    assert client.post("/api/demo/reset").json()["open_conflicts"] == 5
    assert client.get("/api/knowledge").json() == []


def test_resolve_accepts_frontend_contract():
    r = client.post(
        "/api/conflicts/resolve",
        json={
            "conflict_id": "conf_101",
            "sme_id": SARAH,
            "choice": "B",
            "answer": "150% after 7.5 hours for night shifts (PC 200).",
            "explanation": "Confirmed in the latest CAO update.",
            "scope": "Volvo Group, PC 200 night shifts",
            "verification_source": "Car demo - expert confirmed",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "VERIFIED"
    assert body["verified_answer"] == "150% after 7.5 hours for night shifts (PC 200)."
    assert body["explanation"] == "Confirmed in the latest CAO update."
    assert body["scope"] == "Volvo Group, PC 200 night shifts"
    assert body["verified_by"] == "Sarah De Vos (Senior Payroll Lead)"
    assert body["verified_at"]
    assert body["verification_source"] == "Car demo - expert confirmed"
