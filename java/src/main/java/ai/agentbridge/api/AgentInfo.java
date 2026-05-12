package ai.agentbridge.api;

public record AgentInfo(
        String id,
        String name,
        String conversationId,
        String groupId,
        AgentState state,
        String description
) {}
