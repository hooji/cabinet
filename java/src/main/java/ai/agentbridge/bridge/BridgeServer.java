package ai.agentbridge.bridge;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.InetSocketAddress;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

/**
 * WebSocket endpoint for the bridge. Inbound text frames go to a configurable
 * handler (the JSON-RPC Dispatcher); outbound notifications fan out via
 * broadcast() to every connected UI.
 */
public class BridgeServer extends WebSocketServer {

    private static final Logger log = LoggerFactory.getLogger(BridgeServer.class);

    private final Set<WebSocket> connections = ConcurrentHashMap.newKeySet();
    private volatile Function<String, String> handler = msg -> null;

    public BridgeServer(int port) {
        super(new InetSocketAddress(port));
        setReuseAddr(true);
    }

    public void setHandler(Function<String, String> handler) {
        this.handler = handler;
    }

    public int connectionCount() {
        return connections.size();
    }

    public void broadcast(String frame) {
        for (WebSocket conn : connections) {
            if (conn.isOpen()) {
                try {
                    conn.send(frame);
                } catch (Exception e) {
                    log.warn("send failed to {}: {}", conn.getRemoteSocketAddress(), e.getMessage());
                }
            }
        }
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        connections.add(conn);
        log.info("client connected: {} (total {})", conn.getRemoteSocketAddress(), connections.size());
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        connections.remove(conn);
        log.info("client disconnected: {} (code={}, reason={}, total {})",
                conn.getRemoteSocketAddress(), code, reason, connections.size());
    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        String response = handler.apply(message);
        if (response != null) {
            conn.send(response);
        }
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        log.error("websocket error on {}: {}", conn == null ? "server" : conn.getRemoteSocketAddress(), ex.getMessage(), ex);
    }

    @Override
    public void onStart() {
        setConnectionLostTimeout(30);
        log.info("bridge server listening on {}", getAddress());
    }
}
