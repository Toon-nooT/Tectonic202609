# SD Worx Hackathon PoC Architecture & Implementation Plan
**Project Name:** KnowledgePulse Sentinel & Micro-Sync Engine  
**Target:** SD Worx Challenge – Trust, Context & Knowledge Verification  
**Audience:** Tectonic judges

---

## 1. Project Overview & Pitch Narrative

### Problem
In large organizations like SD Worx, employees face conflicting, stale, or context-agnostic documentation across SharePoint, Teams, and emails. When an urgent query arises, AI or traditional search often returns contradictory answers, leaving employees unable to act with confidence.

### Solution
**KnowledgePulse** is a proactive background system that:
1. **Detects** knowledge contradictions across documents and informal chats.
2. **Prioritizes** conflicts based on client importance and active ticket spikes.
3. **Identifies** the rightful Subject Matter Expert (SME).
4. **Triggers** 1-2 targeted micro-questions to the SME during "dead moments" (e.g., when a meeting finishes 20 minutes early).
5. **Updates** the knowledge base with verifiable human provenance (`Verified by Marc (Senior Lead) at 14:41 today`).

---

## 2. System Architecture & Component Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BACKGROUND SERVICES                              │
│                                                                             │
│  ┌───────────────────────┐    ┌──────────────────────┐    ┌──────────────┐  │
│  │ Collision Detector    │ -> │ Business Priority    │ -> │ SME Router   │  │
│  │ (Scans Docs vs Chats) │    │ Scorer Engine        │    │ Engine       │  │
│  └───────────────────────┘    └──────────────────────┘    └──────────────┘  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEAD-MOMENT TRIGGER                               │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Calendar Monitor: Detects early meeting end / 15-min gap              │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Commute Traffic Monitor: Detects traffic-bound commute windows         │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DELIVERY & VERIFICATION                           │
│                                                                             │
│  ┌─────────────────────────────────┐      ┌──────────────────────────────┐  │
│  │ Micro-Sync Nudge (Teams / App)  │ ---> │ Verified Knowledge Engine    │  │
│  │ (SME answers binary Q in 5s)    │      │ (Appends Trust & Provenance) │  │
│  └─────────────────────────────────┘      └──────────────┬───────────────┘  │
└──────────────────────────────────────────────────────────┼──────────────────┘
                                                           │
                                                           ▼
                                            ┌──────────────────────────────┐
                                            │ Agent Search UI              │
                                            │ (Shows Green Trust Badge)    │
                                            └──────────────────────────────┘
