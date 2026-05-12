package ai.agentbridge.bridge;

import ai.agentbridge.api.AgentInfo;
import ai.agentbridge.api.AgentState;
import ai.agentbridge.api.AgentSystem;
import ai.agentbridge.api.GroupInfo;
import ai.agentbridge.api.MessageRecord;
import ai.agentbridge.api.TargetKind;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class DispatcherTest {

    private ObjectMapper mapper;
    private RecordingSystem system;
    private Dispatcher dispatcher;

    @BeforeEach
    void setUp() {
        mapper = new ObjectMapper();
        system = new RecordingSystem();
        dispatcher = new Dispatcher(system, mapper);
    }

    @Test
    void routesListAgents() throws Exception {
        String response = dispatcher.handle("""
                {"jsonrpc":"2.0","id":1,"method":"listAgents"}""");
        JsonNode node = mapper.readTree(response);
        assertEquals(1, node.get("id").asInt());
        assertEquals("a1", node.get("result").get(0).get("id").asText());
    }

    @Test
    void routesSendMessageAndCapturesParams() throws Exception {
        String response = dispatcher.handle("""
                {"jsonrpc":"2.0","id":7,"method":"sendMessage",
                 "params":{"conversationId":"c1","text":"hello"}}""");
        JsonNode node = mapper.readTree(response);
        assertEquals(7, node.get("id").asInt());
        assertEquals("ok", node.get("result").asText());
        assertEquals(List.of("c1:hello"), system.sentMessages);
    }

    @Test
    void unknownMethodReturnsMethodNotFound() throws Exception {
        String response = dispatcher.handle("""
                {"jsonrpc":"2.0","id":2,"method":"banana"}""");
        JsonNode node = mapper.readTree(response);
        assertEquals(JsonRpc.METHOD_NOT_FOUND, node.get("error").get("code").asInt());
    }

    @Test
    void malformedJsonReturnsParseError() throws Exception {
        String response = dispatcher.handle("not json {");
        JsonNode node = mapper.readTree(response);
        assertEquals(JsonRpc.PARSE_ERROR, node.get("error").get("code").asInt());
        assertTrue(node.get("id").isNull());
    }

    @Test
    void missingRequiredParamReturnsInvalidParams() throws Exception {
        String response = dispatcher.handle("""
                {"jsonrpc":"2.0","id":3,"method":"sendMessage","params":{"text":"oops"}}""");
        JsonNode node = mapper.readTree(response);
        assertEquals(JsonRpc.INVALID_PARAMS, node.get("error").get("code").asInt());
    }

    @Test
    void notificationsGetNoResponse() {
        String response = dispatcher.handle("""
                {"jsonrpc":"2.0","method":"listAgents"}""");
        assertNull(response);
    }

    @Test
    void sendDirectiveDeserializesKindAndArgs() {
        dispatcher.handle("""
                {"jsonrpc":"2.0","id":4,"method":"sendDirective",
                 "params":{"targetId":"a1","kind":"agent","cmd":"pause","args":{"reason":"breakfast"}}}""");
        assertEquals(1, system.directives.size());
        RecordedDirective d = system.directives.get(0);
        assertEquals(TargetKind.AGENT, d.kind);
        assertEquals("pause", d.cmd);
        assertEquals("breakfast", d.args.get("reason"));
    }

    @Test
    void getHistoryAppliesDefaultLimit() {
        dispatcher.handle("""
                {"jsonrpc":"2.0","id":5,"method":"getHistory","params":{"conversationId":"c1"}}""");
        assertEquals("c1", system.lastHistoryConversation);
        assertEquals(50, system.lastHistoryLimit);
    }

    // ─── Fake AgentSystem used to capture dispatcher routing ───

    record RecordedDirective(String targetId, TargetKind kind, String cmd, Map<String, Object> args) {}

    static class RecordingSystem implements AgentSystem {
        final List<String> sentMessages = new ArrayList<>();
        final List<RecordedDirective> directives = new ArrayList<>();
        String lastHistoryConversation;
        int lastHistoryLimit;

        @Override public List<AgentInfo> listAgents() {
            return List.of(new AgentInfo("a1", "Alpha", "conv-a1", null, AgentState.IDLE, null));
        }
        @Override public List<GroupInfo> listGroups() { return List.of(); }
        @Override public List<MessageRecord> getHistory(String conversationId, int limit, String beforeId) {
            lastHistoryConversation = conversationId;
            lastHistoryLimit = limit;
            return List.of();
        }
        @Override public void sendMessage(String conversationId, String text) {
            sentMessages.add(conversationId + ":" + text);
        }
        @Override public void sendDirective(String targetId, TargetKind kind, String cmd, Map<String, Object> args) {
            directives.add(new RecordedDirective(targetId, kind, cmd, args));
        }
    }
}
