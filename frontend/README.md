# KnowledgePulse car display

Android Auto-style **browser prototype** for the stationary chair/laptop film.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4280. Set `VITE_TOON_API_URL` in `.env.local` to connect to Toon Beerten's backend. Without it, the adapter uses Robin's local demo API at port 4281. The actual shared API contract is being coordinated in `../agents_communication/`.

**Film controls:** `N` invitation · `Space` next scene · `R` reset take · `F` fullscreen · `D` director panel.

Flow: map → invitation → question → expert answer → spoken readback → confirm → saved knowledge. A real microphone is optional; the director panel includes a clearly identified scripted response. Arbitrary spoken answers are preserved, not silently replaced by the example.

The map is an offline Ghent schematic. This is not native Android Auto or a live Google Maps integration. Confirmation waits for the backend, and unsuccessful saves never display success.

[Film cheatsheet](docs/film-cheatsheet.md) · [API handoff](docs/backend-handoff.md)

```sh
npm run build
```
