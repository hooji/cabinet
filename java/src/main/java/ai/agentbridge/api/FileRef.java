package ai.agentbridge.api;

/**
 * A binary blob that the agent has pushed to the UI's in-memory file
 * registry. Messages reference it via {@code bridge://file/<id>}.
 *
 * <p>Files live in the UI cache for the lifetime of the page (cleared on
 * reload / tab close); there is no explicit eviction protocol — agents
 * just push files via {@link UI#onFileAvailable} when they're needed.
 *
 * <p>If the same {@code id} is pushed twice, the UI replaces the previous
 * entry. {@code data} is encoded as base64 on the wire (Jackson does this
 * automatically for {@code byte[]}).
 */
public record FileRef(
        String id,
        String mimeType,
        String name,
        byte[] data
) {
    /** Convenience: file with no display name. */
    public FileRef(String id, String mimeType, byte[] data) {
        this(id, mimeType, null, data);
    }
}
