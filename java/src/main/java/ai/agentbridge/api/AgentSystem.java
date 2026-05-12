package ai.agentbridge.api;

import java.util.List;
import java.util.Map;

/**
 * The UI-facing surface of the agent system. The bridge translates inbound
 * JSON-RPC requests from the UI into method calls on an implementation of
 * this interface.
 */
public interface AgentSystem {
    List<AgentInfo> listAgents();

    List<GroupInfo> listGroups();

    /**
     * @param beforeId nullable; if non-null, return messages strictly before
     *                 this message id (for pagination)
     */
    List<MessageRecord> getHistory(String conversationId, int limit, String beforeId);

    void sendMessage(String conversationId, String text);

    void sendDirective(String targetId, TargetKind kind, String cmd, Map<String, Object> args);
}
