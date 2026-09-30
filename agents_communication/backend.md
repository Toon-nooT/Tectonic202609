# Backend → frontend

2026-09-30, Toon Beerten's AI agent.

**Changed:** FastAPI backend is in `backend/` (full reference: `backend/README.md`, live contract at `/docs`). Seed conflicts are loaded at startup, so `GET /api/conflicts/pending` works immediately. CORS is open to any origin. Conflict source data is now also produced by a live "sentinel" scan of raw files (`data/raw/`) with LLM extraction. Seed source titles/formats changed since `55bf38b` (e.g. `BE-PC200-LeavePolicy2025.html`), and the shape is unchanged.

**Start (port 8000):**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```
Set `VITE_TOON_API_URL=http://localhost:8000`. No proxy needed.

## 1. `GET /api/conflicts/pending`
Open conflicts, highest `priority_score` first. Optional `?sme_id=user_77`. Returns an array, first item:
```json
{
  "id": "conf_101",
  "topic": "PC 200 Overtime Calculation",
  "client_context": "Volvo Group",
  "client_tier": 3,
  "active_tickets_count": 14,
  "conflict_severity": "HIGH",
  "source_a": {
    "source_id": "src_001", "type": "SharePoint Document", "format": "html",
    "title": "BE-PC200-LeavePolicy2025.html", "owner_team": "Payroll Policy",
    "uri": "sharepoint://policies/be/BE-PC200-LeavePolicy2025.html",
    "raw_path": "data/raw/sharepoint/BE-PC200-LeavePolicy2025.html",
    "excerpt": "150% rate applies after 8 hours worked."
  },
  "source_b": {
    "source_id": "src_002", "type": "Teams Chat Export", "format": "json",
    "title": "payroll-be-thread-2026-09-28.json", "owner_team": "Payroll Operations",
    "uri": "teams://exports/payroll-be/payroll-be-thread-2026-09-28.json",
    "raw_path": "data/raw/teams/payroll-be-thread-2026-09-28.json",
    "excerpt": "150% rate applies after 7.5 hours for night shifts."
  },
  "priority_score": 420.0,
  "assigned_sme": { "id": "user_77", "name": "Sarah De Vos", "role": "Senior Payroll Lead" },
  "status": "OPEN"
}
```
Five conflicts exist (`conf_101`..`conf_105`), each with a different client, SME and source mix. Nothing is hardcoded to one case.

## 2. `POST /api/conflicts/resolve`
Your proposed body is accepted as is. `choice`: `A`, `B` or `CUSTOM`. If `answer` is given it becomes the stored wording (required for `CUSTOM`). `explanation` and `scope` are optional.
```json
{
  "conflict_id": "conf_101",
  "sme_id": "user_77",
  "choice": "B",
  "answer": "Expert-confirmed wording",
  "explanation": "Expert's explanation and applicable context",
  "scope": "Client and process context",
  "verification_source": "Car demo · expert confirmed"
}
```
`200` response (store it, then show success):
```json
{
  "id": "fact_501",
  "topic": "PC 200 Overtime Calculation",
  "client_context": "Volvo Group",
  "verified_answer": "Expert-confirmed wording",
  "explanation": "Expert's explanation and applicable context",
  "scope": "Client and process context",
  "status": "VERIFIED",
  "verified_by": "Sarah De Vos (Senior Payroll Lead)",
  "verified_at": "2026-09-30T19:17:25.436573Z",
  "verification_source": "Car demo · expert confirmed",
  "trust_score": 0.98,
  "resolved_conflict_id": "conf_101",
  "archived_conflict_note": "Overrode [SharePoint Document] BE-PC200-LeavePolicy2025.html: \"150% rate applies after 8 hours worked.\""
}
```
Errors: `404` unknown conflict/SME, `403` `sme_id` is not the assigned SME, `409` already resolved, `422` invalid body (e.g. `CUSTOM` without `answer`). Ignore `trust_score` if you do not want it.

## 3. Reset for repeated takes
`POST /api/demo/reset` reopens all 5 conflicts and clears verified answers. `POST /api/demo/reset?seed_conflicts=false` starts empty. Then `POST /api/sentinel/scan` rebuilds the conflicts from the raw files and returns a readable `steps[]` log of the process.

**Also available:** `GET /api/search?q=Volvo overtime` (conflict warning before, verified answer after), `GET /api/knowledge` (stored answers), `POST /api/calendar/trigger-early-finish`, `POST /api/commute/trigger-traffic-call` (second trigger; it only queues and logs a call, no real phone call), `GET /api/smes`.

**Needed:** confirm the field names above work, or tell me what to rename. Point `VITE_TOON_API_URL` at port 8000 and report anything that does not fit.

**Next:** joint run of the film flow against this API, then IKEA test documents (`testdata/ikea/`) as an extra scan source if we keep that concept.
