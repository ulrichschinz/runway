# Historical database baselines

Each `*.sql` file is the schema a real `users.db` had at one point in this repository's history,
written as the statements that produced it. `RULE-SURF-005` (`tools/surfaces.py`) and
`backend/tests/unit/test_schema_versions.py` build a database from each, run today's `init_db()`
on it, and require the result to be semantically identical to a fresh database (ADR 0047).

| File | Shape | Source |
|---|---|---|
| `2026-04-27-initial.sql` | `users` without `api_key`, `project_plans`, `projects` | `46be51a` — production's database was created by this shape and has been migrated by `ALTER TABLE` ever since |
| `2026-04-28-profiles.sql` | `users` created with `api_key TEXT UNIQUE`, profile and role columns added, `site_settings` | `1981523` — a database first created on that day |
| `2026-11-25-m7.sql` | every table as the image before brief 0073 created it fresh | `c6a0070:ops/surfaces/db-schema.sql`, reordered tables → indexes → triggers |

Add a file when a release changes what a fresh database looks like **before** its schema change is a
versioned migration — i.e. never again, if `VERSIONED_MIGRATIONS` is used. Never edit one: each is a
fact about a database that exists.
