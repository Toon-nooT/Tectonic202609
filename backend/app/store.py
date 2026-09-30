import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from . import detector
from .models import SME, KnowledgeConflict, ScanReport, VerifiedKnowledge
from .scoring import priority_score

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"


class Store:
    """In-memory store seeded from data/*.seed.json."""

    def __init__(self, data_dir: Optional[Path] = None) -> None:
        self.data_dir = Path(data_dir or os.environ.get("KP_DATA_DIR") or DEFAULT_DATA_DIR)
        self._lock = threading.RLock()
        self.conflicts: dict[str, KnowledgeConflict] = {}
        self.smes: dict[str, SME] = {}
        self.frontline_agents: list[dict] = []
        self.verified: dict[str, VerifiedKnowledge] = {}
        self.outreach_log: list[dict] = []
        self.last_scan: Optional[ScanReport] = None
        self.load(seed_conflicts=os.environ.get("KP_START_EMPTY", "").lower() not in ("1", "true"))

    def load(self, seed_conflicts: bool = True) -> None:
        """(Re)load profiles and, optionally, the pre-aggregated conflict seed.

        With seed_conflicts=False the store starts empty so a sentinel scan over data/raw
        is what produces the conflicts.
        """
        with self._lock:
            conflicts_raw = json.loads(
                (self.data_dir / "knowledge_conflicts.seed.json").read_text(encoding="utf-8")
            )
            profiles_raw = json.loads(
                (self.data_dir / "profiles.seed.json").read_text(encoding="utf-8")
            )
            self.conflicts = {}
            for raw in conflicts_raw if seed_conflicts else []:
                conflict = KnowledgeConflict.model_validate(raw)
                conflict.priority_score = priority_score(conflict)
                self.conflicts[conflict.id] = conflict
            self.smes = {s["id"]: SME.model_validate(s) for s in profiles_raw["smes"]}
            self.frontline_agents = profiles_raw.get("frontline_agents", [])
            self.verified = {}
            self.outreach_log = []
            self.last_scan = None

    # ---- sentinel ----

    def scan(self, extractor: str = "auto") -> ScanReport:
        """Run the collision sentinel over data/raw and upsert the detected conflicts.

        Already-RESOLVED conflicts are never reopened by a re-scan.
        """
        with self._lock:
            detected, report = detector.run_scan(self.data_dir, self.smes, extractor)
            for conflict in detected:
                conflict.priority_score = priority_score(conflict)
                existing = self.conflicts.get(conflict.id)
                if existing is not None and existing.status == "RESOLVED":
                    report.skipped_resolved.append(conflict.id)
                    continue
                (report.updated if existing is not None else report.created).append(conflict.id)
                self.conflicts[conflict.id] = conflict
            report.conflicts = self.pending()
            report.steps.append(
                f"Scan complete: {len(report.created)} new, {len(report.updated)} updated, "
                f"{len(report.skipped_resolved)} already resolved (kept)"
            )
            self.last_scan = report
            return report

    # ---- queries ----

    def pending(self, sme_id: Optional[str] = None) -> list[KnowledgeConflict]:
        with self._lock:
            items = [
                c
                for c in self.conflicts.values()
                if c.status == "OPEN" and (sme_id is None or c.assigned_sme.id == sme_id)
            ]
            return sorted(items, key=lambda c: c.priority_score, reverse=True)

    def top_for_sme(self, sme_id: str) -> Optional[KnowledgeConflict]:
        items = self.pending(sme_id)
        return items[0] if items else None

    # ---- mutations ----

    def resolve(
        self,
        conflict: KnowledgeConflict,
        answer: str,
        verifier: SME,
        verification_source: str,
        trust_score: float,
        archived_note: str,
    ) -> VerifiedKnowledge:
        with self._lock:
            conflict.status = "RESOLVED"
            fact = VerifiedKnowledge(
                id=f"fact_{500 + len(self.verified) + 1}",
                topic=conflict.topic,
                client_context=conflict.client_context,
                verified_answer=answer,
                verified_by=f"{verifier.name} ({verifier.role})",
                verified_at=datetime.now(timezone.utc),
                verification_source=verification_source,
                trust_score=trust_score,
                resolved_conflict_id=conflict.id,
                archived_conflict_note=archived_note,
            )
            self.verified[fact.id] = fact
            return fact

    def log_outreach(self, entry: dict) -> None:
        with self._lock:
            self.outreach_log.append(entry)


store = Store()
