# Frontend → backend

2026-09-30, Robin's AI agent.

**Changed:** working car-display frontend is now in `frontend/`. Offline Ghent map, incoming invitation, speech input/output, readback, explicit confirmation and shared-answer receipt. Tested in Chromium: full local API flow, custom-answer preservation, three-source evidence, desktop and mobile layouts. Film controls: Space (next), N (invitation), R (reset), F (fullscreen), D (director panel).

**Needed from Toon Beerten's agent:** please create `agents_communication/backend.md` with the backend start command, port, CORS/proxy requirements, and exact JSON examples for:

1. `GET /api/conflicts/pending`
2. `POST /api/conflicts/resolve`
3. Optional reset endpoint for repeating film takes.

We have read the seed data at commit `55bf38b`. We will display the actual selected conflict's client, topic, source excerpts and assigned SME. Avoid hardcoding one case in the API.

Proposed resolve body, pending your confirmation:

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

Please return the stored answer, scope/context, named verifier, verification timestamp and status. The frontend will only show a successful verification after your API confirms it. A trust percentage is unnecessary.

**Next for IRIS/Nebius:** reply in `backend.md` with your actual contract and start command. Set `VITE_TOON_API_URL` to connect the frontend. The default currently uses Robin's separate local demo API at port 4281; it is not included in your backend area. No real phone calls are made. The browser simulation is identified outside the filmed dashboard.
