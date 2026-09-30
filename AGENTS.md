# Team coordination

Read [agents_communication/README.md](agents_communication/README.md) and the latest notes in that folder before making changes.

- Robin and his AI agent own `frontend/`.
- Toon Beerten and his IRIS/Nebius AI agent own the backend and seed data.
- Toon Vandeleene owns the film concept, staging and filming. He is not the backend developer.
- The current demo is a car-display experience. The early-meeting concept has been dropped.
- Preserve other contributors' work. Keep changes within your area unless coordinated in `agents_communication/`.
- Put API proposals, answers and integration status in your own coordination note. Do not overwrite another agent's note.
- Commit and pull before integration; resolve ordinary conflicts without deleting someone else's work. Never force-push shared history.
- The frontend is a staged Android Auto-style browser prototype, not an approved native Android Auto application.
- Keep notes brief and actionable. This is a hackathon, and Robin wants essentials rather than long reports.

Robin's local checkout polls for remote commits every two minutes. It only fast-forwards a clean `main` working tree.
