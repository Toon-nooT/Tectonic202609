"""Collision Sentinel: parse raw files -> extract facts -> compare -> KnowledgeConflict objects."""

import csv
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .ingestion import ParsedDocument, parse_file
from .models import (
    SME,
    KnowledgeConflict,
    ScannedDocument,
    ScanReport,
    Severity,
    SMERef,
    Source,
)


class CatalogEntry(BaseModel):
    source_id: str
    system: str
    type: str
    format: str
    title: str
    owner_team: str
    uri: str
    raw_path: str
    mime_type: Optional[str] = None


class Extractor(BaseModel):
    pattern: str
    statement: Optional[str] = None


class Rule(BaseModel):
    rule_id: str
    conflict_id: str
    topic: str
    client_context: str
    severity: Severity
    normalize: Literal["number", "month_day", "text"] = "text"
    extractors: list[Extractor]


@dataclass
class Fact:
    rule: Rule
    entry: CatalogEntry
    value_raw: str
    value_norm: str
    excerpt: str


# ---------- helpers ----------


def sentence_around(text: str, start: int, end: int) -> str:
    """Expand a match to the sentence/line that contains it (used as human-readable evidence)."""
    left = 0
    for sep in ("\n", ". ", "? ", "! ", ": "):
        i = text.rfind(sep, 0, start)
        if i != -1:
            left = max(left, i + len(sep))
    m = re.compile(r"[.!?](?=\s|$)|\n").search(text, end)
    if m is None:
        right = len(text)
    else:
        right = m.start() if m.group(0) == "\n" else m.end()
    return text[left:right].strip()


def normalize_value(kind: str, raw: str) -> str:
    raw = raw.strip()
    if kind == "number":
        return format(float(raw), "g")
    if kind == "month_day":
        for fmt in ("%B %d", "%b %d", "%Y-%m-%d"):
            try:
                d = datetime.strptime(raw, fmt)
                return f"{d.month:02d}-{d.day:02d}"
            except ValueError:
                continue
        return raw.lower()
    return raw.lower()


def _read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def extract_facts(doc: ParsedDocument, entry: CatalogEntry, rules: list[Rule]) -> list[Fact]:
    facts: list[Fact] = []
    for rule in rules:
        for ex in rule.extractors:
            for m in re.finditer(ex.pattern, doc.text, re.IGNORECASE):
                raw = m.group("value")
                excerpt = (
                    ex.statement.format(value=raw)
                    if ex.statement
                    else sentence_around(doc.text, m.start(), m.end())
                )
                facts.append(
                    Fact(rule, entry, raw, normalize_value(rule.normalize, raw), excerpt)
                )
    return facts


def _to_source(fact: Fact) -> Source:
    e = fact.entry
    return Source(
        source_id=e.source_id,
        type=e.type,
        format=e.format,
        title=e.title,
        owner_team=e.owner_team,
        uri=e.uri,
        raw_path=e.raw_path,
        excerpt=fact.excerpt,
    )


# ---------- main pipeline ----------


def run_scan(data_dir: Path, smes: dict[str, SME]) -> tuple[list[KnowledgeConflict], ScanReport]:
    repo_root = data_dir.parent
    steps: list[str] = []
    report = ScanReport(run_at=datetime.now(timezone.utc))

    catalog = [
        CatalogEntry.model_validate(e)
        for e in json.loads((data_dir / "source_catalog.seed.json").read_text(encoding="utf-8"))
    ]
    rules = [
        Rule.model_validate(r)
        for r in json.loads((data_dir / "detection_rules.json").read_text(encoding="utf-8"))["rules"]
    ]
    steps.append(f"Loaded {len(catalog)} registered sources and {len(rules)} fact-extraction rules")

    # 1) ingest + 2) extract
    all_facts: list[Fact] = []
    for entry in catalog:
        path = repo_root / entry.raw_path
        sd = ScannedDocument(source_id=entry.source_id, raw_path=entry.raw_path, format=entry.format, status="PARSED")
        try:
            doc = parse_file(path)
            sd.lines = doc.line_count
            facts = extract_facts(doc, entry, rules)
            sd.facts_found = len(facts)
            all_facts.extend(facts)
            steps.append(
                f"Parsed {entry.raw_path} ({entry.format}, {sd.lines} lines) -> {len(facts)} relevant fact(s)"
            )
        except FileNotFoundError:
            sd.status = "MISSING"
            steps.append(f"WARNING: {entry.raw_path} not found")
        except Exception as exc:  # malformed file must not abort the whole scan
            sd.status = "ERROR"
            sd.error = str(exc)
            steps.append(f"WARNING: failed to parse {entry.raw_path}: {exc}")
        report.documents.append(sd)
    report.facts_extracted = len(all_facts)

    # reference data
    tiers = {r["client"]: int(r["tier_score"]) for r in _read_csv(data_dir / "reference" / "client_tiers.csv")}
    tickets = {
        r["rule_id"]: int(r["open_tickets_48h"])
        for r in _read_csv(data_dir / "reference" / "ticket_volume_48h.csv")
    }
    ownership = _read_csv(data_dir / "reference" / "topic_ownership_history.csv")

    # 3) compare -> conflicts
    conflicts: list[KnowledgeConflict] = []
    for rule in rules:
        facts = [f for f in all_facts if f.rule.rule_id == rule.rule_id]
        by_value: dict[str, Fact] = {}
        for f in facts:  # first fact per distinct value, in catalog order
            by_value.setdefault(f.value_norm, f)
        if len(by_value) < 2:
            steps.append(f"[{rule.topic}] {len(facts)} fact(s), consistent -> no conflict")
            continue
        fa, fb = list(by_value.values())[:2]
        steps.append(
            f"[{rule.topic}] CONFLICT: '{fa.value_raw}' ({fa.entry.title}) vs "
            f"'{fb.value_raw}' ({fb.entry.title})"
        )

        # 4) business context + SME routing
        tier = tiers.get(rule.client_context)
        if tier is None:
            tier = 1
            steps.append(f"[{rule.topic}] WARNING: no tier for '{rule.client_context}', defaulting to 1")
        candidates = [r for r in ownership if r["rule_id"] == rule.rule_id and r["sme_id"] in smes]
        if not candidates:
            steps.append(f"[{rule.topic}] WARNING: no known SME owns this topic; conflict skipped")
            continue
        best = max(candidates, key=lambda r: (int(r["questions_answered_12m"]), r["last_answered_at"]))
        sme = smes[best["sme_id"]]
        steps.append(
            f"[{rule.topic}] routed to {sme.name} "
            f"({best['questions_answered_12m']} answered in last 12m)"
        )

        conflicts.append(
            KnowledgeConflict(
                id=rule.conflict_id,
                topic=rule.topic,
                client_context=rule.client_context,
                client_tier=tier,
                active_tickets_count=tickets.get(rule.rule_id, 0),
                conflict_severity=rule.severity,
                source_a=_to_source(fa),
                source_b=_to_source(fb),
                assigned_sme=SMERef(id=sme.id, name=sme.name, role=sme.role),
            )
        )

    report.conflicts_detected = len(conflicts)
    report.steps = steps
    return conflicts, report
