# KnowledgePulse Backend

FastAPI backend for the KnowledgePulse Sentinel PoC. It is an in-memory, single-process service and acts as the **consumer API** for the (separately developed) frontend.

## Run

```sh
cd backend
uv sync --locked
uv run uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

- Interactive API docs (OpenAPI contract for the frontend): http://127.0.0.1:8001/docs
- Tests: `uv run --locked pytest -q`
- The car frontend proxies `/api` to port 8001. `pyproject.toml` and `uv.lock` provide the reproducible environment; `requirements.txt` is retained for compatibility.

| Env var | Default | Purpose |
|---|---|---|
| `KP_DATA_DIR` | `<repo>/data` | Location of seed, rules, reference and raw data |
| `KP_FRONTEND_URL` | `http://localhost:5173` | Base URL used for the fallback text link in phone outreach |
| `KP_START_EMPTY` | unset | `true` = start with no conflicts so the demo builds them live via a sentinel scan |
| `KP_EXTRACTOR` | `auto` | Default sentinel extractor: `auto`, `llm` or `regex` |
| `OPENROUTER_API_KEY` | none | Read from the repo-root `.env` (git-ignored). Enables LLM extraction |
| `OPENROUTER_URL` | OpenRouter chat completions | Chat-completions endpoint |
| `OPENROUTER_MODEL` | `openai/gpt-4o-mini` | Model used for extraction |

CORS is open to all origins (PoC, no credentials).

## Architecture

```
data/raw/**  --(ingestion.py)-->  plain text  --(detector.py rules)-->  facts
                                                                          |
data/reference/*.csv (tiers, ticket volume, SME history)  ------------->  compare + score + route
                                                                          |
                                                                   KnowledgeConflict (store.py)
                                                                          |
                                      triggers (early finish / commute call) -> resolve -> VerifiedKnowledge -> search
```

| Module | Responsibility |
|---|---|
| `app/ingestion.py` | Parses raw files (`html`, `json` incl. Teams/ServiceNow exports, `md` + front matter, `eml`, `csv`, `vtt`, `txt`) into line-oriented text |
| `app/detector.py` | The Collision Sentinel: runs extraction rules, compares facts across files, attaches client tier, ticket spike and SME |
| `app/scoring.py` | `priority = client_tier x active_tickets x severity` (HIGH=10, MEDIUM=6, LOW=3) |
| `app/store.py` | In-memory state, seed loading, scan upsert, resolve |
| `app/services.py` | Phone script builder, search ranking |
| `app/main.py` | REST endpoints |

## Collision Sentinel (the "process")

`POST /api/sentinel/scan` runs the full pipeline:

1. **Ingest** every source registered in `data/source_catalog.seed.json` from `data/raw/`.
2. **Extract** comparable facts per topic (see below). Topics are defined in `data/detection_rules.json`.
3. **Compare** normalized values (`number`, `month_day`, `text`) across files. Two or more distinct values = a conflict. The first two distinct values become Source A and Source B, and each excerpt is the sentence it was found in. Any further distinct values (for example a payslip that disagrees with both a handbook and a policy) are listed in `additional_sources`. Two values can come from the same document, which surfaces documents that contradict themselves.
4. **Enrich**: client tier (`client_tiers.csv`), 48h ticket spike (`ticket_volume_48h.csv`), and the SME with the most answered questions on the topic (`topic_ownership_history.csv`).
5. **Upsert** into the store and return a `ScanReport` whose `steps` array is a human-readable log, handy for showing the pipeline live.

Properties:
- Idempotent: re-scanning updates open conflicts in place.
- Already `RESOLVED` conflicts are never reopened (`skipped_resolved`).
- A missing or malformed file is reported in the report (`MISSING`/`ERROR`) and does not abort the scan.
- Regex mode is deterministic, so it is reproducible offline. LLM mode is the default when a key is configured (see Extractors below).

