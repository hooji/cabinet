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

    /**
     * Append a delta to an existing message identified by {@code msg.id()}.
     * If no message with that id exists in the conversation yet, the UI
     * auto-creates it using {@code msg} as the seed — letting agents skip
     * a priming {@link #onMessage} call and stream from the first token.
     */
    void onMessageAppend(MessageRecord msg);

    /**
     * Replace some or all of an existing message body. See
     * {@link MessageReplacement} for the anchor semantics. If the anchors
     * fail to match, the UI discards the update silently.
     */
    void onMessageReplace(MessageReplacement replacement);

    void onStatusChange(String agentId, AgentState state, String reason);

    void onInputNeeded(String conversationId, String agentId, String prompt);

    void onAgentAdded(AgentInfo agent);

    void onAgentRemoved(String agentId);

    void onGroupUpdate(String groupId, GroupSummary summary);

    /**
     * Push a binary file into the UI's in-memory file registry. After this
     * fires, messages can reference the file via {@code bridge://file/<id>}
     * (e.g. {@code ![alt](bridge://file/foo.png)} or
     * {@code <iframe src="bridge://file/doc.pdf"></iframe>}). Files persist
     * for the lifetime of the page.
     *
     * <p>It is safe to call this method <em>before returning</em> from a
     * synchronous request handler such as
     * {@link AgentSystem#getHistory}: WebSocket frame ordering guarantees
     * that the notifications reach the UI before the request response,
     * so files are cached by the time messages reference them.
     */
    void onFileAvailable(FileRef file);
}
