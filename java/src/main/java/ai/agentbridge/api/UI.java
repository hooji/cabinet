package ai.agentbridge.api;

/**
 * The Java-side handle the agent system uses to push events to the UI.
 * The bridge supplies an implementation that serializes each call into a
 * JSON-RPC notification over the live WebSocket connection(s).
 */
public interface UI {
    /**
     * Push a new message into a conversation. The MessageRecord carries
     * its conversationId, so the UI knows where to file it.
     */
    void onMessage(MessageRecord msg);

    void onStatusChange(String agentId, AgentState state, String reason);

    void onInputNeeded(String conversationId, String agentId, String prompt);

    void onAgentAdded(AgentInfo agent);

    void onAgentRemoved(String agentId);

    void onGroupUpdate(String groupId, GroupSummary summary);
}
