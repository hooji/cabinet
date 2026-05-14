#!/usr/bin/env bash
#
# build-release.sh — generate a fresh set of release artifacts under dist/.
#
# Always builds everything from scratch — no incremental output, no cache
# reuse. This is non-negotiable: we previously shipped a tarball with
# stale chunks because a cached Next build slipped through. The script
# now guarantees that cannot happen.
#
# Outputs (in dist/):
#   agent-bridge-<version>.jar          — clean library JAR (deps separate)
#   agent-bridge-<version>-all.jar      — shaded fat JAR (deps included)
#   agent-bridge-<version>-sources.jar  — source attachment for IDEs
#   agent-bridge-ui-<version>.tar.gz    — pre-built static UI
#   agent-bridge-<version>.zip          — all of the above + README, one file
#
# Version is read from java/pom.xml. Bump it there to cut a new version.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ─── prerequisites ─────────────────────────────────────────────────────
for cmd in mvn node npm tar zip sed; do
  command -v "$cmd" >/dev/null || { echo "missing required tool: $cmd"; exit 1; }
done

VERSION=$(sed -nE 's/.*<version>([^<]+)<\/version>.*/\1/p' java/pom.xml | head -1)
[[ -n "$VERSION" ]] || { echo "could not read version from java/pom.xml"; exit 1; }
echo "→ building release ${VERSION}"

# ─── 1. clean prior outputs ────────────────────────────────────────────
echo "→ [1/4] cleaning prior outputs"
rm -rf java/target .next out
mkdir -p dist
find dist -maxdepth 1 \( -name "*.jar" -o -name "*.tar.gz" -o -name "*.zip" \) -delete 2>/dev/null || true

# ─── 2. Java build + tests ─────────────────────────────────────────────
echo "→ [2/4] building Java module (mvn clean package, with tests)"
mvn -f java/pom.xml -q clean package

# ─── 3. UI build (static export with relative asset paths) ─────────────
echo "→ [3/4] building static UI export"
echo "        installing UI dependencies (npm ci)..."
npm ci --silent
echo "        running next build (AGENT_BRIDGE_STATIC=true)..."
AGENT_BRIDGE_STATIC=true npm run build >/dev/null

# ─── 4. assemble dist/ ─────────────────────────────────────────────────
echo "→ [4/4] assembling dist/"

cp "java/target/agent-bridge-${VERSION}.jar"          "dist/"
cp "java/target/agent-bridge-${VERSION}-all.jar"      "dist/"
cp "java/target/agent-bridge-${VERSION}-sources.jar"  "dist/"

tar czf "dist/agent-bridge-ui-${VERSION}.tar.gz" \
    --transform "s,^out,agent-bridge-ui-${VERSION}," \
    -C "$REPO_ROOT" out

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir "$STAGE/agent-bridge-${VERSION}"
cp dist/README.md \
   "dist/agent-bridge-${VERSION}.jar" \
   "dist/agent-bridge-${VERSION}-all.jar" \
   "dist/agent-bridge-${VERSION}-sources.jar" \
   "dist/agent-bridge-ui-${VERSION}.tar.gz" \
   "$STAGE/agent-bridge-${VERSION}/"
(cd "$STAGE" && zip -rq "$REPO_ROOT/dist/agent-bridge-${VERSION}.zip" "agent-bridge-${VERSION}")

echo
echo "✓ release ${VERSION} built:"
ls -lh dist/*.{jar,tar.gz,zip} 2>/dev/null
echo
echo "Run scripts/verify-release.sh to smoke-test end-to-end."
