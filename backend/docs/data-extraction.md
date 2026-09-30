# How the data extraction works

This explains what happens between "a file sits in `data/raw/`" and "a `KnowledgeConflict` is waiting for an expert". Code: `app/ingestion.py`, `app/detector.py`, `app/llm.py`. For the API see the [backend README](../README.md).

## Scope: collection is someone else's job

KnowledgePulse **does not collect data**. For this hackathon entry we assume that another process, such as a connector or an ETL job, already delivers the raw exports. In production that would be, for example, Microsoft Graph for SharePoint, Teams and Exchange, the ServiceNow Table API, and SD Worx HR and payroll exports. We do not build or simulate those integrations. Everything that depends on them is faked by files on disk.

What the other process must deliver (the **input contract**):

| Input | Where | Contract |
|---|---|---|
| Raw documents | `data/raw/<system>/<file>` | One file per source item, in a supported format: `html`, `json` (Teams messages, ServiceNow incidents, or any JSON), `md` (with optional front matter), `eml`, `csv`, `vtt`, `txt`. UTF-8 |
| Source catalog | `data/source_catalog.seed.json` | One entry per raw file: `source_id`, `system`, `type`, `format`, `title`, `owner_team`, `uri` (the original location), `raw_path`. This is the provenance shown to the expert |
| Client tiers | `data/reference/client_tiers.csv` | Importance of the client, from CRM |
| Ticket volume (48h) | `data/reference/ticket_volume_48h.csv` | Open tickets per topic, from the ticketing system |
| SME history | `data/reference/topic_ownership_history.csv` | Who answered questions on a topic, from HR or knowledge data |

The sentinel only reads these files. It never calls SharePoint, Teams, ServiceNow or any other system, and it never modifies the raw files. The `uri` in the catalog is kept so a verified answer can point back to where the conflicting source lives.

## Pipeline

```
catalog entry -> parse -> extract (regex | LLM) -> ground -> normalize -> compare -> enrich -> route -> score -> store
```

1. **Parse** (`ingestion.py`). Each format is turned into plain text with one logical unit per line. HTML tables become one line per cell, Teams JSON becomes `[timestamp] person: message`, CSV rows become `key=value; key=value`, VTT cues become `[time] speaker: text`, Markdown drops heading marks, bold markers and table separator rows. A malformed file is reported as `ERROR` and does not stop the scan.
2. **Extract.** For each *topic* (a rule in `data/detection_rules.json`) find the stated value in each document. There are two interchangeable extractors, see below.
3. **Ground** (LLM only). Reject any fact the model cannot prove from the document.
4. **Normalize.** Make values comparable: `number` takes the first number and accepts a decimal comma (`0,35` equals `0.35`, `8,00` equals `8`), `month_day` turns `March 31` and `2026-03-31` into `03-31`, `text` lower-cases.
5. **Compare.** Per topic, group facts by normalized value, in catalog order. Fewer than two distinct values means the topic is consistent and produces no conflict. Two or more distinct values is a conflict. The first two values become Source A and Source B, any others go into `additional_sources`. Two values may come from the same document, which surfaces a document that contradicts itself.
6. **Enrich.** Look up the client tier, the 48h ticket count and the assigned expert.
7. **Route.** The expert is the person with the most answered questions on the topic in the last 12 months. Ties are broken by the most recent answer.
8. **Score.** `priority = tier x tickets x severity` (HIGH 10, MEDIUM 6, LOW 3).
9. **Store.** Upsert the conflict. A conflict that is already `RESOLVED` is never reopened by a later scan.

Every step writes a readable line to `steps[]` in the scan report. That log is the "process" you can show live.

### Worked example: IKEA bicycle allowance (`conf_106`)

| File | What the file says | Extracted | Normalized |
|---|---|---|---|
| `03_personeelshandboek.md` | "...een fietsvergoeding van € 0,30 per kilometer." | `0,30` | `0.3` |
| `05_mobiliteitsbeleid.md` | "Vergoeding: € 0,35 per gereden kilometer" | `0,35` | `0.35` |
| `10_loonbrief_maart_2026.md` | payslip row: bicycle allowance, tariff € 0,27 | `0,27` | `0.27` |