Adding a new conflict topic: add the raw file(s), register them in the catalog, add a rule (with a plain-English `description`) in `detection_rules.json`, and add rows to the three reference CSVs. With the LLM extractor no regex is needed.

### Extractors

`POST /api/sentinel/scan?extractor=auto|llm|regex` (default from `KP_EXTRACTOR`, else `auto`).

| Mode | Behaviour |
|---|---|
| `llm` | Each document is sent to the OpenRouter model with the topic descriptions. Strict: a failing call marks that document `ERROR` (no silent fallback). `503` if no API key is configured |
| `regex` | Deterministic regex extractors from `detection_rules.json`. Offline and reproducible |
| `auto` | LLM when a key is configured, otherwise regex. A failing LLM call falls back to regex for that document only |

LLM safeguards (`app/llm.py`, `app/detector.py`):
- **Grounding:** every fact must include a quote that exists verbatim in the source document and contains the extracted value. Anything else is rejected and counted in `rejected_facts` (logged in `steps`). The excerpt shown to the SME is always sentence text from the real file, never model-generated (except the short statement for structured csv rows).
- **Untrusted input:** the system prompt and delimiters tell the model to treat the document as data and ignore any instructions inside it.
- **Determinism:** `temperature: 0`. Documents are truncated at 20k characters.
- **Privacy:** document text is sent to the configured provider. The API key is only read from `.env` and is never logged or returned.
- **Corporate TLS inspection:** requests use the OS trust store (`truststore`), so the TLS-inspecting proxy does not break calls.
- Each scanned document in the `ScanReport` records which `extractor` handled it, and the report carries `extractor_mode`.

The test suite never calls the network (`KP_EXTRACTOR=regex` in `tests/conftest.py`, and the LLM is mocked in `tests/test_llm.py`).

## Data

| Path | Description |
|---|---|
| `data/raw/<system>/*` | Raw exported files in mixed formats (the scan input). `data/raw/ikea/` holds the Dutch IKEA Belgium documents (`conf_106`-`conf_111`) |
| `data/source_catalog.seed.json` | Registry of scanned sources (system, type, owner, URI, `raw_path`) |
| `data/detection_rules.json` | Fact-extraction rules per topic |
| `data/reference/*.csv` | Client tiers, ticket volume (48h), SME topic-ownership history |
| `data/knowledge_conflicts.seed.json` | Pre-aggregated conflicts, used as a fallback when not scanning. Matches the scan output (verified by a test) |
| `data/profiles.seed.json` | SMEs (with phone numbers) and frontline agents |

## API

All endpoints are under `/api`. Errors use standard HTTP codes (`404` unknown id, `403` wrong SME, `409` already resolved, `422` validation).

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness and open conflict count |
| POST | `/sentinel/scan` | Run the collision sentinel over `data/raw`, returns `ScanReport` |
| GET | `/sentinel/last-scan` | Last `ScanReport` (`404` if none yet) |
| GET | `/conflicts/pending?sme_id=` | Open conflicts by `priority_score` descending |
| GET | `/conflicts/{id}` | One conflict |
| POST | `/calendar/trigger-early-finish` | Trigger 1 (dead moment) |
| POST | `/commute/trigger-traffic-call` | Trigger 2 (phone outreach during traffic commute) |
| GET | `/outreach` | Log of queued phone outreach |
| POST | `/conflicts/resolve` | SME decision, creates `VerifiedKnowledge` |
| GET | `/knowledge` | Verified facts, newest first |
| GET | `/search?q=` | Conflict warning or verified answer |
| GET | `/smes` | SME profiles |
| POST | `/demo/reset?seed_conflicts=true` | Reset state. `false` starts empty so a scan fills it |

### Trigger 1: early finish

`POST /api/calendar/trigger-early-finish`

```json
{ "sme_id": "user_77", "minutes_available": 20 }
```

Returns the single highest-priority open conflict for that SME:

