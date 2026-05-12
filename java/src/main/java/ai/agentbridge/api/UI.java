package ai.agentbridge.api;

/**
 * The Java-side handle the agent system uses to push events to the UI.
 * The bridge supplies an implementation that serializes each call into a
 * JSON-RPC notification over the live WebSocket connection(s).
 */
public interface UI {
    void onMessage(String conversationId, MessageRecord msg);

    void onStatusChange(String agentId, AgentState state, String reason);

    void onInputNeeded(String conversationId, String agentId, String prompt);

    void onAgentAdded(AgentInfo agent);

    void onAgentRemoved(String agentId);

    void onGroupUpdate(String groupId, GroupSummary summary);
}
