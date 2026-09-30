# KnowledgePulse

An expert turns conflicting instructions into a shared, attributed answer during a staged car-dashboard conversation. Built for the Tectonic hackathon.

## Run the demo

Requires Node 22.13+ and uv. From the repository root, use two terminals:

```sh
cd backend
uv sync --locked
uv run uvicorn app.main:app --host 127.0.0.1 --port 8001
```

```sh
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:4280**. Press **Space** through the film scenes, **R** to reset, **F** for fullscreen and **D** for director controls. Real microphone input is optional; director controls provide a scripted response.

The frontend uses Toon Beerten's API. Confirming an answer resolves the conflict and makes it searchable through `/api/search`. API docs: http://127.0.0.1:8001/docs.

This is a browser simulation with fictional cases, an offline map and simulated expert identity. Backend answers live in memory and reset when the backend restarts.

[Film script](frontend/docs/film-cheatsheet.md) · [Backend](backend/README.md) · [Toon Vandeleene's test documents](testdata/ikea/README.md) · [Agent coordination](agents_communication/README.md)
