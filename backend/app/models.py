from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

Severity = Literal["HIGH", "MEDIUM", "LOW"]
ConflictStatus = Literal["OPEN", "RESOLVED"]
TrafficLevel = Literal["low", "medium", "high"]


class Source(BaseModel):
    source_id: str
    type: str
    format: str
    title: str
    owner_team: str
    uri: str
    raw_path: Optional[str] = None
    excerpt: str


class SMERef(BaseModel):
    id: str
    name: str
    role: str


class SME(SMERef):
    phone: Optional[str] = None
    teams_id: Optional[str] = None


class KnowledgeConflict(BaseModel):
    id: str
    topic: str
    client_context: str
    client_tier: int
    active_tickets_count: int
    conflict_severity: Severity
    source_a: Source
    source_b: Source
    priority_score: float = 0
    assigned_sme: SMERef
    status: ConflictStatus = "OPEN"


class VerifiedKnowledge(BaseModel):
    id: str
    topic: str
    client_context: str
    verified_answer: str
    verified_by: str
    verified_at: datetime
    verification_source: str
    trust_score: float
    resolved_conflict_id: str
    archived_conflict_note: str


class ScannedDocument(BaseModel):
    source_id: str
    raw_path: str
    format: str
    status: Literal["PARSED", "MISSING", "ERROR"]
    lines: int = 0
    facts_found: int = 0
    rejected_facts: int = 0
    extractor: Literal["regex", "llm"] = "regex"
    error: Optional[str] = None


class ScanReport(BaseModel):
    run_at: datetime
    extractor_mode: str = "regex"
    documents: list[ScannedDocument] = Field(default_factory=list)
    facts_extracted: int = 0
    conflicts_detected: int = 0
    created: list[str] = Field(default_factory=list)
    updated: list[str] = Field(default_factory=list)
    skipped_resolved: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    conflicts: list[KnowledgeConflict] = Field(default_factory=list)


# ---------- Requests ----------


class EarlyFinishRequest(BaseModel):
    sme_id: str
    minutes_available: int = Field(default=20, ge=1, le=240)


class TrafficContext(BaseModel):
    commuting: bool = True
    traffic_level: TrafficLevel = "high"
    eta_minutes: Optional[int] = Field(default=None, ge=0)


class CommuteTrafficRequest(BaseModel):
    event_type: Literal["EVENT_COMMUTE_TRAFFIC"] = "EVENT_COMMUTE_TRAFFIC"
    sme_id: str
    conflict_id: Optional[str] = None
    contact_channel: Literal["phone"] = "phone"
    traffic_context: TrafficContext = Field(default_factory=TrafficContext)


class ResolveRequest(BaseModel):
    conflict_id: str
    chosen_option: Literal["A", "B", "CUSTOM"]
    custom_answer: Optional[str] = None
    verifier_id: str
    verification_source: str = "Early-Finish Micro-Sync"

    @model_validator(mode="after")
    def _custom_needs_answer(self) -> "ResolveRequest":
        if self.chosen_option == "CUSTOM" and not (self.custom_answer or "").strip():
            raise ValueError("custom_answer is required when chosen_option is CUSTOM")
        return self


# ---------- Responses ----------


class NudgeResponse(BaseModel):
    event_type: str
    triggered: bool
    reason: Optional[str] = None
    headline: Optional[str] = None
    context_anchor: Optional[str] = None
    sme: Optional[SMERef] = None
    conflict: Optional[KnowledgeConflict] = None


class VoiceOption(BaseModel):
    option: Literal["A", "B"]
    utterance: str


class PhoneOutreachResponse(BaseModel):
    outreach_id: Optional[str] = None
    event_type: str
    triggered: bool
    reason: Optional[str] = None
    channel: Literal["phone"] = "phone"
    status: Optional[Literal["CALL_QUEUED"]] = None
    sme: Optional[SMERef] = None
    phone_masked: Optional[str] = None
    call_script: Optional[str] = None
    voice_options: list[VoiceOption] = Field(default_factory=list)
    fallback_text_link: Optional[str] = None
    conflict: Optional[KnowledgeConflict] = None


class SearchResult(BaseModel):
    kind: Literal["VERIFIED", "CONFLICT_WARNING"]
    topic: str
    client_context: str
    message: str
    verified: Optional[VerifiedKnowledge] = None
    conflict: Optional[KnowledgeConflict] = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
