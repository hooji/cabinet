package ai.agentbridge.api;

import java.util.List;

public record GroupInfo(
        String id,
        String name,
        List<String> agentIds
) {}
