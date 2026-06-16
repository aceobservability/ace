#!/usr/bin/env bash
# Helper for reading, replying to, and resolving Greptile review threads.
# Greptile posts inline PR review comments as the `greptile-apps` bot, grouped
# into review threads. Threads resolve via the GraphQL `resolveReviewThread`
# mutation; replies go through the REST `in_reply_to` endpoint.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage:
  greptile.sh list <pr>                       # JSON of unresolved Greptile threads
  greptile.sh reply <pr> <comment_id> <body>  # reply to a thread's root comment
  greptile.sh resolve <thread_id>             # resolve a review thread (node id)
EOF
  exit 1
}

owner() { gh repo view --json owner --jq .owner.login; }
name()  { gh repo view --json name  --jq .name; }

cmd="${1:-}"; shift || true
case "$cmd" in
  list)
    [ $# -eq 1 ] || usage
    gh api graphql \
      -f owner="$(owner)" -f name="$(name)" -F pr="$1" \
      -f query='
        query($owner:String!,$name:String!,$pr:Int!){
          repository(owner:$owner,name:$name){
            pullRequest(number:$pr){
              reviewThreads(first:100){
                nodes{
                  id isResolved isOutdated
                  comments(first:1){nodes{databaseId path line body author{login}}}
                }}}}}' \
      --jq '[.data.repository.pullRequest.reviewThreads.nodes[]
              | select(.isResolved==false)
              | {threadId:.id, isOutdated, c:.comments.nodes[0]}
              | select(.c.author.login=="greptile-apps")
              | {threadId, isOutdated, commentId:.c.databaseId,
                 path:.c.path, line:.c.line, body:.c.body}]'
    ;;
  reply)
    [ $# -eq 3 ] || usage
    gh api "repos/{owner}/{repo}/pulls/$1/comments" \
      -f body="$3" -F in_reply_to="$2" --jq '.html_url'
    ;;
  resolve)
    [ $# -eq 1 ] || usage
    gh api graphql -f id="$1" \
      -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' \
      --jq '.data.resolveReviewThread.thread.isResolved'
    ;;
  *) usage ;;
esac
