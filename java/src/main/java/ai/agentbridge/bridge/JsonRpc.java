package ai.agentbridge.bridge;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * JSON-RPC 2.0 envelope shapes. We accept requests (with id) and emit either
 * responses (echoing the id) or notifications (no id). Notifications are
 * only sent server-to-client; inbound notifications from the UI are ignored.
 */
public final class JsonRpc {

    public static final String VERSION = "2.0";

    // Standard error codes
    public static final int PARSE_ERROR = -32700;
    public static final int INVALID_REQUEST = -32600;
    public static final int METHOD_NOT_FOUND = -32601;
    public static final int INVALID_PARAMS = -32602;
    public static final int INTERNAL_ERROR = -32603;

    public record Request(String jsonrpc, JsonNode id, String method, JsonNode params) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Response(String jsonrpc, JsonNode id, Object result, ErrorObject error) {
        public static Response ok(JsonNode id, Object result) {
            return new Response(VERSION, id, result, null);
        }
        public static Response err(JsonNode id, int code, String message) {
            return new Response(VERSION, id, null, new ErrorObject(code, message, null));
        }
    }

    public record Notification(String jsonrpc, String method, Object params) {
        public static Notification of(String method, Object params) {
            return new Notification(VERSION, method, params);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ErrorObject(int code, String message, Object data) {}

    private JsonRpc() {}
}
