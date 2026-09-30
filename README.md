# KnowledgePulse

Find conflicting instructions, ask the right expert in a natural voice conversation, and make their confirmed clarification searchable for the next colleague. Built for the Tectonic hackathon.

## Run the demo

Requires Node 22.13+ and uv. Install dependencies once:

```sh
cd backend
uv sync --locked
```

```sh
cd frontend
npm ci
```

For live voice, add `ELEVENLABS_API_KEY` to the git-ignored repository-root `.env`. The gateway creates a dedicated ElevenLabs agent and keeps the API key server-side. An optional `ELEVENLABS_AGENT_ID` selects an already-configured compatible agent. Voice sessions consume the provider's included allowance or usage quota.

Then, from the repository root:

```sh
node scripts/run-demo.mjs
```

| View | URL | What it demonstrates |
|---|---|---|
| Find the contradiction | http://127.0.0.1:4280/?view=sentinel | Actual file scan, conflicting passages and expert routing |
| Ask the expert | http://127.0.0.1:4280/ | One initial activation, spoken context, readback and confirmation |
| Shared knowledge | http://127.0.0.1:4280/?view=knowledge | Search the saved answer, named expert and source evidence |

For IKEA, run a rule scan and select the bicycle allowance case, or use the car director's case selector. Source excerpts and the additional third source come from `data/raw/ikea/`. The solution key is excluded.

**Challenge the scanner:** select a case in Sentinel, edit a source statement in the isolated preview, and run AI or rule extraction. The actual backend pipeline returns its evidence and assigned expert without changing shared documents or answers. AI mode needs `OPENROUTER_API_KEY` in the same private `.env`. It tests new wording within configured topics; it does not discover arbitrary new topics.

**Noisy room:** enabled by default in director controls. Pulse finishes speaking before the microphone opens automatically. Correct the readback when it is your turn. Disable this setting in a quiet room to allow interruptions.

**D** opens director controls; **F** fullscreen; **R** resets the demo's saved answers. Scripted rehearsal remains available for filming, with **Space** advancing its scenes. It is distinct from the live ElevenLabs conversation.

**For filming:** run `npm run build` and `npm run preview` from `frontend/`, keeping the backend and voice gateway running. Use http://127.0.0.1:4282/ to avoid development reloads during a take.

The frontend uses Toon Beerten's API. Confirming an answer resolves the conflict and makes it searchable through `/api/search`. API docs: http://127.0.0.1:8001/docs.

This is a browser simulation with fictional cases, an offline map and simulated expert identity. Backend answers live in memory and reset when the backend restarts. Expert confirmation records attribution, not independent proof of correctness. The rule scanner is deterministic; optional LLM extraction requires the backend's separate OpenRouter configuration. Aikido audit screenshots must be obtained separately before submission.

[Final film notes](frontend/docs/demo-director.md) · [Voice setup](frontend/docs/voice.md) · [Backend](backend/README.md) · [Test documents](testdata/ikea/README.md) · [Agent coordination](agents_communication/README.md)

[Verification and screenshots](docs/verification.md)
