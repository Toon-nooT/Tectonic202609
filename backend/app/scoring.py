from .models import KnowledgeConflict

SEVERITY_SCORE = {"HIGH": 10, "MEDIUM": 6, "LOW": 3}


def priority_score(conflict: KnowledgeConflict) -> float:
    """Priority = client tier score x active ticket spike count x conflict severity."""
    return float(
        conflict.client_tier
        * conflict.active_tickets_count
        * SEVERITY_SCORE[conflict.conflict_severity]
    )
