import os
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    CommuteTrafficRequest,
    EarlyFinishRequest,
    KnowledgeConflict,
    NudgeResponse,
    PhoneOutreachResponse,
    ResolveRequest,
    ScanReport,
    SearchResponse,
    SME,
    VerifiedKnowledge,
)
from .services import build_phone_outreach, context_anchor, search
from .store import store

FRONTEND_BASE_URL = os.environ.get("KP_FRONTEND_URL", "http://localhost:5173")

app = FastAPI(
    title="KnowledgePulse Sentinel API",
    version="0.1.0",
    description="Consumer API for the KnowledgePulse frontend(s).",
)

# PoC: frontend is developed separately; allow any origin (no credentials).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_sme(sme_id: str) -> SME:
    sme = store.smes.get(sme_id)
    if not sme:
        raise HTTPException(status_code=404, detail=f"SME '{sme_id}' not found")
    return sme


def _get_conflict(conflict_id: str) -> KnowledgeConflict:
    conflict = store.conflicts.get(conflict_id)
    if not conflict:
        raise HTTPException(status_code=404, detail=f"Conflict '{conflict_id}' not found")
    return conflict


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "open_conflicts": len(store.pending())}


# ---------- Read ----------


@app.get("/api/conflicts/pending", response_model=list[KnowledgeConflict])
def pending_conflicts(sme_id: Optional[str] = None) -> list[KnowledgeConflict]:
    return store.pending(sme_id)


@app.get("/api/conflicts/{conflict_id}", response_model=KnowledgeConflict)
def get_conflict(conflict_id: str) -> KnowledgeConflict:
    return _get_conflict(conflict_id)


@app.get("/api/smes", response_model=list[SME])
def list_smes() -> list[SME]:
    return list(store.smes.values())


@app.get("/api/knowledge", response_model=list[VerifiedKnowledge])
def list_verified() -> list[VerifiedKnowledge]:
    return sorted(store.verified.values(), key=lambda v: v.verified_at, reverse=True)


@app.get("/api/search", response_model=SearchResponse)
def search_knowledge(q: str = Query(..., min_length=2)) -> SearchResponse:
    results = search(q, list(store.conflicts.values()), list(store.verified.values()))
    return SearchResponse(query=q, results=results)


# ---------- Collision Sentinel ----------


@app.post("/api/sentinel/scan", response_model=ScanReport)
def sentinel_scan() -> ScanReport:
    """Parse data/raw, extract facts, detect contradictions, score and route them."""
    return store.scan()


@app.get("/api/sentinel/last-scan", response_model=ScanReport)
def sentinel_last_scan() -> ScanReport:
    if store.last_scan is None:
        raise HTTPException(status_code=404, detail="No scan has run yet")
    return store.last_scan


# ---------- Trigger 1: dead moment (calendar) ----------


@app.post("/api/calendar/trigger-early-finish", response_model=NudgeResponse)
def trigger_early_finish(req: EarlyFinishRequest) -> NudgeResponse:
    sme = _get_sme(req.sme_id)
    conflict = store.top_for_sme(sme.id)
    if not conflict:
        return NudgeResponse(
            event_type="EVENT_EARLY_FINISH",
            triggered=False,
            reason="No open conflicts assigned to this SME",
            sme=sme,
        )
    return NudgeResponse(
        event_type="EVENT_EARLY_FINISH",
        triggered=True,
        headline=f"Meeting Finished Early! ({req.minutes_available} min gap)",
        context_anchor=context_anchor(conflict),
        sme=sme,
        conflict=conflict,
    )


# ---------- Trigger 2: commute traffic (phone) ----------


@app.post("/api/commute/trigger-traffic-call", response_model=PhoneOutreachResponse)
def trigger_traffic_call(req: CommuteTrafficRequest) -> PhoneOutreachResponse:
    sme = _get_sme(req.sme_id)
    if not req.traffic_context.commuting:
        return PhoneOutreachResponse(
            event_type=req.event_type,
            triggered=False,
            reason="SME is not commuting",
            sme=sme,
        )
    if not sme.phone:
        return PhoneOutreachResponse(
            event_type=req.event_type,
            triggered=False,
            reason="SME has no phone number on file",
            sme=sme,
        )

    if req.conflict_id:
        conflict = _get_conflict(req.conflict_id)
        if conflict.status != "OPEN":
            raise HTTPException(status_code=409, detail="Conflict is already resolved")
        if conflict.assigned_sme.id != sme.id:
            raise HTTPException(status_code=403, detail="Conflict is not assigned to this SME")
    else:
        conflict = store.top_for_sme(sme.id)
        if not conflict:
            return PhoneOutreachResponse(
                event_type=req.event_type,
                triggered=False,
                reason="No open conflicts assigned to this SME",
                sme=sme,
            )

    outreach = build_phone_outreach(sme, conflict, req.event_type, FRONTEND_BASE_URL)
    store.log_outreach(outreach.model_dump(mode="json"))
    return outreach


@app.get("/api/outreach")
def outreach_log() -> list[dict]:
    return store.outreach_log


# ---------- Resolution ----------


@app.post("/api/conflicts/resolve", response_model=VerifiedKnowledge)
def resolve_conflict(req: ResolveRequest) -> VerifiedKnowledge:
    conflict = _get_conflict(req.conflict_id)
    verifier = _get_sme(req.verifier_id)
    if conflict.status != "OPEN":
        raise HTTPException(status_code=409, detail="Conflict is already resolved")
    if conflict.assigned_sme.id != verifier.id:
        raise HTTPException(status_code=403, detail="Verifier is not the assigned SME")

    if req.chosen_option == "A":
        answer, overridden, trust = conflict.source_a.excerpt, conflict.source_b, 0.98
    elif req.chosen_option == "B":
        answer, overridden, trust = conflict.source_b.excerpt, conflict.source_a, 0.98
    else:
        answer, overridden, trust = (req.custom_answer or "").strip(), None, 0.92

    if overridden is not None:
        note = f"Overrode [{overridden.type}] {overridden.title}: \"{overridden.excerpt}\""
    else:
        note = (
            f"Overrode both [{conflict.source_a.type}] {conflict.source_a.title} and "
            f"[{conflict.source_b.type}] {conflict.source_b.title} with a custom answer"
        )

    return store.resolve(conflict, answer, verifier, req.verification_source, trust, note)


# ---------- Demo helpers ----------


@app.post("/api/demo/reset")
def demo_reset(seed_conflicts: bool = True) -> dict:
    """Reset state. Use seed_conflicts=false to start empty and let /api/sentinel/scan fill it."""
    store.load(seed_conflicts=seed_conflicts)
    return {"status": "reset", "open_conflicts": len(store.pending())}