```

---

## 3. Core Functional Requirements

### 3.1 24/7 Collision Sentinel
* **Inputs:** Seeding 2 conflicting documents (e.g., SharePoint Policy Doc vs. Teams Chat transcript).
* **Detection Logic:** Compares semantic facts (e.g., "Overtime threshold for PC 200").
* **Output:** Creates a `KnowledgeConflict` object in the database.

### 3.2 Dynamic Prioritization Engine
* **Scoring Formula:**
  $$\text{Priority Score} = (\text{Client Tier Score}) \times (\text{Active Ticket Spike Count}) \times (\text{Conflict Severity})$$
* **Weights:**
  * **Client Tier:** Enterprise Tier 1 (3x multiplier), Standard (1x).
  * **Ticket Spike:** Number of open support tickets touching this topic in the last 48 hours.
  * **Conflict Severity:** Direct contradiction = High (10), Soft ambiguity = Low (3).

### 3.3 SME Router & Calendar Monitor
* Maps the conflict to an SME based on topic ownership history.
* Listens for a simulated calendar trigger: `EVENT_EARLY_FINISH` (e.g., 20 minutes remaining in a slot).
* Supports a second simulated trigger: `EVENT_COMMUTE_TRAFFIC` (SME is commuting and currently in traffic).
* Fetches **only the single highest-priority question** for that SME.

### 3.4 Multi-Channel Outreach Triggering
* Trigger Channel A: In-app/Teams micro-nudge when `EVENT_EARLY_FINISH` is received.
* Trigger Channel B: Phone outreach workflow when `EVENT_COMMUTE_TRAFFIC` is received.
* For phone mode, generate a concise script with:
  * Conflict topic and client urgency context.
  * A/B options plus a short "say yes/no or option A/B" prompt.
  * Fallback to text link when call is not answered.
* This channel is exposed as a **consumer API contract** for a future frontend/mobile client.

### 3.5 Micro-Verification Nudge UI
* Non-intrusive modal or card component with:
  * Context anchor: *"Unblock 12 tickets for Volvo Group"*.
  * Clear comparison between Source A (Doc) and Source B (Teams Chat).
  * 1-click decision buttons (Option A, Option B, or Custom voice/text input).

### 3.6 Provenance & Front-End Trust Display
* When an answer is submitted, the system flags the conflict as `RESOLVED`.
* Search results display the answer alongside a **Trust Scorecard**:
  * Badge: `Verified`
  * Verifier: Name + Role
  * Timestamp: Relative time (e.g., "12 mins ago")
  * Archived Conflict Note: Shows what was overridden for transparency.

---

## 4. Data Models & Schemas

### `KnowledgeConflict`
```json
{
  "id": "conf_101",
  "topic": "PC 200 Overtime Calculation",
  "client_context": "Volvo Group",
  "client_tier": 3,
  "active_tickets_count": 14,
  "source_a": {
    "type": "SharePoint Doc",
    "title": "BE-PC200-LeavePolicy2025.docx",
    "excerpt": "150% rate applies after 8 hours worked."
  },
  "source_b": {
    "type": "Teams Chat",
    "title": "#payroll-be discussion",
    "excerpt": "150% rate applies after 7.5 hours for night shifts."
  },
  "priority_score": 420,
  "assigned_sme": {
    "id": "user_77",
    "name": "Sarah De Vos",
    "role": "Senior Payroll Lead"
  },
  "status": "OPEN"
}
```

### `VerifiedKnowledge`
```json
{
  "id": "fact_501",
  "topic": "PC 200 Overtime Calculation",
  "client_context": "Volvo Group",
  "verified_answer": "150% rate applies after 7.5 hours for night shifts.",
  "verified_by": "Sarah De Vos (Senior Payroll Lead)",
  "verified_at": "2026-09-30T14:41:00Z",
  "verification_source": "Early-Finish Micro-Sync",
  "trust_score": 0.98,
  "resolved_conflict_id": "conf_101"
}
```

---

## 5. Technical Stack Guidelines for Code AI Agent

* **Frontend:** Single-page React app (Tailwind CSS) or embedded HTML dashboard.
* **Backend:** FastAPI (Python) or Express (Node.js) with simple in-memory vector/JSON storage.
* **State Management:** Simple REST API or WebSocket triggers to simulate real-time events.

---

## 6. Hackathon Build Roadmap (Step-by-Step for Code Agent)

### Phase 1: Database & Seed Data (0.5 - 1h)
1. Initialize seed data with:
   * 3 predefined `KnowledgeConflict` objects (including 1 high-priority Volvo Group conflict).
   * 1 SME profile (`Sarah De Vos`).
   * 1 Frontline Agent profile.

### Phase 2: Priority Scorer & Backend APIs (1 - 2h)
1. Implement endpoint `GET /api/conflicts/pending` sorted by `priority_score` descending.
2. Implement endpoint `POST /api/calendar/trigger-early-finish` that triggers a pop-up state for the assigned SME.
3. Implement endpoint `POST /api/commute/trigger-traffic-call` to initiate phone outreach flow for the assigned SME.
4. Implement endpoint `POST /api/conflicts/resolve` to persist SME choices and update metadata.

Suggested consumer API payload for future frontend/mobile:
```json
{
  "event_type": "EVENT_COMMUTE_TRAFFIC",
  "sme_id": "user_77",
  "conflict_id": "conf_101",
  "contact_channel": "phone",
  "traffic_context": {
    "commuting": true,
    "traffic_level": "high"
  }
}
```

### Phase 3: SME Micro-Nudge Interface (1.5 - 2h)
1. Build a banner or pop-up component titled **"Meeting Finished Early! (20 min gap)"**.
2. Render the top-ranked question card with side-by-side conflict sources.
3. Add single-click resolution buttons that trigger `POST /api/conflicts/resolve`.

### Phase 4: Support Agent Search & Trust Display (1.5 - 2h)
1. Build the Frontline Support Agent Search screen.
2. **Before Resolution:** Searching "Volvo overtime rules" returns an **"Ambiguity Warning / Conflict Detected"** alert.
3. **After Resolution:** Searching "Volvo overtime rules" returns the verified answer with a **Green Verified Badge**, author timestamp, and explainability breakdown.

### Phase 5: Demo Integration & Polish (1h)
1. Add a **"Simulate 24/7 Sentinel Scan"** button to live-generate new conflicts on demand.
2. Add a **"Simulate Meeting Ended 20 Min Early"** quick-trigger button in the UI toolbar for easy live presentation.
3. Add a **"Simulate Commute Traffic (Phone Trigger)"** quick-trigger button to demonstrate the second trigger path.

### Phase 6 (Optional Stretch): Video Agent Frontend Extension
1. If time allows, integrate an **ElevenLabs video agent** in the frontend as a guided assistant layer.
2. Use it to present conflict context, read out A/B options, and capture the SME choice in a conversational format.
3. Keep this optional and non-blocking: core PoC value remains collision detection, prioritization, and verified resolution flow.

---

## 7. Key Pitch & Demo Flow Script

1. **Step 1 (The Problem):** Log in as support agent. Search for "Volvo overtime". See visual red alert showing conflicting rules between SharePoint and Teams.
2. **Step 2 (The Sentinel):** Switch view to Sentinel Control Center. Show how Volvo's recent ticket spike raised the conflict's priority score to #1.
3. **Step 3 (The Dead Moment):** Click "Simulate Meeting Ended 20m Early". Switch view to Sarah (SME). A micro-card appears in her screen. She clicks "150% after 7.5h" in 3 seconds.
4. **Step 4 (The Unblocked Workflow):** Switch back to support agent. Re-run search. Result now displays **Verified by Sarah 5s ago (Trust Score: 98%)**. Ticket is ready to close.