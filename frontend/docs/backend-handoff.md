# Car frontend → Toon’s backend

Adapter: `src/car/api.js`. Contract checked against `backend/app/main.py`, `models.py` and `store.py` at commit `5a015d8`.

## Connect

The default uses same-origin `/api` through Vite's proxy to `http://127.0.0.1:8001`. Set `KP_BACKEND_URL` when launching Vite to change its proxy target. For direct API access, set `VITE_TOON_API_URL` to the backend's server root, without `/api`, before starting Vite or building. A failed Toon connection never falls back to local data. The optional legacy Meridian adapter requires `VITE_TOON_API_URL=local` and a proxy to Robin's separate local server; that server is not part of this repository.

Run `uv sync --locked`, then `uv run uvicorn app.main:app --host 127.0.0.1 --port 8001` from `backend/`. `pyproject.toml` and `uv.lock` now provide the managed environment. The backend permits all CORS origins without credentials. Port 8001 avoids an unrelated local server on port 8000.

## Actual requests

- `GET /api/conflicts/pending` returns a direct array of `KnowledgeConflict` objects. The frontend selects the highest priority OPEN item. The default case is Volvo overtime, assigned to Sarah De Vos. Its spoken question includes **both actual source excerpts**.
- `POST /api/conflicts/resolve` takes this exact shape:

```json
{
  "conflict_id": "conf_101",
  "chosen_option": "B",
  "verifier_id": "user_77",
  "verification_source": "Car demo · expert confirmed"
}
```

For expert wording, use `chosen_option: "CUSTOM"` plus `custom_answer`. The adapter automatically uses CUSTOM whenever the user confirms wording different from the selected source excerpt. This preserves speech/text verbatim instead of silently discarding it. There are no `explanation`, `scope`, `answer` or `sme_id` fields on this request model.

The response is a direct `VerifiedKnowledge` record containing `resolved_conflict_id`, `verified_answer`, `verified_by`, `verified_at`, `topic`, `client_context`, `verification_source` and `archived_conflict_note`. The frontend checks the conflict ID and provenance before showing verification. Context is displayed as the returned client and topic. A pending status, if introduced later, remains pending in the UI.

- `POST /api/demo/reset?seed_conflicts=true` returns `{ "status": "reset", "open_conflicts": 5 }`. Reset take uses this endpoint and reloads the top question. It clears **all demo answers**, not just this browser’s current answer.

## UI interface

```js
getQuestion()
submitAnswer(question, { choice: 'A' | 'B' | 'custom', explanation: 'confirmed wording' })
resetDemo()
```

Preserve the full question object: internal `_toon` metadata carries its assigned verifier. `context` is display text. Results contain `{answer, scope, verifiedBy, verifiedAt, status, mode}`. Show a verification badge only when `status === 'verified'`.

The user must review the captured wording and explicitly choose **Confirm and share**. The adapter does not interpret arbitrary speech or decide which source is correct.

## Current limits

- Toon’s state is in memory and resets on restart. SME IDs simulate identity; there is no authentication or separate owner approval.
- Toon’s API has no source-version or draft-version guard. The older local Meridian demo’s freshness guarantees do not apply to Toon mode.
- A/B decisions and custom confirmations are immediately stored as verified by the assigned SME. This is human attribution, not proof that the chosen content is correct. The backend’s fixed trust percentages are not displayed.
- No phone, calendar or outreach endpoint is called. The car invitation is a staged browser interaction; the backend currently queues simulated phone outreach only.
- The local Meridian fallback retains its previous behavior: supported option B can publish; option A and custom answers remain drafts pending review.
