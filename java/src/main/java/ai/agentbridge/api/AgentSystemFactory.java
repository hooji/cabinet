package ai.agentbridge.api;

/**
 * Implementations construct an AgentSystem bound to the given UI callback.
 * The bridge wires its WebSocket-backed UI to the factory at startup.
 */
public interface AgentSystemFactory {
    AgentSystem create(UI ui);
}
