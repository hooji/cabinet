#!/usr/bin/env bash
#
# clean.sh — remove all generated build outputs.
#
# Keeps source, node_modules, and the local Maven cache (~/.m2).
# Run scripts/build-release.sh afterward for a fully fresh build.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

rm -rf java/target .next out
find dist -maxdepth 1 \( -name "*.jar" -o -name "*.tar.gz" -o -name "*.zip" \) -delete 2>/dev/null || true

echo "✓ cleaned: java/target, .next, out, dist/*.{jar,tar.gz,zip}"
