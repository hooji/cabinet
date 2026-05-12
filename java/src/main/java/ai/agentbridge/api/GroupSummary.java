package ai.agentbridge.api;

public record GroupSummary(
        int liveCount,
        int blockedCount,
        int totalCount,
        long lastActivityAt
) {}
