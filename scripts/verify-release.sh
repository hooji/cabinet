#!/usr/bin/env bash
#
# verify-release.sh — smoke-test the dist/ artifacts end-to-end.
#
# 1. Extracts the UI tarball to /tmp/
# 2. Starts the bridge fat JAR on :9876
# 3. Drives a headless Chromium against the UI loaded via file://
# 4. Asserts the auto-scroll + focus invariants
# 5. Tears down the Java process
#
# Run this before publishing any release. Reproduces the user's setup
# (file:// + LAN-connected Java backend) as closely as possible.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

for cmd in java node tar sed lsof; do
  command -v "$cmd" >/dev/null || { echo "missing required tool: $cmd"; exit 1; }
done

VERSION=$(sed -nE 's/.*<version>([^<]+)<\/version>.*/\1/p' java/pom.xml | head -1)
JAR="dist/agent-bridge-${VERSION}-all.jar"
TARBALL="dist/agent-bridge-ui-${VERSION}.tar.gz"

[[ -f "$JAR" ]] || { echo "missing: $JAR — run scripts/build-release.sh first"; exit 1; }
[[ -f "$TARBALL" ]] || { echo "missing: $TARBALL — run scripts/build-release.sh first"; exit 1; }

# Free port 9876 (in case a previous run left something behind).
lsof -ti:9876 2>/dev/null | xargs -r kill -9 || true

# Extract the tarball fresh.
EXTRACT_DIR="/tmp/agent-bridge-ui-${VERSION}"
rm -rf "$EXTRACT_DIR"
tar xzf "$TARBALL" -C /tmp
echo "→ UI extracted to $EXTRACT_DIR"

# Start the bridge.
LOG_FILE=$(mktemp)
java -jar "$JAR" >"$LOG_FILE" 2>&1 &
JAVA_PID=$!
trap 'kill -9 $JAVA_PID 2>/dev/null || true; rm -f "$LOG_FILE"' EXIT

# Wait for "agent bridge ready" in the log (max ~15s).
for _ in {1..30}; do
  grep -q "agent bridge ready" "$LOG_FILE" 2>/dev/null && { echo "→ bridge ready on :9876"; break; }
  sleep 0.5
done
grep -q "agent bridge ready" "$LOG_FILE" || { echo "bridge failed to start; log:"; cat "$LOG_FILE"; exit 1; }

# Run the playwright regression test against the extracted tarball.
AGENT_BRIDGE_TEST_URL="file://${EXTRACT_DIR}/index.html" \
  node scripts/test-scroll-and-focus.mjs

echo
echo "✓ release ${VERSION} verified"
