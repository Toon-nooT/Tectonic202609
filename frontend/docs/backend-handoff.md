# Car demo API handoff

The car frontend uses `src/car/api.js`. Toon owns the backend. The browser film is a seated simulation, not an Android Auto installation or live driving integration.

## Backend selection

- Default: existing local demo API at same-origin `/api`. The Vite proxy points to the local server.
- Toon: set `VITE_TOON_API_URL=http://127.0.0.1:8000` before starting Vite or building. Use the server root URL, without `/api`. Configure that backend to allow the frontend origin through CORS when ports differ.
- The adapter never falls back from a failed Toon connection to local data. Errors remain visible.
- No secrets belong in a `VITE_` variable. These values are public browser configuration.

## Normalized frontend functions

```js
getQuestion() // -> {id,title,client,question,expertName,expertRole,optionA,optionB,
              //     sourceA:{title,excerpt},sourceB:{title,excerpt},
              //     suggestedAnswer,scope,mode,context}
submitAnswer(question, {choice: 'A' | 'B' | 'custom', explanation: string})
  // -> {answer,scope,verifiedBy,verifiedAt,status,mode}
resetDemo()
```

Keep the complete question object between loading and submission. Private `_local` / `_toon` metadata carries the source versions or assigned expert ID. `context` is display text. `mode` is `local` or `toon`. Results use `verified` or `pending_review`; a pending result has no verifier or verification timestamp and must not display a verified badge.

The UI must show the selected wording for explicit **Confirm and share** before calling `submitAnswer`. The adapter does not parse speech semantically or decide which answer an arbitrary utterance supports. Voice transcription is input to the user's review.

## Toon endpoints currently documented in the shared plan

`GET /api/conflicts/pending` returns an array, or `{ "conflicts": [...] }`, containing the plan's `KnowledgeConflict` shape. The adapter selects the highest numeric `priority_score` among unresolved records and maps `source_a`, `source_b`, `client_context` and `assigned_sme`.

Optional fields `question`, `option_a`, `option_b` and `scope` improve spoken presentation. Without them, source excerpts become the choices. The frontend does not infer a correct answer.

### Resolve contract requiring agreement with Toon

The shared plan names `POST /api/conflicts/resolve` but does **not** yet specify its request body or actual implementation. The adapter currently sends this proposed body:

```json
{
  "conflict_id": "conf_101",
  "sme_id": "user_77",
  "choice": "B",
  "explanation": "The exception applies to night shifts only.",
  "answer": "The option the expert explicitly confirmed.",
  "scope": "Client and process scope displayed to the expert",
  "verification_source": "Car demo · expert confirmed"
}
```

The response must be the plan's `VerifiedKnowledge` record, directly or under `verified_knowledge`:

```json
{
  "verified_answer": "The persisted scoped clarification.",
  "verified_by": "Sarah De Vos (Senior Payroll Lead)",
  "verified_at": "2026-09-30T14:41:00Z",
  "scope": "Optional more precise persisted scope"
}
```

The browser requires the persisted answer, verifier and timestamp before showing success. It does not manufacture those fields when the backend's response differs. This integration has **not** been verified against Toon's implementation. Confirm the payload and response before filming with Toon mode.

The plan defines `POST /api/commute/trigger-traffic-call`. This frontend **does not call it**: it may initiate real phone outreach. The car notification is a local film interaction, not evidence of a phone call or live traffic detection.

No Toon reset endpoint is specified. `resetDemo()` reports that limitation in Toon mode; the backend owner must reset or reseed the data.

## Working local preview

The local case uses fictional Meridian payroll sources. Noor is the simulated process owner, able to confirm and publish the scoped answer. Loading the question selects Noor locally. This is a role simulation, not authentication.

- Option B maps to the complete fixture clarification: regular payroll requires one approval; post-cutoff corrections require two.
- Option A conflicts with the fixture agreement; custom wording has not been interpreted by a model. Both are saved as drafts with `pending_review`, without a verified badge.
- The user's explanation is retained as the draft's reason. Custom wording becomes the draft answer verbatim.
- Draft submission carries the source versions loaded with the question. Source changes return `409`; the adapter never silently refreshes and stamps old wording with new evidence.
- Approval carries the exact newly saved draft ID. Concurrent edits return `409`.
- Reopening an already resolved example does not silently erase it. Use Reset demo for another take.
