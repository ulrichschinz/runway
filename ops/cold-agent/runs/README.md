# Cold-Agent benchmark runs

This directory is **empty on purpose**, and it stays empty until a real run fills it.

One JSON record and one verbatim transcript per run:

    <YYYY-MM-DD>-<label>.json
    <YYYY-MM-DD>-<label>.transcript.md

Copy [`../run-template.json`](../run-template.json), fill it in, and score it:

```sh
backend/.venv/bin/python tools/cold_agent_score.py ops/cold-agent/runs/<file>.json
```

The criteria are [`../criteria.md`](../criteria.md), and a record names the version it was
scored against. **Do not check in a filled-in example.** A specimen record is
indistinguishable from a result, and the first thing a reader of this directory needs to
know is whether the benchmark has ever been run. As of 2026-08-30 it has not.
