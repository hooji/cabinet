package ai.agentbridge.api;

/**
 * Payload for {@link UI#onMessageReplace}. Identifies the target message
 * by {@code id} (within {@code conversationId}) and describes how to splice
 * the new {@code text} into the existing body.
 *
 * <p>The two anchors are <em>optional</em> and combine like so:
 *
 * <ul>
 *   <li>{@code startReplaceAfter} = {@code null}, {@code endReplaceBefore} = {@code null}
 *       — full body replacement.</li>
 *   <li>{@code startReplaceAfter} non-null — find the first occurrence of that
 *       string in the existing body; keep everything up to and including it
 *       as a prefix.</li>
 *   <li>{@code endReplaceBefore} non-null — find the first occurrence at or
 *       after the prefix; keep that string and everything after it as a
 *       suffix.</li>
 * </ul>
 *
 * <p>The new {@code text} is spliced between the kept prefix and kept suffix.
 * If either anchor is specified but not found in the existing body (when
 * searched in the appropriate range), the UI discards the update.
 *
 * <p>This lets a streaming agent rewrite a small region of a long message
 * (e.g. toggling a single {@code [ ]} to {@code [x]} in a checklist)
 * without resending the whole body.
 */
public record MessageReplacement(
        String id,
        String conversationId,
        String text,
        String startReplaceAfter,
        String endReplaceBefore
) {
    /** Full-body replacement convenience. */
    public MessageReplacement(String id, String conversationId, String text) {
        this(id, conversationId, text, null, null);
    }
}
