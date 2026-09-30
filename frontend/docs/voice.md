# Conversational voice

From `frontend/`, run `npm run voice` alongside `npm run dev`. Node reads the repository-root `.env` (never a `VITE_` secret):

```
ELEVENLABS_API_KEY=your_key
# Optional: an existing agent configured with server/agent-config.mjs
ELEVENLABS_AGENT_ID=your_agent_id
# Optional provider voice ID, default Rachel
ELEVENLABS_VOICE_ID=your_voice_id
```

The gateway binds `127.0.0.1:8002`; Vite proxies `/voice`. The first start creates a dedicated private KnowledgePulse agent, then caches its ID in ignored `frontend/.voice-agent.json`. It never edits other agents. Session URLs expire and the API key never reaches browser code. Allowed browser origins are localhost/127.0.0.1 ports4280 and4282. Requests have limits and timeouts. This is a local demo gateway, not a public authenticated service.

One initial click grants microphone access. The agent asks the conflict, captures missing scope, reads the full clarification and requests spoken confirmation. Interruptions, corrections and “later” are supported. Publishing requires a fresh unambiguous affirmation after the exact readback and the save question. The client checks transcripts, playback state and the draft version independently of model tools. A model request, silence, vague agreement or a stale draft cannot save. Backend success is required before showing completion. `npm run test:voice` exercises the consent guard.

Speak **“Yes, please”** after “Shall I save that clarification with your name?” to confirm. Say **“Actually…”** to correct or **“Later”** to end. This is a browser car-display simulation, filmed stationary. Microphone audio goes to ElevenLabs. The dedicated agent disables stored voice recordings and requests one-day transcript retention. Only use the fictional hackathon cases. Displayed SME identity is demo attribution, not authentication.

Official implementation references: [JavaScript SDK](https://elevenlabs.io/docs/eleven-agents/libraries/java-script), [agent configuration API](https://elevenlabs.io/docs/api-reference/agents/create).
