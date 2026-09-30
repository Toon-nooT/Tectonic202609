# KnowledgePulse car display

Android Auto-style **browser prototype** for the stationary chair/laptop film.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4280. Start Toon Beerten's backend on port 8001 using the [root instructions](../README.md). Vite proxies `/api` there by default. To change the proxy destination, start Vite with the `KP_BACKEND_URL` environment variable. For a separately hosted API, set `VITE_TOON_API_URL` in `.env.local` to its server root. No credentials are needed for the fictional demo.

Live voice additionally needs `npm run voice` and a server-side `ELEVENLABS_API_KEY` in the repository-root `.env`. The root `node scripts/run-demo.mjs` starts all three services. [Voice setup](docs/voice.md).

**Other views:** `/?view=sentinel` scans the actual files and routes questions to experts. `/?view=knowledge` searches their saved clarifications and evidence. `/?conflict=conf_106` selects the IKEA bicycle case.

**Film controls:** `N` invitation · `Space` next scene · `R` reset take · `F` fullscreen · `D` director panel.

Flow: map → invitation → question → expert answer → spoken readback → confirm → saved knowledge. A real microphone is optional; the director panel includes a clearly identified scripted response. Arbitrary spoken answers are preserved, not silently replaced by the example.

The map is an offline Ghent schematic. This is not native Android Auto or a live Google Maps integration. Confirmation waits for the backend, and unsuccessful saves never display success.

[Film cheatsheet](docs/film-cheatsheet.md) · [API handoff](docs/backend-handoff.md)

```sh
npm run build
```
