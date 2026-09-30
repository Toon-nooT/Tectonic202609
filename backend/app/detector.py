"""Collision Sentinel: parse raw files -> extract facts -> compare -> KnowledgeConflict objects."""

import csv
import json
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

from . import llm
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
    description: str = ""
    client_context: str
    severity: Severity
    normalize: Literal["number", "month_day", "text"] = "text"
    extractors: list[Extractor] = Field(default_factory=list)


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
    return re.sub(r"^(?:[-*\u2022]\s+|\d+[.)]\s+)", "", text[left:right].strip())


def normalize_value(kind: str, raw: str) -> str:
    raw = raw.strip()
    if kind == "number":
        m = re.search(r"\d+(?:[.,]\d+)?", raw)
        if m is None:
            raise ValueError(f"no number in '{raw}'")
        return format(float(m.group(0).replace(",", ".")), "g")
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


def ground_llm_facts(
    raw_facts: list[dict],
    doc: ParsedDocument,
    entry: CatalogEntry,
    rules_by_id: dict[str, Rule],
) -> tuple[list[Fact], int, list[str]]:
    """Keep only LLM facts whose quoted evidence exists verbatim in the document and contains the value."""
    facts: list[Fact] = []
    rejected = 0
    notes: list[str] = []
    for f in raw_facts:
        rule = rules_by_id.get(str(f.get("rule_id")))
        value = str(f.get("value", "")).strip()
        evidence = str(f.get("evidence", "")).strip()
        reason = None
        m = None
        norm = ""
        if rule is None:
            reason = "unknown rule_id"
        elif not value or not evidence:
            reason = "missing value or evidence"
        else:
            pattern = r"\s+".join(re.escape(t) for t in evidence.split())
            m = re.search(pattern, doc.text, re.IGNORECASE)
            if m is None:
                reason = "evidence not found in document"
            elif value.lower() not in evidence.lower():
                reason = "value not in evidence"
            else:
                try:
                    norm = normalize_value(rule.normalize, value)
                except ValueError:
                    reason = "value not parseable"
        if reason:
            rejected += 1
            notes.append(f"  rejected LLM fact from {entry.title} ({reason}): {str(f)[:140]}")
            continue
        if doc.format == "csv" and f.get("statement"):
            excerpt = str(f["statement"]).strip()
        else:
            # anchor on the value inside the quote, so a quote ending at the full stop
            # doesn't make the sentence expansion spill into the next sentence
            vm = re.search(re.escape(value), doc.text[m.start() : m.end()], re.IGNORECASE)
            s, e = (m.start() + vm.start(), m.start() + vm.end()) if vm else (m.start(), m.end())
            excerpt = sentence_around(doc.text, s, e)
        facts.append(Fact(rule, entry, value, norm, excerpt))
    return facts, rejected, notes


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


def run_scan(
    data_dir: Path, smes: dict[str, SME], extractor: str = "auto"
) -> tuple[list[KnowledgeConflict], ScanReport]:
    """extractor: 'llm' (LLM only), 'regex' (rules only), 'auto' (LLM if configured, regex per-doc fallback)."""
    repo_root = data_dir.parent
    steps: list[str] = []
    report = ScanReport(run_at=datetime.now(timezone.utc))

    cfg = llm.load_config() if extractor in ("llm", "auto") else None
    if extractor == "llm" and cfg is None:
        raise llm.LLMError("LLM extractor requested but OPENROUTER_API_KEY is not configured")
    report.extractor_mode = (
        "regex"
        if cfg is None
        else f"llm ({cfg.model})" + (" with regex fallback" if extractor == "auto" else "")
    )

    catalog = [
        CatalogEntry.model_validate(e)
        for e in json.loads((data_dir / "source_catalog.seed.json").read_text(encoding="utf-8"))
    ]
    rules = [
        Rule.model_validate(r)
        for r in json.loads((data_dir / "detection_rules.json").read_text(encoding="utf-8"))["rules"]
    ]
    steps.append(
        f"Loaded {len(catalog)} registered sources and {len(rules)} topics; extractor: {report.extractor_mode}"
    )
    rules_by_id = {r.rule_id: r for r in rules}

    # 1) ingest
    parsed: list[tuple[CatalogEntry, ScannedDocument, Optional[ParsedDocument]]] = []
    for entry in catalog:
        sd = ScannedDocument(
            source_id=entry.source_id, raw_path=entry.raw_path, format=entry.format, status="PARSED"
        )
        doc: Optional[ParsedDocument] = None
        try:
            doc = parse_file(repo_root / entry.raw_path)
            sd.lines = doc.line_count
        except FileNotFoundError:
            sd.status = "MISSING"
            steps.append(f"WARNING: {entry.raw_path} not found")
        except Exception as exc:  # malformed file must not abort the whole scan
            sd.status = "ERROR"
            sd.error = str(exc)
            steps.append(f"WARNING: failed to parse {entry.raw_path}: {exc}")
        report.documents.append(sd)
        parsed.append((entry, sd, doc))

    # 2) extract (LLM calls run in parallel; results are validated against the source text)
    llm_results: dict[str, object] = {}
    if cfg:
        specs = [{"rule_id": r.rule_id, "description": r.description or r.topic} for r in rules]

        def _call(item):
            entry, _, doc = item
            try:
                return entry.source_id, llm.extract_facts(cfg, entry.title, entry.format, doc.text, specs)
            except llm.LLMError as exc:
                return entry.source_id, exc

        todo = [p for p in parsed if p[2] is not None]
        with ThreadPoolExecutor(max_workers=5) as pool:
            for sid, res in pool.map(_call, todo):
                llm_results[sid] = res

    all_facts: list[Fact] = []
    for entry, sd, doc in parsed:
        if doc is None:
            continue
        res = llm_results.get(entry.source_id)
        if isinstance(res, list):
            facts, sd.rejected_facts, notes = ground_llm_facts(res, doc, entry, rules_by_id)
            sd.extractor = "llm"
            how = f"LLM, {sd.rejected_facts} rejected as ungrounded"
        else:
            if isinstance(res, Exception):
                if extractor == "llm":
                    sd.status = "ERROR"
                    sd.error = str(res)
                    steps.append(f"WARNING: LLM extraction failed for {entry.title}: {res}")
                    continue
                steps.append(f"WARNING: LLM failed for {entry.title} ({res}); falling back to regex")
            facts, notes = extract_facts(doc, entry, rules), []
            sd.extractor = "regex"
            how = "regex"
        sd.facts_found = len(facts)
        steps.append(
            f"Parsed {entry.raw_path} ({entry.format}, {sd.lines} lines) -> {len(facts)} fact(s) [{how}]"
        )
        steps.extend(notes)
        all_facts.extend(facts)
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
