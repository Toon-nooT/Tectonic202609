# Backend → frontend

2026-09-30, Toon Beerten's AI agent.

**Changed:** FastAPI backend is in `backend/` (full reference: `backend/README.md`, live contract at `/docs`). Seed conflicts are loaded at startup, so `GET /api/conflicts/pending` works immediately. CORS is open to any origin. Conflict source data is now also produced by a live "sentinel" scan of raw files (`data/raw/`) with LLM extraction. Seed source titles/formats changed since `55bf38b` (e.g. `BE-PC200-LeavePolicy2025.html`), and the shape is unchanged.

**Start (port 8001, matches the frontend proxy default):**
```powershell
cd backend
uv run uvicorn app.main:app --port 8001
```
Without uv: `python -m venv .venv`, `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`, then `.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8001`.
Same-origin `/api` proxy as in your note works, and CORS is open anyway. Deps: `pyproject.toml` now also lists `httpx`, `python-dotenv`, `truststore` (needed by the LLM extractor). The lockfile is regenerated. LLM extraction reads `OPENROUTER_*` from the git-ignored repo-root `.env`; without it the scan falls back to regex.

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

**Needed:** nothing blocking. Tell me if a field name or status code does not fit your adapter.

## 4. IKEA documents are now scanned (done)
`POST /api/sentinel/scan` now also reads the 10 IKEA files in `data/raw/ikea/` and returns 6 extra conflicts (client `IKEA Belgium`, tier 3). `POST /api/demo/reset` (seeded) is unchanged: still the same 5 conflicts, so your default Volvo/Sarah take does not move. IKEA scores are kept below Volvo's 420, so even after a scan the Volvo case stays first in `/api/conflicts/pending`.

| ID | Topic | Values found | SME |
|---|---|---|---|
| `conf_106` | Bicycle allowance per km | handbook 0,30, mobility policy 0,35, March payslip 0,27 | Tom Claes (`user_88`) |
| `conf_107` | Sunday work premium | work regulations 100%, handbook 50% | Sarah De Vos (`user_77`) |
| `conf_108` | Year-end bonus eligibility | handbook 3 months, company agreement 6 months | Tom Claes |
| `conf_109` | Meal voucher face value | policy 8,00, payslip 7,00 | Tom Claes |
| `conf_110` | ADV days | regulations 4, handbook text 6, handbook table 5 (contradicts itself) | Sarah De Vos |
| `conf_111` | Telework office allowance | contract 129,48, policy 150,00 | Nina Verhaegen (`user_81`) |

**Only API change (additive):** `KnowledgeConflict` has a new optional `additional_sources: Source[]` (default `[]`). When 3 documents disagree, `source_a` and `source_b` are the first two values and the rest are listed there, e.g. the payslip's 0,27 in `conf_106`. Existing fields are untouched. Use `additional_sources` for your optional `sourceC`.

**Answers to your questions:** `conf_106` (bicycle allowance) is assigned to Tom Claes (`user_88`, Benefits Program Owner), tier 3, 8 open tickets, score 144. It does **not** exist on startup or after `/api/demo/reset`; it appears after `POST /api/sentinel/scan` (use `?extractor=regex` for the reliable take).

**Selecting an IKEA case for filming without replacing existing ones:** `GET /api/conflicts/pending` (your UI call) always returns the Volvo case first (420). Two ways to show IKEA, pick one:
1. Frontend: call `GET /api/conflicts/pending?sme_id=user_88` and take the first item. That is Tom's queue: `conf_106` (144), then `conf_105` (132), `conf_108` (72), `conf_109` (54). Nothing existing is hidden or resolved. This needs a small adapter change on your side (an optional `sme_id` / persona setting).
2. No frontend change: resolve `conf_101` first (or `POST /api/demo/reset?seed_conflicts=false`, then scan, then resolve `conf_101`); `conf_106` then becomes the top case for the UI. Reset brings Volvo back.

Excerpts are Dutch quotes from the documents. Telework frequency (1 day vs "max 2 days") is deliberately not flagged, it is compatible.

**Next:** Toon Vandeleene's master-data mismatches (company number, birth date, status, function, PC, branch) and the probation period (conflicts with Belgian law) are not covered yet.


## 5. Backend explainer page (new, standalone)
**Changed:** new folder `infographic/` with one self-contained `index.html` (no build, no server, no API calls). It explains the backend for the hackathon submission: pipeline, extraction and grounding, priority, triggers, resolve, search. Open the file in a browser. Static data comes from a real scan of `data/raw` (fictional IKEA documents).
**Needed:** nothing. It is separate from `frontend/` and does not touch it or the API.
