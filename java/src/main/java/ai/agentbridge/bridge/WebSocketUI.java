package ai.agentbridge.bridge;

import ai.agentbridge.api.AgentInfo;
import ai.agentbridge.api.AgentState;
import ai.agentbridge.api.FileRef;
import ai.agentbridge.api.GroupSummary;
import ai.agentbridge.api.MessageRecord;
import ai.agentbridge.api.MessageReplacement;
import ai.agentbridge.api.UI;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.Map;

/**
 * Implementation of UI that serializes each event into a JSON-RPC
 * notification and broadcasts it over every active WebSocket connection.
 */
public class WebSocketUI implements UI {

    private static final Logger log = LoggerFactory.getLogger(WebSocketUI.class);

    private final BridgeServer server;
    private final ObjectMapper mapper;

    public WebSocketUI(BridgeServer server, ObjectMapper mapper) {
        this.server = server;
        this.mapper = mapper;
    }

    @Override
    public void onMessage(MessageRecord msg) {
        emit("onMessage", Map.of("msg", msg));
    }

    @Override
    public void onMessageAppend(MessageRecord msg) {
        emit("onMessageAppend", Map.of("msg", msg));
    }

    @Override
    public void onMessageReplace(MessageReplacement replacement) {
        emit("onMessageReplace", Map.of("replacement", replacement));
    }

    @Override
    public void onStatusChange(String agentId, AgentState state, String reason) {
        Map<String, Object> params = new HashMap<>();
        params.put("agentId", agentId);
        params.put("state", state);
        params.put("reason", reason);
        emit("onStatusChange", params);
    }

    @Override
    public void onInputNeeded(String conversationId, String agentId, String prompt) {
        emit("onInputNeeded", Map.of(
                "conversationId", conversationId,
                "agentId", agentId,
                "prompt", prompt));
    }

    @Override
    public void onAgentAdded(AgentInfo agent) {
        emit("onAgentAdded", Map.of("agent", agent));
    }

    @Override
    public void onAgentRemoved(String agentId) {
        emit("onAgentRemoved", Map.of("agentId", agentId));
    }

    @Override
    public void onGroupUpdate(String groupId, GroupSummary summary) {
        emit("onGroupUpdate", Map.of(
                "groupId", groupId,
                "summary", summary));
    }

    @Override
    public void onFileAvailable(FileRef file) {
        emit("onFileAvailable", Map.of("file", file));
    }

    private void emit(String method, Object params) {
        try {
            String frame = mapper.writeValueAsString(JsonRpc.Notification.of(method, params));
            server.broadcast(frame);
        } catch (Exception e) {
            log.warn("failed to emit {}: {}", method, e.getMessage());
        }
    }
}
