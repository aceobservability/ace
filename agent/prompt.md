@agent/prd.json @agent/progress.txt

You are working on the "dash" project (Grafana-like monitoring dashboard).

## Execution Mode: One Task Per Session

This run is a single isolated OpenClaw sub-agent session/thread.
Do exactly one task, then exit.
Do not continue to a second task in the same run.

Execution profile for sub-agent runs:
- Model: `openai/gpt-5.3-codex`
- Thinking: `high`

## Task Selection (Automatic)

Select the next task from `agent/prd.json` using this order:

1. Only tasks with `passes: false`
2. Only tasks whose `depends_on` items are all complete
3. Prefer the task that unblocks the most incomplete tasks
4. Prefer security/access-control/core-path work over polish work
5. If tied, pick the first task in file order

If no incomplete tasks remain:

- Output `<promise>COMPLETE</promise>`
- Exit immediately

## Work Contract For This Run

1. Print selected task:
   - `Selected Task: <id> - <name>`

2. Implement only that selected task (small scoped change).

3. Run tests relevant to touched areas:
   - Frontend: `cd frontend && npm run type-check && npm run test`
   - Backend: `cd backend && go test ./...`

   Frontend fallback policy (to avoid deadlock on unrelated baseline failures):
   - If full frontend tests fail, identify failing test files.
   - If failures are outside files touched for this task, run targeted tests for touched areas and proceed when those pass.
   - Record both results in progress (`full suite failing (pre-existing)` + `targeted passing`).

4. Frontend browser validation (required when any frontend file is changed):
   - Use the `dev-browser` skill to test the implemented UI flow in a real browser.
   - Validate the main happy path for the changed screens and at least one failure/permission state when applicable.
   - Confirm there are no obvious runtime errors in the browser while exercising the flow.
   - Include a short `Browser validation:` line in the progress entry with pass/fail and what was checked.

5. If the selected task is complete and tests pass (or only unrelated pre-existing frontend failures remain and targeted touched-area tests pass):
   - Set only that task's `passes` to `true` in `agent/prd.json`
   - Append a new entry to `agent/progress.txt`:

```
## Task <id>: <name> - <timestamp>
- What was done:
- Files changed:
- Tests: passing/failing
- Browser validation: passing/failing (frontend changes only)
```

6. Commit changes (but do NOT push):

```bash
git add <task-related-files> agent/prd.json agent/progress.txt
git commit -m "feat: <task id> <short description>"
```

Important: 
- Do NOT push changes yourself
- The ralph.sh wrapper will create a PR and merge it for proper changelog tracking
- Do not include unrelated pre-existing working tree changes in the commit

7. Output completion marker and stop:
   - `✅ Task complete: <id> - <name>`
   - `<promise>TASK_COMPLETE</promise>`
   - Exit immediately
