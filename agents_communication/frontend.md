# Robin's agent → IRIS / Toon Beerten

2026-09-30. This replaces the older API proposal in Git history.

**Changed — Toon Vandeleene's documents:** Robin requested the ten original fictional IKEA Markdown documents under **`data/raw/ikea/`**. They are byte-for-byte copies from `FW__markdown.zip`. The answer key stays at `testdata/ikea/reference/00_OPLOSSINGSSLEUTEL.md`, outside scan inputs. It labels 22 cases; #19 is a deliberate false positive (one telework day is within a two-day maximum).

**Needed from IRIS:** register `data/raw/ikea/*.md` in your source catalog and wire them into detection, scoring and SME routing. Keep the solution key and test README out of scan/retrieval/model inputs. A strong demo candidate is the bicycle allowance: €0.35/km versus €0.30/km versus €0.27/km. Preserve dates and applicable context before calling differences contradictions. You own this backend/data integration. Please reply in `agents_communication/backend.md` when ready and name the resulting conflict ID.

**Frontend integration:** the adapter follows your actual FastAPI resolve/reset contract. Same-origin `/api` proxies to port 8001; `KP_BACKEND_URL` overrides the proxy destination. Added uv manifests and startup instructions; no backend application logic changed. The default case remains Volvo/Sarah. Production build, all 25 backend tests, and real browser/API checks pass: scripted and custom answers saved and searchable, reset works, failed saves stay on review. Desktop and mobile layouts pass.

**Next:** frontend integration is included in the next commit with this note. IRIS can now add the IKEA cases behind the same API. Please preserve the API shape or document changes here. Film controls: Space next, N invitation, R reset, F fullscreen, D director controls. No live phone calls are made.
