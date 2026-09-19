# Setup — one time

Everything here changes the user's personal configuration. Show what you are about to
change and get a yes for each step; never apply these silently.

## 1. Connect the runway MCP server (user scope, so it works in every repository)

runway is self-hosted, so the URL is the user's own instance. The API key comes from the
runway settings page and belongs in an environment variable, never in a repository.

```sh
export RUNWAY_API_KEY=…            # e.g. in ~/.zshenv; GUI apps do not see shell variables
claude mcp add --scope user --transport http runway https://<host>/api/mcp \
  --header 'X-Api-Key: ${RUNWAY_API_KEY}'
```

Keep the single quotes: they store the placeholder instead of the key itself.

Verify with the health and "me" tools. If a repository already declares the same server in
its own `.mcp.json`, that is fine; keep the name `runway` so permission rules match.

## 2. Permissions (`~/.claude/settings.json`)

Looking something up should never raise a permission prompt; changes ask; deleting is
denied. Tool names are `mcp__runway__<operation id>`. Merge these entries into the
`permissions` block (keep whatever else is there):

```json
{
  "permissions": {
    "allow": [
      "mcp__runway__health_health_get",
      "mcp__runway__me_auth_me_get",
      "mcp__runway__list_tasks_tasks_get",
      "mcp__runway__get_task_tasks__uuid__get",
      "mcp__runway__inbox_gtd_inbox_get",
      "mcp__runway__next_actions_gtd_next_get",
      "mcp__runway__waiting_gtd_waiting_get",
      "mcp__runway__someday_gtd_someday_get",
      "mcp__runway__projects_gtd_projects_get",
      "mcp__runway__project_tasks_gtd_projects__name__get",
      "mcp__runway__tickler_gtd_tickler_get",
      "mcp__runway__get_plan_projects_plans__name__get"
    ],
    "ask": [
      "mcp__runway__create_task_tasks_post",
      "mcp__runway__modify_task_tasks__uuid__put",
      "mcp__runway__complete_task_tasks__uuid__done_post",
      "mcp__runway__annotate_task_tasks__uuid__annotate_post",
      "mcp__runway__start_task_tasks__uuid__start_post",
      "mcp__runway__stop_task_tasks__uuid__stop_post",
      "mcp__runway__create_project_projects_post",
      "mcp__runway__upsert_plan_projects_plans__name__put",
      "mcp__runway__webhook_inbox_inbox_post"
    ],
    "deny": [
      "mcp__runway__delete_task_tasks__uuid__delete"
    ]
  }
}
```

Authentication, API-key, user and admin operations are not exposed over MCP, so they need
no entry.

## 3. The standing rule (global instructions, e.g. `~/.claude/CLAUDE.md`)

A skill is loaded only when it triggers, so the habit of *offering* a task has to live in
the always-loaded instructions:

```markdown
## Aufgaben (runway)
- Entsteht im Gespräch eine Zusage, ein „ich muss noch“, ein vereinbarter nächster Schritt
  oder ein Warten auf Dritte, biete am Ende der Antwort in EINER Zeile an, dafür ein Todo
  in runway anzulegen (Skill `runway`). Höchstens ein Angebot je Antwort, nicht für Dinge,
  die du in derselben Session erledigst, nicht erneut nach einem Nein.
- „todo: …“ heißt: sofort anlegen, nur bei unklarem Projekt nachfragen.
- Aufgaben leben ausschließlich in runway, nie in Dateien oder Notizen.
```

## 4. Tell each repository which project it is

One line in the repository's CLAUDE.md or AGENTS.md — it is in context anyway, so it costs
no lookup:

```markdown
runway_project: website-relaunch
```

Repositories that span several projects need no line; the user names the project.

## 5. Personal profile (`~/.config/runway/profile.md`, optional)

```markdown
# runway profile
language: de
contexts: @computer, @home, @errands, @phone
weekly_review: Freitag 15:00 (Kalendertermin)
```

## 6. Reminders

- **Weekly review**: a recurring calendar appointment. Nothing beats it.
- **Daily review**: a SessionStart hook can mention that a review is due, but only when a
  session starts. A reminder without an open session needs a push from the server itself
  (digest by e-mail or ntfy), once runway offers one. Do not build cloud agents that hold
  the API key just to send a reminder.
- A hook should call the server's summary operation with a short timeout, stay silent when
  nothing is due, and print at most one line.
