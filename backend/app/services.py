import re
import uuid
from typing import Optional

from .models import (
    SME,
    KnowledgeConflict,
    PhoneOutreachResponse,
    SearchResult,
    VoiceOption,
)

_STOPWORDS = {"the", "and", "for", "what", "how", "are", "rules", "rule", "with", "from", "that"}


def mask_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    return f"{phone[:3]}***{digits[-3:]}"


def context_anchor(conflict: KnowledgeConflict) -> str:
    return (
        f"Unblock {conflict.active_tickets_count} tickets for {conflict.client_context}: "
        f"{conflict.topic}"
    )


def build_phone_outreach(
    sme: SME, conflict: KnowledgeConflict, event_type: str, base_url: str
) -> PhoneOutreachResponse:
    script = (
        f"Hi {sme.name.split()[0]}, this is KnowledgePulse. I have one quick question about "
        f"{conflict.topic} for {conflict.client_context}; {conflict.active_tickets_count} support "
        f"tickets are waiting on it. "
        f"Option A: {conflict.source_a.excerpt} "
        f"Option B: {conflict.source_b.excerpt} "
        f"Please say 'option A' or 'option B'."
    )
    return PhoneOutreachResponse(
        outreach_id=f"out_{uuid.uuid4().hex[:8]}",
        event_type=event_type,
        triggered=True,
        status="CALL_QUEUED",
        sme=sme,
        phone_masked=mask_phone(sme.phone),
        call_script=script,
        voice_options=[
            VoiceOption(option="A", utterance=conflict.source_a.excerpt),
            VoiceOption(option="B", utterance=conflict.source_b.excerpt),
        ],
        fallback_text_link=f"{base_url}/nudge/{conflict.id}",
        conflict=conflict,
    )


def search(
    query: str,
    conflicts: list[KnowledgeConflict],
    verified: list,
) -> list[SearchResult]:
    tokens = {
        t for t in re.findall(r"[a-z0-9]+", query.lower()) if len(t) > 2 and t not in _STOPWORDS
    }
    if not tokens:
        return []

    def score(text: str) -> int:
        words = set(re.findall(r"[a-z0-9]+", text.lower()))
        return len(tokens & words)

    resolved_ids = {v.resolved_conflict_id for v in verified}
    scored: list[tuple[int, SearchResult]] = []

    for fact in verified:
        s = score(f"{fact.topic} {fact.client_context}")
        if s:
            scored.append(
                (
                    s,
                    SearchResult(
                        kind="VERIFIED",
                        topic=fact.topic,
                        client_context=fact.client_context,
                        message=fact.verified_answer,
                        verified=fact,
                    ),
                )
            )
    for c in conflicts:
        if c.status != "OPEN" or c.id in resolved_ids:
            continue
        s = score(f"{c.topic} {c.client_context}")
        if s:
            scored.append(
                (
                    s,
                    SearchResult(
                        kind="CONFLICT_WARNING",
                        topic=c.topic,
                        client_context=c.client_context,
                        message="Ambiguity warning: sources disagree on this topic. "
                        "Do not act until verified by the SME.",
                        conflict=c,
                    ),
                )
            )
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [r for _, r in scored]