Three distinct values, so there is a conflict. Sources A and B are the handbook and the mobility policy, and the payslip goes into `additional_sources`. Client `IKEA Belgium` is tier 3 and has 8 open tickets, and the topic severity is MEDIUM, so the score is `3 x 8 x 6 = 144`. Tom Claes has answered the most questions on the topic, so he gets the question.

## The two extractors

| | Regex | LLM |
|---|---|---|
| Needs | a pattern per source wording, in `detection_rules.json` | a plain-English `description` of the topic |
| Deterministic | yes | no (`temperature: 0`, but varies by model version) |
| Needs network and key | no | yes (OpenRouter, key from `.env`) |
| Handles new wording | no, add a pattern | yes |
| Role | offline demo fallback and regression tests | default when a key is configured |

`extractor=auto` uses the LLM when a key is configured. If a call fails, only that document falls back to regex, and the report says which extractor handled each document. `extractor=llm` is strict: a failing document is marked `ERROR`, with no silent fallback.

### How the LLM is used, and kept honest

The model is used **only to read** a document. It does not decide whether two facts conflict, and it does not choose the expert or the priority. That is all plain code above.

For each document (up to 20,000 characters, in parallel) the model receives the list of topics with their descriptions and must return JSON: `rule_id`, the bare `value`, a short `statement`, and an `evidence` quote copied verbatim from the document. Then `ground_llm_facts` checks every fact in code:

- The `rule_id` must exist.
- The `evidence` must be found **verbatim** in the document (whitespace and case tolerant).
- The `value` must appear inside that evidence.
- The value must parse under the topic's normalization.

A fact that fails any check is dropped and counted in `rejected_facts`, with the reason in `steps[]`. Hallucinated quotes cannot become conflicts.

The excerpt shown to the expert is **not** model text. It is recomputed from the real document by expanding to the sentence around the value. (The one exception is a structured CSV row, where the model's short statement is used.)

Other safeguards:

- The document is treated as untrusted data. The system prompt and delimiters tell the model to ignore instructions inside it.
- The API key is only read from `.env` and is never logged or returned.
- Document text is sent to the configured provider. Do not point this at real personal data without a data-processing agreement.
- TLS uses the OS trust store, so a corporate inspecting proxy does not break calls.

## What this deliberately does not do

- **One value per topic, per statement.** A topic is a single comparable fact (a number, a date, a time, a short text). It does not compare free-form paragraphs.
- **Context is not modelled.** The sentinel reports that two sources differ. Whether one applies to a different country, contract or date range is the expert's call, and it is recorded in the verified answer's `scope`. Rule descriptions can tell the LLM to ignore other scopes (for example, "ignore rules scoped to other joint committees").
- **No reasoning over categories or law.** For example, "sales staff are excluded from telework" versus a contract that grants telework is not detected, and neither is a clause that conflicts with legislation. Such cases need a richer rule.
- **Compatible values are not flagged.** Only values that differ after normalization become conflicts, and only for topics that exist. The telework frequency (1 day within a maximum of 2) has no topic, on purpose.
- **No learning.** Verified answers are stored, but do not yet change how later scans extract.

## Adding a topic

1. Make sure the raw files are delivered and registered in the catalog (the other process does this in production).
2. Add a rule to `data/detection_rules.json`: `rule_id`, `conflict_id`, `topic`, `description`, `client_context`, `severity`, `normalize`, and (for regex mode) `extractors` with a named group `(?P<value>...)` and an optional `statement` for table rows.
3. Add the client to `client_tiers.csv` if new, a row to `ticket_volume_48h.csv`, and at least one expert in `topic_ownership_history.csv`.
4. Run `POST /api/sentinel/scan?extractor=regex` and `?extractor=llm` and compare. If regex finds it and the LLM does not (or the reverse), improve the pattern or the description.
