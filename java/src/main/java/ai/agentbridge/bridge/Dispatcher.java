package ai.agentbridge.bridge;

import ai.agentbridge.api.AgentSystem;
import ai.agentbridge.api.TargetKind;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.NullNode;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

/**
 * Routes inbound JSON-RPC 2.0 requests to the appropriate AgentSystem method,
 * serializes the result, and returns the response frame as a JSON string.
 * Notifications (requests with no id) get no response.
 */
public final class Dispatcher {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final AgentSystem system;
    private final ObjectMapper mapper;
    private final Map<String, Function<JsonNode, Object>> handlers = new HashMap<>();

    public Dispatcher(AgentSystem system, ObjectMapper mapper) {
        this.system = system;
        this.mapper = mapper;
        registerHandlers();
    }

    private void registerHandlers() {
        handlers.put("listAgents", p -> system.listAgents());
        handlers.put("listGroups", p -> system.listGroups());
        handlers.put("getHistory", p -> {
            String conversationId = requireText(p, "conversationId");
            int limit = p.has("limit") && !p.get("limit").isNull() ? p.get("limit").asInt(50) : 50;
            String beforeId = optionalText(p, "beforeId");
            return system.getHistory(conversationId, limit, beforeId);
        });
        handlers.put("sendMessage", p -> {
            String conversationId = requireText(p, "conversationId");
            String text = requireText(p, "text");
            system.sendMessage(conversationId, text);
            return "ok";
        });
        handlers.put("sendDirective", p -> {
            String targetId = requireText(p, "targetId");
            TargetKind kind = TargetKind.valueOf(requireText(p, "kind").toUpperCase());
            String cmd = requireText(p, "cmd");
            Map<String, Object> args = p.has("args") && !p.get("args").isNull()
                    ? mapper.convertValue(p.get("args"), MAP_TYPE)
                    : Map.of();
            system.sendDirective(targetId, kind, cmd, args);
            return "ok";
        });
    }

    /**
     * @return JSON-encoded response, or null when the inbound frame was a
     *         notification (no id) or otherwise produces no reply
     */
    public String handle(String json) {
        JsonNode root;
        try {
            root = mapper.readTree(json);
        } catch (Exception e) {
            return writeOrFallback(JsonRpc.Response.err(NullNode.instance, JsonRpc.PARSE_ERROR, "parse error"));
        }

        JsonNode idNode = root.get("id");
        boolean isNotification = idNode == null || idNode.isNull();

        if (!root.hasNonNull("method")) {
            if (isNotification) return null;
            return writeOrFallback(JsonRpc.Response.err(idNode, JsonRpc.INVALID_REQUEST, "missing method"));
        }
        String method = root.get("method").asText();
        JsonNode params = root.has("params") ? root.get("params") : mapper.createObjectNode();

        Function<JsonNode, Object> handler = handlers.get(method);
        if (handler == null) {
            if (isNotification) return null;
            return writeOrFallback(JsonRpc.Response.err(idNode, JsonRpc.METHOD_NOT_FOUND, "unknown method: " + method));
        }

        try {
            Object result = handler.apply(params);
            if (isNotification) return null;
            return writeOrFallback(JsonRpc.Response.ok(idNode, result));
        } catch (IllegalArgumentException e) {
            if (isNotification) return null;
            return writeOrFallback(JsonRpc.Response.err(idNode, JsonRpc.INVALID_PARAMS, e.getMessage()));
        } catch (Exception e) {
            if (isNotification) return null;
            return writeOrFallback(JsonRpc.Response.err(idNode, JsonRpc.INTERNAL_ERROR, e.getClass().getSimpleName() + ": " + e.getMessage()));
        }
    }

    private String writeOrFallback(JsonRpc.Response response) {
        try {
            return mapper.writeValueAsString(response);
        } catch (Exception e) {
            return "{\"jsonrpc\":\"2.0\",\"id\":null,\"error\":{\"code\":-32603,\"message\":\"serialization failure\"}}";
        }
    }

    private static String requireText(JsonNode params, String field) {
        if (!params.hasNonNull(field)) {
            throw new IllegalArgumentException("missing required field: " + field);
        }
        return params.get(field).asText();
    }

    private static String optionalText(JsonNode params, String field) {
        return params.hasNonNull(field) ? params.get(field).asText() : null;
    }
}
