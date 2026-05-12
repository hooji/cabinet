package ai.agentbridge;

import ai.agentbridge.api.AgentSystem;
import ai.agentbridge.api.AgentSystemFactory;
import ai.agentbridge.api.UI;
import ai.agentbridge.bridge.BridgeServer;
import ai.agentbridge.bridge.Dispatcher;
import ai.agentbridge.bridge.WebSocketUI;
import ai.agentbridge.shim.ElizaShimFactory;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Main {

    private static final Logger log = LoggerFactory.getLogger(Main.class);

    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getenv().getOrDefault("AGENT_BRIDGE_PORT", "9876"));

        ObjectMapper mapper = new ObjectMapper();
        BridgeServer server = new BridgeServer(port);
        UI ui = new WebSocketUI(server, mapper);

        AgentSystemFactory factory = new ElizaShimFactory();
        AgentSystem system = factory.create(ui);

        Dispatcher dispatcher = new Dispatcher(system, mapper);
        server.setHandler(dispatcher::handle);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                log.info("shutting down");
                server.stop(2000);
                if (system instanceof AutoCloseable c) c.close();
            } catch (Exception e) {
                log.warn("shutdown error: {}", e.getMessage());
            }
        }));

        server.start();
        log.info("agent bridge ready; ELIZA shim active");
    }

    private Main() {}
}