```json
{
  "event_type": "EVENT_EARLY_FINISH",
  "triggered": true,
  "headline": "Meeting Finished Early! (20 min gap)",
  "context_anchor": "Unblock 14 tickets for Volvo Group: PC 200 Overtime Calculation",
  "sme": { "id": "user_77", "name": "Sarah De Vos", "role": "Senior Payroll Lead" },
  "conflict": { "id": "conf_101", "priority_score": 420, "...": "..." }
}
```

`triggered: false` with a `reason` is returned when the SME has no open conflicts.

### Trigger 2: commute traffic (phone)

`POST /api/commute/trigger-traffic-call`

```json
{
  "event_type": "EVENT_COMMUTE_TRAFFIC",
  "sme_id": "user_77",
  "conflict_id": "conf_101",
  "contact_channel": "phone",
  "traffic_context": { "commuting": true, "traffic_level": "high", "eta_minutes": 35 }
}
```

`conflict_id` is optional (defaults to the SME's top conflict). Response:

```json
{
  "outreach_id": "out_1a2b3c4d",
  "event_type": "EVENT_COMMUTE_TRAFFIC",
  "triggered": true,
  "channel": "phone",
  "status": "CALL_QUEUED",
  "phone_masked": "+32***777",
  "call_script": "Hi Sarah, this is KnowledgePulse. I have one quick question about ... Please say 'option A' or 'option B'.",
  "voice_options": [
    { "option": "A", "utterance": "150% rate applies after 8 hours worked." },
    { "option": "B", "utterance": "150% rate applies after 7.5 hours for night shifts." }
  ],
  "fallback_text_link": "http://localhost:5173/nudge/conf_101",
  "conflict": { "...": "..." }
}
```

`triggered: false` (with `reason`) when `commuting` is false, the SME has no phone, or no open conflicts remain. The call is only queued and logged. No telephony provider is connected yet. The caller (frontend or voice agent) then answers through `POST /conflicts/resolve`.

### Resolve

`POST /api/conflicts/resolve`

```json
{
  "conflict_id": "conf_101",
  "chosen_option": "B",
  "verifier_id": "user_77",
  "verification_source": "Early-Finish Micro-Sync"
}
```

- `chosen_option`: `A`, `B` or `CUSTOM` (`custom_answer` required for `CUSTOM`).
- Only the assigned SME may resolve.
- Trust score: `0.98` for A/B, `0.92` for a custom answer.

Returns a `VerifiedKnowledge` including `verified_by`, `verified_at`, `trust_score` and `archived_conflict_note` (what was overridden, for transparency).

### Search

`GET /api/search?q=Volvo overtime rules`

Returns results of `kind: "CONFLICT_WARNING"` (before resolution, carries the `conflict`) or `kind: "VERIFIED"` (after resolution, carries `verified` for the trust scorecard). Matching is simple keyword overlap on topic and client.

## Demo flow

```
POST /api/demo/reset?seed_conflicts=false   # empty state
GET  /api/search?q=Volvo overtime           # no results yet
POST /api/sentinel/scan                     # 11 conflicts detected from raw files (5 original + 6 IKEA), steps[] shows the process
GET  /api/search?q=Volvo overtime           # CONFLICT_WARNING
POST /api/calendar/trigger-early-finish     # or /api/commute/trigger-traffic-call
POST /api/conflicts/resolve                 # SME picks option B
GET  /api/search?q=Volvo overtime           # VERIFIED with trust scorecard
```

## Known limitations

- In-memory only, state is lost on restart.
- Regex extraction needs a rule per topic. LLM extraction needs a topic description but is non-deterministic across model versions, so rehearse with `extractor=regex` as a fallback for the live demo.
- No authentication. The SME and verifier are identified by `sme_id` only.
- No real phone or voice provider. Outreach is queued and logged.
- Search is keyword-based.
- The seeded reset (`/api/demo/reset`) holds the original 5 conflicts only. The IKEA conflicts appear after a scan.
- IKEA master-data mismatches (company number, birth date, status, function, branch) and the probation period are not covered by rules yet. The telework frequency (1 day within a 2-day maximum) is intentionally not flagged.
