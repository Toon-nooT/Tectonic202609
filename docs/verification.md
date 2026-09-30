# Verification evidence

Verified locally on 30 September 2026 with fictional data.

- **Checks:** 39 backend tests passed (`pytest`), 25 voice confirmation and audio-gate tests passed (`npm run test:voice`), and the frontend production build passed.
- **Browser workflow:** scanned 20 documents into 26 extracted facts and 11 candidates. Selected IKEA's three-source bicycle allowance case, saved a custom answer attributed to Tom, and observed the colleague view automatically refresh with the exact saved wording and all three sources.
- **Layout:** desktop at 1440px and mobile at 390px showed no horizontal overflow.
- **ElevenLabs:** real provider audio with typed expert replies demonstrated a scope follow-up, exact readback and explicit yes-confirmation through a guarded fake saver. The separate browser test exercised the actual backend save. Human testing identified room-noise cutoffs; a tested microphone gate and patient turn-taking now address these, with a room retest still needed.
- **OpenRouter:** two real calls on isolated, unfamiliar Volvo wording with a nine-hour threshold produced one LLM candidate with exact quotes and Sarah routing; regex produced none. This tests extraction within a configured topic, not novel-topic discovery or reliable scope discrimination.

[Scan result](screenshots/sentinel.png) · [Saved colleague answer](screenshots/knowledge.png) · [Car readback rehearsal](screenshots/car.png)

The [interactive preview](screenshots/preview.png) also passed a real browser test: AI extracted the unfamiliar wording, the rule extractor reported missing evidence, and the shared source remained unchanged. Input/path/rate checks and temporary-file cleanup were independently checked.

SME identity is simulated. Screenshots are unedited captures. **Aikido audit evidence has not yet been provided**; submission still needs the required before/after screenshots.
