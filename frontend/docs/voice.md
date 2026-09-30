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

## Busy-room filming

**Noisy room** is on by default. While Pulse speaks, the SDK microphone input is muted; it opens automatically 250 ms after playback finishes. The short delay prevents speaker echo and brief gaps between audio packets from reopening the microphone. Wait for the listening cue, then speak. Corrections still work after the readback, before confirmation. Turn off **Noisy room** in Director controls to restore speaking-over-the-agent interruptions in a quieter room.

The dedicated agent uses `turn_eagerness: patient`, a 15-second silence reprompt timeout and no speculative turns. These are [documented conversation settings](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow). The installed ElevenLabs browser SDK already requests echo cancellation, noise suppression, automatic gain control and browser voice isolation; the room mode adds turn protection rather than claiming a new noise-removal model.
