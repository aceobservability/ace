#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEBSITE="$REPO_ROOT/website"

# --- Step 1: Copy root markdown files with VitePress frontmatter ---

copy_with_frontmatter() {
  local src="$1" dest="$2" title="$3"
  if [ ! -f "$src" ]; then
    echo "error: $src not found" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$dest")"
  printf -- '---\ntitle: "%s"\n---\n\n' "$title" > "$dest"
  cat "$src" >> "$dest"
}

copy_with_frontmatter "$REPO_ROOT/README.md"      "$WEBSITE/guide/getting-started.md" "Getting Started"
copy_with_frontmatter "$REPO_ROOT/DESIGN.md"       "$WEBSITE/guide/design-system.md"   "Design System"
copy_with_frontmatter "$REPO_ROOT/STYLE_GUIDE.md"  "$WEBSITE/guide/style-guide.md"     "Style Guide"
copy_with_frontmatter "$REPO_ROOT/CHANGELOG.md"    "$WEBSITE/guide/changelog.md"       "Changelog"
copy_with_frontmatter "$REPO_ROOT/SECURITY.md"     "$WEBSITE/guide/security.md"        "Security"
copy_with_frontmatter "$REPO_ROOT/RELEASE.md"      "$WEBSITE/guide/release-process.md" "Release Process"
copy_with_frontmatter "$REPO_ROOT/AGENTS.md"       "$WEBSITE/guide/contributing.md"    "Contributing"

echo "build-docs: copied 7 guide pages"

# --- Step 2: Generate API route reference ---

(cd "$REPO_ROOT/backend" && go run ./cmd/docgen -out "$WEBSITE/api/routes.md")

# --- Step 3: Build VitePress (skip with --skip-build) ---

if [ "${1:-}" != "--skip-build" ]; then
  (cd "$WEBSITE" && bun run build)
  echo "build-docs: VitePress build complete"
else
  echo "build-docs: skipping VitePress build (--skip-build)"
fi
