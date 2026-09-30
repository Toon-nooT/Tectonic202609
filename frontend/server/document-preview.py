"""Isolated, bounded judge preview using the existing backend extraction pipeline."""
from __future__ import annotations

import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
import threading

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "data"
RAW = DATA / "raw"
MAX_INPUT_BYTES = 16 * 1024
MAX_TEXT = 5000


class PreviewError(Exception):
    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


def source_path(raw_path):
    relative = Path(raw_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise PreviewError("The source has an unsupported document path.", "INVALID_SOURCE")
    resolved = (REPO / relative).resolve()
    if not resolved.is_relative_to(RAW.resolve()):
        raise PreviewError("The source path is outside the allowed document collection.", "INVALID_SOURCE")
    return resolved


def validate(payload):
    if not isinstance(payload, dict):
        raise PreviewError("Expected a JSON object.", "INVALID_INPUT")
    for key in ("conflict_id", "source_id"):
        value = payload.get(key)
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
            raise PreviewError("Select a known conflict and source.", "INVALID_INPUT")
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
        raise PreviewError("Preview text must contain 1–5,000 characters.", "INVALID_INPUT")
    if payload.get("extractor") not in ("regex", "llm"):
        raise PreviewError("Choose the regex or llm extractor.", "INVALID_INPUT")
    return payload


def main(payload):
    payload = validate(payload)
    sys.path.insert(0, str(REPO / "backend"))
    from app.detector import CatalogEntry, Rule, extract_facts
    from app.ingestion import parse_file
    from app.store import Store
    from app import llm

    rules_doc = json.loads((DATA / "detection_rules.json").read_text(encoding="utf-8"))
    raw_rule = next((rule for rule in rules_doc["rules"] if rule.get("conflict_id") == payload["conflict_id"]), None)
    if raw_rule is None:
        raise PreviewError("This conflict is not a configured preview topic.", "UNKNOWN_TOPIC")
    rule = Rule.model_validate(raw_rule)
    catalog = json.loads((DATA / "source_catalog.seed.json").read_text(encoding="utf-8"))

    # Membership comes only from trusted repository metadata and extraction on
    # existing documents, never from a user-supplied path or claimed source ID.
    member_ids = set()
    seeds = json.loads((DATA / "knowledge_conflicts.seed.json").read_text(encoding="utf-8"))
    for conflict in seeds:
        if conflict.get("id") == payload["conflict_id"]:
            member_ids.update(source["source_id"] for source in [conflict["source_a"], conflict["source_b"], *conflict.get("additional_sources", [])])
    for raw_entry in catalog:
        entry = CatalogEntry.model_validate(raw_entry)
        try:
            path = source_path(entry.raw_path)
        except PreviewError:
            continue
        try:
            if extract_facts(parse_file(path), entry, [rule]):
                member_ids.add(entry.source_id)
        except (FileNotFoundError, ValueError, json.JSONDecodeError):
            continue
    selected = [entry for entry in catalog if entry["source_id"] in member_ids]
    if payload["source_id"] not in {entry["source_id"] for entry in selected}:
        raise PreviewError("The selected source does not belong to this configured topic.", "SOURCE_TOPIC_MISMATCH")
    if len(selected) < 2 or len(selected) > 3:
        raise PreviewError("Preview requires two or three registered sources for this topic.", "UNSUPPORTED_SOURCE_COUNT")

    if payload["extractor"] == "llm" and llm.load_config() is None:
        raise PreviewError("The LLM provider is not configured on this machine. Choose regex or ask the demo operator.", "LLM_NOT_CONFIGURED", 503)

    # The provider client can retry an unsupported response format. Count actual
    # HTTP calls, including retries, and stop at three across all source workers.
    calls = 0
    lock = threading.Lock()
    original_post = llm.httpx.Client.post

    def bounded_post(client, *args, **kwargs):
        nonlocal calls
        with lock:
            if calls >= 3:
                raise llm.LLMError("Preview provider-request limit reached")
            calls += 1
        return original_post(client, *args, **kwargs)

    llm.httpx.Client.post = bounded_post
    try:
        with tempfile.TemporaryDirectory(prefix="knowledgepulse-preview-") as temporary:
            temp_root = Path(temporary)
            temp_data = temp_root / "data"
            temp_data.mkdir()
            for filename in ("profiles.seed.json", "knowledge_conflicts.seed.json"):
                shutil.copy2(DATA / filename, temp_data / filename)
            shutil.copytree(DATA / "reference", temp_data / "reference")
            for entry in selected:
                original = source_path(entry["raw_path"])
                destination = (temp_root / entry["raw_path"]).resolve()
                if not destination.is_relative_to(temp_root.resolve()):
                    raise PreviewError("The preview destination is outside its temporary workspace.", "INVALID_SOURCE")
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(original, destination)
            changed = next(entry for entry in selected if entry["source_id"] == payload["source_id"])
            original_title = changed["title"]
            # Pasted text is plain text even when the original is a JSON export.
            # A preview URI prevents it being mistaken for the unchanged original.
            changed["raw_path"] = f"data/preview/{payload['source_id']}.txt"
            changed["format"] = "txt"
            changed["mime_type"] = "text/plain"
            changed["uri"] = f"preview://{payload['source_id']}"
            changed["title"] = f"{original_title} (preview)"
            replacement = temp_root / changed["raw_path"]
            replacement.parent.mkdir(parents=True, exist_ok=True)
            replacement.write_text(payload["text"], encoding="utf-8")
            (temp_data / "source_catalog.seed.json").write_text(json.dumps(selected), encoding="utf-8")
            (temp_data / "detection_rules.json").write_text(json.dumps({"rules": [raw_rule]}), encoding="utf-8")
            store = Store(temp_data)
            store.load(seed_conflicts=False)
            report = store.scan(extractor=payload["extractor"])
            if any(document.status != "PARSED" for document in report.documents):
                raise PreviewError("The preview could not process every comparison source. Check provider availability or try regex.", "EXTRACTION_FAILED", 502)
            return {
                "preview": True,
                "report": report.model_dump(mode="json"),
                "changed_source": {"source_id": payload["source_id"], "title": original_title},
                "notice": "Isolated preview within a configured topic; discrepancies may need scope clarification.",
            }
    finally:
        llm.httpx.Client.post = original_post


if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            raise PreviewError("Preview request is too large.", "BODY_TOO_LARGE", 413)
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise PreviewError("Invalid JSON request.", "INVALID_JSON")
        print(json.dumps(main(payload), ensure_ascii=False))
    except PreviewError as error:
        print(json.dumps({"error": str(error), "code": error.code, "status": error.status}))
        sys.exit(1)
    except Exception:
        # Never echo provider configuration, request headers or raw tracebacks.
        print(json.dumps({"error": "The isolated preview could not be completed.", "code": "PREVIEW_FAILED", "status": 502}))
        sys.exit(1)
