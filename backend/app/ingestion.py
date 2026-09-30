"""Raw-file parsers: each format is normalised to plain text, one logical unit per line."""

import csv
import io
import json
import re
from dataclasses import dataclass, field
from email import policy
from email.parser import Parser
from html.parser import HTMLParser
from pathlib import Path

_BLOCK_TAGS = {
    "p", "div", "section", "header", "footer", "nav", "li", "ul", "ol", "tr", "td", "th",
    "table", "h1", "h2", "h3", "h4", "h5", "h6", "br", "article", "title",
}
_SKIP_TAGS = {"script", "style", "head"}


@dataclass
class ParsedDocument:
    path: Path
    format: str
    text: str
    metadata: dict = field(default_factory=dict)

    @property
    def line_count(self) -> int:
        return len(self.text.splitlines())


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip = 0
        self.parts: list[str] = []
        self.meta: dict[str, str] = {}

    def handle_starttag(self, tag, attrs):
        if tag == "meta":
            d = dict(attrs)
            if d.get("name") and d.get("content"):
                self.meta[d["name"]] = d["content"]
        if tag in _SKIP_TAGS:
            self._skip += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in _SKIP_TAGS:
            self._skip = max(0, self._skip - 1)
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def _clean_lines(text: str) -> str:
    lines = (re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines())
    return "\n".join(ln for ln in lines if ln)


def html_to_text(raw: str) -> tuple[str, dict]:
    ex = _TextExtractor()
    ex.feed(raw)
    return _clean_lines("".join(ex.parts)), ex.meta


def _parse_html(raw: str) -> tuple[str, dict]:
    return html_to_text(raw)


def _flatten(value, prefix: str = "") -> list[str]:
    if isinstance(value, dict):
        out: list[str] = []
        for k, v in value.items():
            out.extend(_flatten(v, f"{prefix}.{k}" if prefix else k))
        return out
    if isinstance(value, list):
        out = []
        for i, v in enumerate(value):
            out.extend(_flatten(v, f"{prefix}[{i}]"))
        return out
    return [f"{prefix}: {value}"]


def _parse_json(raw: str) -> tuple[str, dict]:
    data = json.loads(raw)
    lines: list[str] = []
    meta: dict = {}
    if isinstance(data, dict) and isinstance(data.get("value"), list) and any(
        isinstance(m, dict) and "body" in m for m in data["value"]
    ):
        meta["kind"] = "teams_messages"
        for m in data["value"]:
            who = ((m.get("from") or {}).get("user") or {}).get("displayName", "unknown")
            text, _ = html_to_text((m.get("body") or {}).get("content", ""))
            lines.append(f"[{m.get('createdDateTime', '')}] {who}: {' '.join(text.split())}")
    elif isinstance(data, dict) and isinstance(data.get("result"), list):
        meta["kind"] = "servicenow_incidents"
        for inc in data["result"]:
            num = inc.get("number", "")
            lines.append(f"{num} {inc.get('short_description', '')}")
            for n in inc.get("work_notes", []):
                lines.append(f"{num} [{n.get('created_on', '')}] {n.get('created_by', '')}: {n.get('text', '')}")
    else:
        meta["kind"] = "generic_json"
        lines = _flatten(data)
    return "\n".join(lines), meta


def _parse_markdown(raw: str) -> tuple[str, dict]:
    meta: dict = {}
    m = re.match(r"\A---\s*\n(.*?)\n---\s*\n", raw, re.S)
    if m:
        for ln in m.group(1).splitlines():
            if ":" in ln:
                k, v = ln.split(":", 1)
                meta[k.strip()] = v.strip()
        raw = raw[m.end():]
    lines = []
    for ln in raw.splitlines():
        if re.match(r"^\|?[\s:\-|]+\|?$", ln) and "-" in ln:
            continue  # table separator row
        ln = re.sub(r"^#{1,6}\s*", "", ln).replace("**", "").replace("`", "")
        lines.append(ln)
    return _clean_lines("\n".join(lines)), meta


def _parse_eml(raw: str) -> tuple[str, dict]:
    msg = Parser(policy=policy.default).parsestr(raw)
    meta = {k: str(msg[k]) for k in ("Subject", "From", "To", "Date") if msg[k]}
    body = msg.get_body(preferencelist=("plain", "html"))
    content = body.get_content() if body is not None else ""
    if body is not None and body.get_content_type() == "text/html":
        content, _ = html_to_text(content)
    header_lines = [f"{k}: {v}" for k, v in meta.items()]
    return _clean_lines("\n".join(header_lines) + "\n" + content), meta


def _parse_csv(raw: str) -> tuple[str, dict]:
    reader = csv.DictReader(io.StringIO(raw))
    lines = [
        "; ".join(f"{k}={v}" for k, v in row.items() if v not in (None, ""))
        for row in reader
    ]
    return "\n".join(lines), {"columns": ", ".join(reader.fieldnames or [])}


def _parse_vtt(raw: str) -> tuple[str, dict]:
    lines: list[str] = []
    for block in re.split(r"\n\s*\n", raw.replace("\r\n", "\n")):
        bl = block.strip().splitlines()
        if not bl or bl[0].startswith(("WEBVTT", "NOTE")):
            continue
        ts = next((i for i, ln in enumerate(bl) if "-->" in ln), None)
        if ts is None:
            continue
        start = bl[ts].split("-->")[0].strip()
        text = " ".join(bl[ts + 1:])
        m = re.match(r"<v ([^>]+)>(.*)", text)
        speaker, text = (m.group(1), m.group(2)) if m else ("", text)
        text = re.sub(r"</?[^>]+>", "", text).strip()
        lines.append(f"[{start}] {speaker}: {text}" if speaker else f"[{start}] {text}")
    return "\n".join(lines), {}


def _parse_txt(raw: str) -> tuple[str, dict]:
    return _clean_lines(raw), {}


_PARSERS = {
    ".html": _parse_html,
    ".htm": _parse_html,
    ".json": _parse_json,
    ".md": _parse_markdown,
    ".eml": _parse_eml,
    ".csv": _parse_csv,
    ".vtt": _parse_vtt,
    ".txt": _parse_txt,
}


def supported_formats() -> list[str]:
    return sorted(ext.lstrip(".") for ext in _PARSERS)


def parse_file(path: Path) -> ParsedDocument:
    parser = _PARSERS.get(path.suffix.lower())
    if parser is None:
        raise ValueError(f"Unsupported file format: {path.suffix}")
    raw = path.read_text(encoding="utf-8")
    text, meta = parser(raw)
    return ParsedDocument(path=path, format=path.suffix.lstrip(".").lower(), text=text, metadata=meta)
