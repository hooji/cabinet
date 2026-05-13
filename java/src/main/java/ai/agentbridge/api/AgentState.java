package ai.agentbridge.api;

public enum AgentState {
    /** Doing work in the background; not necessarily replying. */
    WORKING,
    /** Actively listening for input. */
    LISTENING,
    /** Composing or sending a reply right now. */
    ANSWERING,
    /** Explicitly paused by user. */
    PAUSED,
    /** Waiting for an external dependency (timer, network, etc.). */
    WAITING,
    /** Blocked waiting for user input. */
    BLOCKED,
    /** Nothing happening; ready to accept work. */
    IDLE,
    /** Error condition; attention required. */
    ERROR_STATE
}
