#!/bin/bash

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <number of iterations>"
  exit 1
fi

iterations="$1"

if ! [[ "$iterations" =~ ^[0-9]+$ ]] || [ "$iterations" -lt 1 ]; then
  echo "Iterations must be a positive integer"
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(dirname "$script_dir")"
prompt_file="$script_dir/prompt.md"
opencode_config_file="$script_dir/opencode-auto-allow.json"

has_marker() {
  local output="$1"
  local marker="$2"

  [[ "$output" == *"<promise>${marker}</promise>"* ]] || \
    [[ "$output" == *"\\u003cpromise\\u003e${marker}\\u003c/promise\\u003e"* ]] || \
    [[ "$output" == *"&lt;promise&gt;${marker}&lt;/promise&gt;"* ]]
}

print_relevant_output() {
  local output="$1"
  local printed="false"

  while IFS= read -r line; do
    case "$line" in
      *"Selected Task:"*|*"✅ Task complete:"*|*"❌ Task blocked:"*|*"<promise>"*|*"\\u003cpromise\\u003e"*)
        echo "$line"
        printed="true"
        ;;
    esac
  done <<< "$output"

  if [ "$printed" = "false" ]; then
    echo "$output"
  fi
}

if [ ! -f "$prompt_file" ]; then
  echo "Missing prompt file: $prompt_file"
  exit 1
fi

if [ ! -f "$opencode_config_file" ]; then
  echo "Missing OpenCode config file: $opencode_config_file"
  exit 1
fi

# Setup tmux with persistent session
SOCKET_DIR="${OPENCLAW_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/openclaw-tmux-sockets}"
mkdir -p "$SOCKET_DIR"
SOCKET="$SOCKET_DIR/ralph-dash.sock"
SESSION="ralph-dash"

# Kill old session if it exists
tmux -S "$SOCKET" kill-session -t "$SESSION" 2>/dev/null || true

# Create new session
if ! tmux -S "$SOCKET" new -d -s "$SESSION" -n "dash-agent" 2>/dev/null; then
  echo "Failed to create tmux session"
  exit 1
fi

# Print monitor instructions
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📺 Monitor Ralph in real-time:"
echo "   tmux -S '$SOCKET' attach -t '$SESSION'"
echo ""
echo "📸 Capture current output:"
echo "   tmux -S '$SOCKET' capture-pane -p -t '$SESSION' -S -100"
echo ""
echo "🛑 Detach without killing: Ctrl+b then d"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Ensure cleanup on exit
trap "tmux -S '$SOCKET' kill-session -t '$SESSION' 2>/dev/null || true" EXIT

for i in $(seq 1 "$iterations"); do
  echo "Starting iteration $i..."
  echo ""
  
  # Start opencode in the project root
  tmux -S "$SOCKET" send-keys -t "$SESSION" "cd $project_root" Enter
  sleep 0.5
  tmux -S "$SOCKET" send-keys -t "$SESSION" "echo '═══════════════════════════════════════════════════════'" Enter
  tmux -S "$SOCKET" send-keys -t "$SESSION" "echo '🤖 Ralph - Iteration $i - \$(date)'" Enter
  tmux -S "$SOCKET" send-keys -t "$SESSION" "echo '═══════════════════════════════════════════════════════'" Enter
  sleep 0.3
  
  # Read the prompt
  prompt_content="$(<"$prompt_file")"
  
  # Run opencode with the prompt
  session_title="ralph-task-${i}-$(date +%Y%m%d-%H%M%S)"
  tmux -S "$SOCKET" send-keys -t "$SESSION" "OPENCODE_CONFIG='$opencode_config_file' opencode run --format default --model 'openai/gpt-5.3-codex' --variant high --title '$session_title' \"\$(cat $prompt_file)\"" Enter
  
  # Wait for completion - poll for shell prompt return
  timeout=600  # 10 minutes max
  elapsed=0
  completed=false
  
  echo "⏳ Waiting for task completion (max ${timeout}s)..."
  
  while [ $elapsed -lt $timeout ]; do
    # Capture recent output
    recent_output=$(tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION" -S -5 2>/dev/null || echo "")
    
    # Check if we're back at shell prompt (opencode exited)
    if echo "$recent_output" | tail -3 | grep -qE '\$\s*$|❯\s*$|#\s*$'; then
      completed=true
      break
    fi
    
    sleep 5
    elapsed=$((elapsed + 5))
  done
  
  if [ "$completed" = false ]; then
    echo "⚠️  Timeout after ${timeout}s - opencode may still be running"
    echo "Check the tmux session for details"
  fi
  
  # Capture full output
  result=$(tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION" -S -1000 2>/dev/null || echo "Failed to capture output")
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Iteration $i results:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  print_relevant_output "$result"
  echo ""

  # Check for changes and create PR if needed
  cd "$project_root"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "📝 Changes detected - creating pull request..."
    
    # Get task info from result
    task_id=$(echo "$result" | grep -oP '(?<=Task complete: )[A-Z0-9-]+' | head -1 || echo "task-$i")
    
    # Create feature branch
    branch_name="feat/ralph-${task_id}-$(date +%Y%m%d-%H%M%S)"
    git checkout -b "$branch_name"
    
    # Commit all changes
    git add -A
    commit_msg=$(git diff --cached --name-only | head -10 | xargs echo "feat: ${task_id} -")
    git commit -m "$commit_msg" || true
    
    # Push branch
    git push -u origin "$branch_name"
    
    # Create PR using gh CLI and merge immediately
    if command -v gh &> /dev/null; then
      pr_url=$(gh pr create --title "$commit_msg" --body "Auto-generated by Ralph agent (iteration $i)" --base main --head "$branch_name" 2>&1)
      echo "✅ PR created: $pr_url"
      
      # Merge immediately (no review required)
      pr_number=$(echo "$pr_url" | grep -oP '(?<=/pull/)[0-9]+')
      if [ -n "$pr_number" ]; then
        gh pr merge "$pr_number" --merge --delete-branch --admin
        echo "✅ PR #$pr_number merged and branch deleted"
      fi
    else
      echo "⚠️  gh CLI not found - changes pushed to $branch_name but PR not created"
      echo "   Please install gh CLI: https://cli.github.com/"
    fi
    
    # Return to main
    git checkout main
    git pull origin main
  fi

  if has_marker "$result" "COMPLETE"; then
    echo "✅ All tasks complete!"
    exit 0
  fi

  if has_marker "$result" "TASK_COMPLETE"; then
    echo "✅ Task complete. Starting next task in a new session..."
  else
    echo "⚠️  No completion marker found - check tmux session for details"
  fi
  
  echo ""
done

echo "Reached iteration limit. Review progress and continue if needed."
