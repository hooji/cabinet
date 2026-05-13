package ai.agentbridge.api;

public record MessageRecord(
        String id,
        String conversationId,
        String from,
        String text,
        long ts
) {
    /** Convenience: timestamps with System.currentTimeMillis() at construction. */
    public MessageRecord(String id, String conversationId, String from, String text) {
        this(id, conversationId, from, text, System.currentTimeMillis());
    }
}
