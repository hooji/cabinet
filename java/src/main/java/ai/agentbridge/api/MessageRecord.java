package ai.agentbridge.api;

public record MessageRecord(
        String id,
        String conversationId,
        String from,
        String text,
        long ts
) {}
