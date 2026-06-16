---
name: review-greptile
description: Review Greptile bot review comments on a PR, decide which to action, apply the actioned ones, reply to each thread, and resolve it. Use when the user wants to triage, address, action, or resolve Greptile comments/reviews on a pull request, or says "review greptile", "handle greptile comments", or "resolve greptile".
---

# Review Greptile comments

Triage the unresolved Greptile review threads on a PR: decide which to action, apply
the changes, reply to every thread explaining the outcome, and resolve it.

`scripts/greptile.sh` wraps the GitHub API (Greptile posts as the `greptile-apps` bot;
threads resolve via GraphQL, replies via the REST `in_reply_to` endpoint).

## Workflow

1. **Find the PR.** Default to the current branch: `gh pr view --json number,title`.
   If there's no PR for the branch, ask the user which PR number.

2. **Read the comments.** `scripts/greptile.sh list <pr>` returns JSON of unresolved
   Greptile threads: `{threadId, isOutdated, commentId, path, line, body}`. The body is
   HTML-ish — the priority is a `P1`/`P2`/`P3` badge, followed by a **bold title**, the
   rationale, and sometimes a ```suggestion``` block or "Context Used" footer.

3. **Decide, per thread** (`action` or `skip`) with a one-line reason. Heuristics:
   - **P1** and **security**-badged comments: action unless clearly wrong or already handled.
   - **`suggestion` blocks**: evaluate the diff on merits; apply if correct.
   - **Nits / style**: skip if they conflict with this repo's conventions. Read `CONTEXT.md`,
     `docs/adr/`, and (for any UI/visual comment) **`DESIGN.md`** before deciding — repo
     conventions win over the bot.
   - **`isOutdated: true`**: usually skip (the code moved on) — reply noting it's outdated.
   - Anything you genuinely disagree with: skip with a clear reason.

4. **Present a decision table and STOP for approval.** Columns: `path:line` · priority ·
   title · decision · reason. Do not edit code until the user approves. The user may flip
   any decision.

5. **Apply the actioned changes.** Make the edits (honour `DESIGN.md` for anything visual —
   flag mismatches rather than introducing them). Run the repo's tests/build for touched
   areas if quick. Then **commit and push**:
   - Group related fixes into sensible commits (one per concern is fine), referencing the
     comment, e.g. `fix(frontend): validate ACE_BACKEND_URL before rendering nginx config`.
   - Co-author the commit per repo convention, then `git push`.

6. **Reply + resolve every thread** (both actioned and skipped):
   - `scripts/greptile.sh reply <pr> <commentId> "<body>"`
   - `scripts/greptile.sh resolve <threadId>`
   - **Actioned** reply: what changed and the commit sha, e.g.
     `Done in <sha> — added an upstream-URL validation guard before the config is rendered.`
   - **Skipped** reply: the reason, e.g.
     `Skipping — \`location /api\` already sits behind an exact-match block, so the prefix concern doesn't apply here.`

7. **Report** a summary: counts actioned/skipped, the commit(s) pushed, and any thread that
   failed to reply/resolve.

## Notes

- Run from inside the repo clone — `gh` infers `aceobservability/ace` automatically.
- The script only ever lists **unresolved** threads, so re-running after a partial pass is safe.
- If `list` returns `[]`, there's nothing to do — say so and stop.
- Never resolve a thread without first leaving a reply.
