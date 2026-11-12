---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
kernelspec:
  display_name: Python 3
  language: python
  name: python3
---

# Milestone 1 — Data Crawling

## Overview

This chapter documents Team 12's arXiv crawling pipeline for the assigned January 2026 identifier range, following the [official Milestone 1 requirements](https://hcmus-cs-ta.github.io/lab-book/intro-ds/statement/crawling/). It describes the implementation found in the source repository and reports coverage from a dated audit snapshot computed from its append-only JSONL logs. Retry records are reduced to the most recent valid record for each paper or version before counting outcomes. Tables and plots are generated during Jupyter Book execution from the committed snapshot; no screenshots or hand-entered chart values are used.

## Scope and Assigned Range

The assigned interval is **2601.03156–2601.08155**, inclusive: 5,000 sequential arXiv identifiers. The API metadata provides the version count for each returned paper; the audit snapshot reports how many IDs were resolved, how many IDs were missing, and the resulting number of version-level source requests. The crawler uses versions as source-download units and base IDs as the paper-level denominator.

## Data Sources and APIs

The metadata and version discovery stage uses the `arxiv` Python client to query the arXiv API by batches of up to 100 IDs, following the [official API manual](https://info.arxiv.org/help/api/user-manual.html). The recorded metadata includes title, authors, submission date, latest update date, venue, primary category, and the latest version number. The crawler separately queries version metadata for revisions v2 onward and stores their update dates in `revisions.jsonl`; v1 is represented by the initial metadata record.

For source files, the code requests each version independently from `https://export.arxiv.org/src/{version_id}`. Reference metadata is requested from the [Semantic Scholar Graph API](https://api.semanticscholar.org/api-docs/) using each base arXiv ID, with title and reference fields including title, authors, year, publication date, venue, and external identifiers. These are the APIs actually used by the repository code; OAI-PMH and the Kaggle snapshot are discussed in the course statement but are not used by this implementation.

## Crawling Method

The arXiv crawler has separate `meta` and `src` modes. In metadata mode it submits ID batches through `arxiv.Client` configured with a three-second delay and five retries, parses each returned entry ID to obtain the base ID and latest version number, and writes one JSON object per assigned ID. IDs absent from the API response are written explicitly with `missing: true`. It then queries revision records for v2 through the latest version and appends their dates.

In source mode it loops over every metadata record and every version from v1 to the reported latest version. Each source is requested separately. The downloader sends byte-range requests in chunks of up to 8 MiB, uses a 15-second pacing interval, and has up to six attempts within each download loop. For HTTP 429 and selected 5xx responses it honors a numeric `Retry-After` value when supplied or applies exponential delays capped at 300 seconds. It resumes from the temporary file size after interruption, validates range responses, and restarts a partial download if a 416 response confirms an inconsistent offset. Network exceptions are retried; exhausted retries are logged as `failed`.

HTTP transport is implemented with the Python `requests` library. The source request uses a descriptive `User-Agent` containing the `ARXIV_CONTACT` environment variable (with a placeholder default). Downloaded tar archives are traversed without extracting directories or unsafe absolute/parent paths. Only regular files ending in `.tex` or `.bib` are written to the paper/version folder; image binaries and other archive members are omitted. Non-archive responses are classified by content: PDF bytes become `pdf_only`, recognized TeX becomes `ok`, and other content becomes `not_tex`. HTTP 404 responses become `not_found`. The downloader also distinguishes an archive with no retained `.tex` or `.bib` files (`no_tex`), invalid gzip (`bad_archive`), and exhausted transport retries (`failed`).

The Semantic Scholar crawler uses the `S2_API_KEY` environment variable, requests one paper at a time, and permits up to six attempts. HTTP 404 is recorded as `not_found`; HTTP 429 and selected 5xx responses are retried with exponential backoff; other HTTP responses and exhausted retries retain explicit error statuses. It maintains an approximately one-request-per-second pace. Both crawlers append JSONL records and skip completed IDs on rerun, allowing them to resume. For the source crawler, terminal statuses are skipped on subsequent runs; the S2 crawler similarly treats the latest `ok` or `not_found` result as complete.

## Data Organization and Resumability

The source repository stores metadata in `data/arxiv/meta.jsonl`, additional revision dates in `data/arxiv/revisions.jsonl`, source attempt/status records in `data/arxiv/sources_log.jsonl`, and extracted source files below `data/arxiv/papers/{base_id}/v{n}/`. Semantic Scholar records are stored in `data/s2/references.jsonl`. Logs are append-only: one identifier/version can occur more than once after retry or manual reruns. The JSONL inputs were reduced to an audit snapshot for the public book build. The snapshot records its generation timestamp, row counts, malformed-line counts, input sizes, and SHA-256 checksums. The summary generator reads each append-only log, counts malformed JSON lines, and selects the last valid record keyed by `arxiv_id` or `version_id`, so retry history is not treated as additional coverage.

The raw crawl corpus and JSONL logs are not committed to either public repository. Local authors regenerate the compact `data/audit_summary.json` using `node scripts/build_audit_summary.mjs <path-to-source-repo>/data`. GitHub Pages reads the committed aggregate snapshot, not the author's local data directory. The snapshot exposes only aggregate metrics, log counts, checksums, and one inspected status record; it contains no paper text, abstracts, references payloads, API keys, or full crawl logs. It is a dated snapshot and must be regenerated and recommitted when source logs change.

## Results and Coverage

The code cells read the committed snapshot, verify its audit checks, and generate the tables and figures at book-build time. “Terminally classified” means a latest status exists for every expected version; it does not mean every version yielded TeX/Bib. Source success is the count of latest `ok` records divided by expected versions. PDF-only, not-found, and non-TeX outcomes remain in that denominator because they are assigned versions with recorded outcomes.

```{code-cell} python
from pathlib import Path
import json, os
from collections import Counter
import pandas as pd
import matplotlib.pyplot as plt

summary_path = Path(os.environ.get("AUDIT_SUMMARY_PATH", "data/audit_summary.json"))
if not summary_path.exists():
    alternate = Path("../data/audit_summary.json")
    if alternate.exists():
        summary_path = alternate
if not summary_path.exists():
    raise FileNotFoundError("The committed data/audit_summary.json snapshot is required to build this chapter.")
audit = json.loads(summary_path.read_text(encoding="utf-8"))
assert audit["schema_version"] == 1
assert all(audit["checks"].values()), f"Audit checks failed: {audit['checks']}"
EXPECTED_PAPERS = audit["assigned_range"]["expected_papers"]
EXPECTED_VERSIONS = audit["metadata"]["expected_version_count"]
meta = audit["metadata"]
source_data = audit["sources"]
s2_data = audit["semantic_scholar"]
source_status = Counter(source_data["terminal_status_counts"])
s2_status = Counter(s2_data["terminal_status_counts"])

summary_table = pd.DataFrame([
    ("Assigned IDs with metadata", meta["unique_assigned_ids_found"], EXPECTED_PAPERS, "papers"),
    ("Metadata IDs missing", meta["missing_ids"], EXPECTED_PAPERS, "papers"),
    ("Versions reported by metadata", EXPECTED_VERSIONS, EXPECTED_VERSIONS, "versions"),
    ("Versions with a latest source status", source_data["unique_latest_versions"], EXPECTED_VERSIONS, "versions"),
    ("Versions with extracted TeX/Bib", source_data["tex_bib_success_count"], EXPECTED_VERSIONS, "versions"),
    ("Papers with S2 success", s2_data["terminal_status_counts"].get("ok", 0), EXPECTED_PAPERS, "papers"),
], columns=["Metric", "Count", "Denominator", "Unit"])
display(summary_table)
rates = pd.DataFrame([
    ("Metadata resolution", meta["unique_assigned_ids_found"], EXPECTED_PAPERS, 100 * meta["unique_assigned_ids_found"] / EXPECTED_PAPERS),
    ("Latest source status coverage", source_data["unique_latest_versions"], EXPECTED_VERSIONS, 100 * source_data["unique_latest_versions"] / EXPECTED_VERSIONS),
    ("TeX/Bib extraction success", source_data["tex_bib_success_count"], EXPECTED_VERSIONS, 100 * source_data["tex_bib_success_count"] / EXPECTED_VERSIONS),
    ("Semantic Scholar success", s2_data["terminal_status_counts"].get("ok", 0), EXPECTED_PAPERS, 100 * s2_data["terminal_status_counts"].get("ok", 0) / EXPECTED_PAPERS),
], columns=["Metric", "Numerator", "Denominator", "Rate (%)"])
display(rates)
input_table = pd.DataFrame([
    (name, item["log_rows"], item["valid_json_rows"], item["malformed_json_lines"], item["unique_latest_ids"], item["file_size_bytes"])
    for name, item in audit["inputs"].items()
], columns=["Input log", "Log rows", "Valid JSON rows", "Malformed lines skipped", "Unique latest IDs", "File bytes"])
display(input_table)
print("Audit snapshot UTC:", audit["generated_at_utc"])
print("Snapshot source:", audit["source_repository"])
print("Input checksums (SHA-256):", {name: item["sha256"] for name, item in audit["inputs"].items()})
```

*Tables 1–2. ID/version coverage and audit-log integrity. Source: dated `data/audit_summary.json`; denominator and input row counts are shown in the tables.*

## Source Status Analysis

The source status figure counts the latest record per version, not every log attempt. `ok` denotes extracted TeX/Bib content. `pdf_only`, `not_found`, and `not_tex` are distinct outcomes, not successful source extraction and not interchangeable failure labels. In particular, a 404 from the source endpoint is reported as `not_found`; it is not relabeled as a generic crawler failure.

```{code-cell} python
source_order = ["ok", "pdf_only", "not_found", "not_tex", "no_tex", "bad_archive", "failed"] + sorted(set(source_status) - {"ok", "pdf_only", "not_found", "not_tex", "no_tex", "bad_archive", "failed"})
source_counts = pd.Series(source_status, dtype="int64").reindex(source_order, fill_value=0)
source_table = pd.DataFrame({
    "Versions": source_counts,
    "Share of expected versions (%)": 100 * source_counts / EXPECTED_VERSIONS,
})
display(source_table)
fig, ax = plt.subplots(figsize=(9, 4.8))
source_counts.plot(kind="bar", ax=ax, color="#3973ac", label="Versions by latest status")
ax.set_title("Latest arXiv source outcome per expected version")
ax.set_xlabel("Latest source status")
ax.set_ylabel("Versions (count)")
ax.tick_params(axis="x", rotation=25)
ax.legend(title="Source log records")
for i, value in enumerate(source_counts):
    ax.text(i, value, f"{value:,}", ha="center", va="bottom", fontsize=9)
fig.tight_layout()
plt.show()
example = source_data["inspected_example_2601_03249v1"]
print("Inspected version example:", example)
```

*Figure 1. Latest arXiv source outcome per expected version. Unit: versions; percentages use the expected-version denominator shown in the coverage table. Source: `sources_log.jsonl` summarized in the dated audit snapshot.*

At the current log snapshot, all expected versions have a latest status. The latest outcome counts are generated above; the reported `ok` count represents versions for which TeX/Bib was retained. The remaining versions are separately classified as PDF-only, source endpoint not-found, or non-TeX content. One specifically inspected example, `2601.03249v1`, was classified as `not_tex`: the endpoint returned an HTML response of 12,317 raw bytes, with zero retained TeX/Bib bytes. This record remains visible in the source-status distribution rather than being silently dropped.

## Semantic Scholar Results

The denominator for the status plot is the 5,000 unique assigned base-paper IDs, after selecting the latest valid log record per ID. The reference total and mean below are computed only over `ok` responses; the mean is references per successful response, not per assigned paper. `not_found` records remain in the coverage denominator and are not counted as successful reference retrieval.

```{code-cell} python
s2_counts = pd.Series(s2_status, dtype="int64").sort_index()
s2_table = pd.DataFrame({
    "Papers": s2_counts,
    "Share of assigned papers (%)": 100 * s2_counts / EXPECTED_PAPERS,
})
display(s2_table)
s2_metrics = pd.DataFrame([
    ("Unique assigned papers with a latest S2 result", s2_data["unique_latest_papers"], "papers"),
    ("Successful latest responses", s2_data["terminal_status_counts"].get("ok", 0), "papers"),
    ("Reference records in successful responses", s2_data["ok_response_reference_total"], "references"),
    ("Mean references per successful response", s2_data["mean_references_per_ok_response"], "references / successful response"),
    ("Mean references per assigned paper", s2_data["mean_references_per_assigned_paper"], "references / assigned paper"),
], columns=["Metric", "Value", "Unit"])
display(s2_metrics)
fig, ax = plt.subplots(figsize=(8, 4.5))
s2_counts.plot(kind="bar", ax=ax, color="#4c956c", label="Papers by latest status")
ax.set_title("Latest Semantic Scholar outcome per assigned paper")
ax.set_xlabel("Latest Semantic Scholar status")
ax.set_ylabel("Papers (count)")
ax.legend(title="Reference API log records")
for i, value in enumerate(s2_counts):
    ax.text(i, value, f"{value:,}", ha="center", va="bottom", fontsize=9)
fig.tight_layout()
plt.show()
```

*Figure 2. Latest Semantic Scholar outcome per assigned paper. Unit: papers; percentages use 5,000 assigned IDs as denominator. Source: `references.jsonl` summarized in the dated audit snapshot.*

## Performance and Resource Use

The `seconds` field in each source log record measures the duration associated with that individual version's latest logged processing attempt. Summing those values gives a **log-derived accumulated duration**, not end-to-end wall-clock time: it omits the full discovery stage and does not account for all earlier retry attempts. The derived per-paper value divides the sum of latest version durations by the 5,000 assigned papers; it is not the observed elapsed time of the complete run.

The course specifies a CPU-only Google Colab instance for final benchmarking. The available logs do not identify the machine or execution environment used for this crawl, so these duration values cannot be presented as a verified Colab benchmark.

```{code-cell} python
benchmark = pd.DataFrame([
    ("Sum of latest per-version logged seconds", source_data["latest_seconds_sum"], "seconds; log-derived"),
    ("Sum of latest per-version logged seconds", source_data["latest_seconds_sum_hours"], "hours; log-derived"),
    ("Mean sum of latest version seconds per assigned paper", source_data["latest_seconds_mean_per_assigned_paper"], "seconds / paper; log-derived"),
    ("Maximum sum of latest version seconds for one paper", source_data["latest_seconds_max_for_one_paper"], "seconds / paper; log-derived"),
    ("Current data directory file size", audit["current_data_directory_file_size_bytes"], "bytes; snapshot-derived components"),
    ("End-to-end wall time", "not measured from available logs", "not measured"),
    ("Entry discovery time", "not measured from available logs", "not measured"),
    ("Average or peak RAM", "not measured from available logs", "not measured"),
    ("Peak disk usage during run", "not measured from available logs", "not measured"),
], columns=["Metric", "Value", "Interpretation / unit"])
display(benchmark)
size_metrics = pd.DataFrame([
    ("Mean raw response bytes among latest status=ok versions", source_data["raw_bytes_mean_ok_versions"], source_data["raw_bytes_denominator_ok_versions"], "bytes / ok version"),
    ("Mean retained TeX/Bib bytes among latest status=ok versions", source_data["kept_bytes_mean_ok_versions"], source_data["kept_bytes_denominator_ok_versions"], "bytes / ok version"),
    ("Total retained TeX/Bib bytes among latest status=ok versions", source_data["kept_bytes_total_ok_versions"], source_data["kept_bytes_denominator_ok_versions"], "bytes"),
], columns=["Metric", "Value", "Denominator", "Unit"])
display(size_metrics)
display(pd.DataFrame([audit["data_directory_size_components"]]))
```

`raw_bytes` is the downloaded response size before extraction; it is not the size of the unfiltered TeX/Bib files. `kept_bytes` is the size of the extracted `.tex` and `.bib` files. Their displayed means use latest `ok` versions as the denominator. The final data-directory size in the snapshot is derived from retained TeX/Bib bytes plus the four JSONL files and the inventory/diagnostic logs listed in the snapshot. It is a final-size measure, not peak disk usage.

## Limitations

The snapshot supports paper/version coverage, outcomes, retained-source sizes, reference counts, and a sum of latest per-version durations. Available logs do not record process-level memory samples, peak temporary disk use, discovery duration, or end-to-end start/finish timestamps. These fields are marked “not measured from available logs,” not estimated.

The source endpoint can return different content types. The `pdf_only` records have no retained TeX/Bib and should not be reported as source successes. The `not_found` records indicate a source endpoint 404 for a version; they are an observed outcome, not proof that the crawler's retry mechanism failed. The single `not_tex` record indicates downloaded content that did not match the recognized archive, PDF, or TeX checks. Although every expected version has a terminally classified latest status, only `ok` versions supplied retained TeX/Bib files.

The snapshot-generation script skips and counts malformed JSONL lines, records row counts and SHA-256 hashes, and asserts the expected 5,000 assigned IDs, 7,561 versions, complete source-status coverage, and 5,000 Semantic Scholar IDs. Regenerate the snapshot after logs change; the published report otherwise describes the dated snapshot shown above, not a live query of the full corpus. These results should not be generalized to all arXiv records or other network and hardware conditions.

## Conclusion

The current logs document metadata coverage for the complete assigned 5,000-ID range and a separately logged outcome for every one of the 7,561 versions reported by metadata. Source outcomes distinguish retained TeX/Bib from PDF-only, not-found, and non-TeX responses. Semantic Scholar outcomes are measured over unique assigned papers, with reference totals restricted to successful responses. The available duration field supports a cautious log-derived processing-time summary, while end-to-end runtime, discovery time, memory, and peak disk remain unmeasured.

### Metrics to measure in a follow-up benchmark

- **End-to-end wall time:** record UTC start and finish timestamps around the complete metadata, revisions, source, and S2 pipeline run; report both total elapsed time and per-stage elapsed times.
- **Entry discovery time:** record monotonic start/finish times around metadata lookup and revision discovery separately.
- **Memory:** sample process RSS periodically (for example with `psutil`) and record mean and maximum RSS for the whole pipeline, including child processes if any.
- **Peak disk usage:** sample the data directory and temporary download files during the run, recording the maximum observed bytes; separately record final corpus size.
- **Retry-inclusive version timing:** retain per-attempt timestamps or retry counts if the goal is to analyze time spent including failed attempts, clearly separate from successful/terminal per-version duration.

## References

1. HCMUS Course Lab Book, [Project Milestone 1 — Data Crawling](https://hcmus-cs-ta.github.io/lab-book/intro-ds/statement/crawling/). Requirements for assigned-ID discovery, per-version sources, references, benchmarking, and the Jupyter Book report.
2. HCMUS Course Lab Book, [arXiv Project — Problem Statements](https://hcmus-cs-ta.github.io/lab-book/intro-ds/statement/). Overall project milestones and submission context.
3. Team 12, [source code repository](https://github.com/heygnauq1777/arxiv-project-team-12/), especially `src/crawl_arxiv.py`, `src/crawl_s2.py`, and `src/requirements.txt`.
4. arXiv, [API User's Manual](https://info.arxiv.org/help/api/user-manual.html) and [Terms of Use for arXiv APIs](https://info.arxiv.org/help/api/tou.html).
5. Semantic Scholar, [Academic Graph API documentation](https://api.semanticscholar.org/api-docs/).







