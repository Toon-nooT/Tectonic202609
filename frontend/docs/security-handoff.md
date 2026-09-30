# Security handoff — final hour

**Aikido audit is still required.** The participant guide assigns security 10% and requires screenshots before and after fixes. Start the baseline at https://app.aikido.dev/aipentests/discounts/hackathon-tectonic-aikido, connect this repo, save the screenshot, fix findings, rerun, save the final screenshot. No Aikido setup or check run was found in this checkout. GitHub/account login may require a teammate.

## Fix first (IRIS/backend owner)

1. **Identity is caller-controlled.** `/api/conflicts/resolve` accepts a public SME ID as the verifier. The assignment check does not authenticate the speaker. For a public deployment, require an authenticated principal and match its SME assignment server-side. Keep the current prototype bound to loopback and describe its identity as a demo persona.
2. **Reset and paid scans are unrestricted.** Gate `/api/demo/reset` and `/api/sentinel/scan` behind explicit demo/admin access; rate-limit scans and prevent concurrent scans. Any HTTP client currently clears work or triggers repeated paid extraction.
3. **CORS permits every website.** Restrict origins to configured frontend URLs. This limits browser abuse but does not replace endpoint authentication. The current same-origin frontend proxy needs no wildcard CORS.
4. **Environment-file coverage fixed locally.** Root now ignores `.env*` throughout the repo and explicitly allows template `.env.example` files. Never put provider keys in `VITE_*` variables.

## Evidence (2026-09-30)

- Isolated FastAPI TestClient process: no credentials + assigned SME ID → resolve **200**. Foreign `Origin: https://attacker.invalid` → `Access-Control-Allow-Origin: *`. Reset without credentials → **200**. This did not mutate the running demo.
- `npm audit --json`: **0 dependency findings**. This is not an Aikido audit.
- Existing strengths: React renders source text without raw HTML injection; frontend waits for the verification response; LLM output is checked against source quotations; source text is marked untrusted in the extraction prompt; `.env` itself is ignored.

## Voice proxy requirements

Server-only ElevenLabs credentials; loopback bind; allowed-origin check; bounded request/text size; fixed provider URL; timeout; request/concurrency limit. Do not log credentials or full spoken answers. Spoken confirmation must occur before publication.

Implemented gateway protections inspected: loopback bind, explicit browser-origin allowlist, 1 KB body cap, fixed ElevenLabs upstream, 25-second provider timeout, eight session requests/minute and two concurrent upstream requests. The browser receives a temporary signed session URL, not the API key.

Live gateway negative checks: foreign origin **403**, missing origin **403**, 1,025-byte body **413**. These rejected requests did not mint provider sessions. Explicit request/header timeouts are now configured.

Voice consent tests passed 12/12 at review: model tool alone, premature yes, yes-but, uncertainty, interruption, stale draft, duplicate consumption and negated save questions are rejected. Start/stop generation checks and a synchronous start lock now cover overlapping startup; pending drafts no longer return `saved:true`. Audio playback completion remains a live verification item; these tests do not establish real microphone turn-taking quality.

Additional fixes verified: renewed speaking revokes consent; every new agent utterance requires a fresh matching readback. An isolated adversarial sequence (valid readback → unrelated question → yes) is now rejected rather than publishing the stale draft.

**Submission claim:** staged browser demo with fictional data and explicit expert confirmation. No claim of production authentication, certified driving safety, or completed Aikido audit until independently evidenced.
