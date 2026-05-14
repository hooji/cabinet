# Building and releasing

## Quick reference

| Command | What it does |
|---|---|
| `npm run release` | Full clean build of all release artifacts under `dist/` |
| `npm run release:verify` | End-to-end smoke test of the built artifacts |
| `npm run clean` | Delete all generated build outputs |
| `npm run dev` | Next dev server with HMR (for UI iteration) |
| `npm run java:run` | Run the ELIZA shim against the dev UI |
| `npm run java:build` | Quick Java rebuild without tests |

## The release pipeline

`npm run release` (which runs `scripts/build-release.sh`) does the
following, in order:

1. **Clean.** Removes `java/target/`, `.next/`, `out/`, and every
   versioned artifact in `dist/`. The build always starts from a
   guaranteed-fresh state — never incremental, never reusing cache.
   This step is non-negotiable: in earlier development we shipped a
   tarball containing stale chunks because a cached build artifact
   slipped through. The script makes that impossible now.
2. **Java build + tests.** `mvn clean package` (tests run by default).
   Produces three JARs in `java/target/`:
   - `agent-bridge-<version>.jar` — clean library JAR (~31 KB)
   - `agent-bridge-<version>-all.jar` — shaded fat JAR (~2.5 MB,
     includes Jackson + Java-WebSocket + SLF4J)
   - `agent-bridge-<version>-sources.jar` — source attachment for IDE
     step-into
3. **UI build.** `npm ci` to install exactly what `package-lock.json`
   pins, then `AGENT_BRIDGE_STATIC=true npm run build`. Produces a
   static export in `out/` with relative asset paths so `file://`
   works in Safari.
4. **Assemble `dist/`.** Copies the three JARs, tars `out/` into
   `dist/agent-bridge-ui-<version>.tar.gz`, then bundles all four
   plus `dist/README.md` into `dist/agent-bridge-<version>.zip` for
   the single-download path.

The version string is read from `java/pom.xml` (`<version>` element).
Bump it there to cut a new version; the script picks it up
automatically and every artifact gets the new version suffix.

## Why "static export" and not "bundled application"

The UI is **not** an Electron app, **not** a Vercel deployment, **not**
an SSR site. It's plain HTML/JS/CSS in a tarball. See
[ARCHITECTURE.md → Static export rationale](./ARCHITECTURE.md#static-export-rationale)
for the reasoning.

To open the UI: extract the tarball, open `index.html` in a browser.
To deploy it remotely: host the `out/` folder on any plain-static host
(S3, GitHub Pages, nginx serving a directory).

## Verifying a release

`npm run release:verify` runs an end-to-end smoke test against the
freshly-built artifacts:

1. Extracts the UI tarball to `/tmp/agent-bridge-ui-<version>`.
2. Starts the bridge fat JAR on `:9876` in the background.
3. Drives a headless Chromium against the UI loaded via `file://`.
4. Asserts the 11-point checklist around auto-scroll and focus
   retention (`scripts/test-scroll-and-focus.mjs`).
5. Tears down the Java process.

Run this before publishing any release. It reproduces a user's actual
setup — UI loaded via `file://` from disk, talking to a real bridge
over WebSocket — and is the closest thing we have to running in Safari
locally.

If you need to point the test at a non-default URL or version, set
`AGENT_BRIDGE_TEST_URL` (e.g.
`AGENT_BRIDGE_TEST_URL=http://localhost:3000 node scripts/test-scroll-and-focus.mjs`).

## Dev iteration

For active development you do not run `npm run release` on every save.
Use the dev loop instead:

```bash
# terminal 1 — Java side
npm run java:run            # ELIZA shim with hot mvn rebuilds via `mvn exec:java`

# terminal 2 — UI side
npm run dev                 # Next dev server with HMR
```

Open `http://localhost:3000` in a browser. UI saves auto-reload; Java
needs an `mvn package` to pick up changes.

For Java unit tests on their own:

```bash
mvn -f java/pom.xml test
```

## What the release artifacts are for

| Artifact | Drop into | Notes |
|---|---|---|
| `agent-bridge-<version>-all.jar` | your Java project's `lib/` | Single-file integration |
| `agent-bridge-<version>.jar` | a Maven/Gradle dep | Use if you manage deps yourself |
| `agent-bridge-<version>-sources.jar` | alongside above | IDE source navigation / Javadoc |
| `agent-bridge-ui-<version>.tar.gz` | extract, open `index.html` | The UI |
| `agent-bridge-<version>.zip` | extract for everything | All four files + `README.md` |

## Cutting a new version

1. Edit `java/pom.xml` and bump the `<version>` element.
2. Run `npm run release`. All artifacts get the new version suffix.
3. Run `npm run release:verify`.
4. Commit the version bump and the refreshed `dist/`.
5. Push.

A future iteration could add a `--push-tag` flag and a GitHub release
creation step, but right now this is left manual.
