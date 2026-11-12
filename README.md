# Jupyter Book — Team 12

Project reports for the arXiv Introduction to Data Science project. The source pipeline is maintained separately in [arxiv-project-team-12](https://github.com/heygnauq1777/arxiv-project-team-12/).

## Refresh the public audit snapshot

The full crawl data and JSONL logs are not committed to the source repository. When the logs change, regenerate the small, aggregate-only snapshot from a local checkout of both repositories with Node.js 20 or later:

```bash
node scripts/build_audit_summary.mjs ../arxiv-project-team-12/data data/audit_summary.json
```

Review `data/audit_summary.json` and commit the updated snapshot with the report. It records the UTC generation time, source repository, input row and malformed-line counts, file sizes, SHA-256 checksums, aggregate status/size/time metrics, and consistency checks. It contains no paper text, abstracts, reference payloads, corpus files, or credentials. The included GitHub Actions workflow builds the Book repository alone, using this committed snapshot, and deploys its generated HTML to GitHub Pages. It does not need the author's local data folder. In repository settings, select **Settings → Pages → Build and deployment → GitHub Actions** as the publishing source. The reported metrics are therefore a snapshot as of `generated_at_utc`, not live data.

## Build the book

Use Python 3.10 or later. Install book dependencies with `python -m pip install -r requirements.txt`, then run `jupyter-book build .` from the repository root. The report code cells read `data/audit_summary.json` by default; `AUDIT_SUMMARY_PATH` can point to another compatible snapshot for local builds.