# Agent Bridge — distribution artifacts

Pre-built release artifacts. Drop the ones you need into your project.

## Files

| File | Purpose |
|---|---|
| `agent-bridge-0.1.0-all.jar` | **Recommended for IntelliJ.** Shaded fat JAR with all dependencies (Jackson 2.21, Java-WebSocket 1.6, SLF4J 2.0) baked in. Drop this single file into your project's `lib/` directory and you're done. |
| `agent-bridge-0.1.0.jar` | Clean library JAR (31 KB) — bridge classes only. Use this if you manage dependencies yourself (e.g. you already pull Jackson/Java-WebSocket via Maven/Gradle elsewhere). |
| `agent-bridge-0.1.0-sources.jar` | Source code for IDE source-attachment (browse + step-into in IntelliJ). |
| `agent-bridge-ui-0.1.0.tar.gz` | Pre-built UI static files. Extract → open `agent-bridge-ui-0.1.0/index.html` in any browser. No web server, no Node, nothing else needed. |

## Java integration (IntelliJ, no Maven)

1. Copy `agent-bridge-0.1.0-all.jar` into your project's `lib/` directory.
2. In IntelliJ: **File → Project Structure → Libraries → +** → point at `lib/agent-bridge-0.1.0-all.jar`.
3. (Optional) For source navigation, also attach `agent-bridge-0.1.0-sources.jar` in the same library entry.
4. Implement `ai.agentbridge.api.AgentSystem` and `ai.agentbridge.api.AgentSystemFactory`.
5. Wire up a Main, e.g.:

```java
import ai.agentbridge.api.*;
import ai.agentbridge.bridge.*;
import com.fasterxml.jackson.databind.ObjectMapper;

public class Main {
    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getenv().getOrDefault("AGENT_BRIDGE_PORT", "9876"));
        ObjectMapper mapper = new ObjectMapper();
        BridgeServer server = new BridgeServer(port);
        UI ui = new WebSocketUI(server, mapper);
        AgentSystem system = new MyAgentSystemFactory().create(ui);
        server.setHandler(new Dispatcher(system, mapper)::handle);
        server.start();
    }
}
```

## UI (Safari, no server)

1. Extract `agent-bridge-ui-0.1.0.tar.gz`.
2. Open `agent-bridge-ui-0.1.0/index.html` in Safari (double-click, or `open` from Terminal).
3. The UI connects to `ws://localhost:9876` by default. If your Java is on a different machine on your LAN, click the gear icon → set the server URL (e.g. `ws://192.168.0.42:9876`) → Save.

The UI persists the chosen server URL in localStorage, so subsequent opens connect automatically.

## Standalone smoke test (no integration yet)

If you want to see the UI working before wiring up your own Java implementation, the fat JAR also ships with an embedded ELIZA shim:

```
java -jar agent-bridge-0.1.0-all.jar
```

…then open the UI. You'll see three ELIZA personas in a "Therapy Room" group.
