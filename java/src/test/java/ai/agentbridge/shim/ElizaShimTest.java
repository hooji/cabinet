package ai.agentbridge.shim;

import ai.agentbridge.api.AgentInfo;
import ai.agentbridge.api.AgentState;
import ai.agentbridge.api.GroupSummary;
import ai.agentbridge.api.MessageRecord;
import ai.agentbridge.api.UI;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class ElizaShimTest {

    private RecordingUI ui;
    private ElizaShim shim;

    @BeforeEach
    void setUp() {
        ui = new RecordingUI();
        shim = new ElizaShim(ui);
    }

    @AfterEach
    void tearDown() {
        shim.close();
    }

    @Test
    void listsThreeAgentsInOneGroup() {
        assertEquals(3, shim.listAgents().size());
        assertEquals(1, shim.listGroups().size());
        assertEquals(3, shim.listGroups().get(0).agentIds().size());
    }

    @Test
    void respondsToMotherWithFollowup() {
        String reply = shim.elizaRespond("eliza-classic", "my mother always said no.");
        assertTrue(reply.toLowerCase().contains("mother"),
                "expected mother-focused response, got: " + reply);
    }

    @Test
    void reflectsIAmStatement() {
        String reply = shim.elizaRespond("eliza-classic", "I am tired");
        assertTrue(reply.toLowerCase().contains("tired"),
                "expected pronoun reflection, got: " + reply);
    }

    @Test
    void fallsBackOnUnrecognizedInput() {
        String reply = shim.elizaRespond("eliza-classic", "the quick brown fox");
        assertNotNull(reply);
        assertFalse(reply.isBlank());
    }

    @Test
    void sendMessageEmitsUserEchoThenAgentReply() throws Exception {
        ui.expectMessages(2);
        ui.expectStatusChanges(2);

        shim.sendMessage("conv-eliza-classic", "hello there");

        assertTrue(ui.messagesLatch.await(3, TimeUnit.SECONDS),
                "expected user echo + agent reply within 3s");
        assertTrue(ui.statusLatch.await(3, TimeUnit.SECONDS),
                "expected LIVE then IDLE transitions");

        assertEquals("user", ui.messages.get(0).from());
        assertEquals("eliza-classic", ui.messages.get(1).from());

        List<MessageRecord> history = shim.getHistory("conv-eliza-classic", 10, null);
        assertEquals(2, history.size());
    }

    @Test
    void historyRespectsBeforeId() {
        // Build history synthetically by sending two messages and waiting.
        shim.sendMessage("conv-eliza-classic", "one");
        shim.sendMessage("conv-eliza-classic", "two");
        try { Thread.sleep(2000); } catch (InterruptedException ignored) {}

        List<MessageRecord> all = shim.getHistory("conv-eliza-classic", 100, null);
        assertTrue(all.size() >= 4, "expected at least 4 entries, got " + all.size());

        String midId = all.get(2).id();
        List<MessageRecord> before = shim.getHistory("conv-eliza-classic", 100, midId);
        assertEquals(2, before.size());
    }

    // ─── Recording UI ────────────────────────────────────────────────────

    static class RecordingUI implements UI {
        final List<MessageRecord> messages = new ArrayList<>();
        final List<String> statusChanges = new ArrayList<>();
        CountDownLatch messagesLatch = new CountDownLatch(0);
        CountDownLatch statusLatch = new CountDownLatch(0);

        synchronized void expectMessages(int n) { messagesLatch = new CountDownLatch(n); }
        synchronized void expectStatusChanges(int n) { statusLatch = new CountDownLatch(n); }

        @Override public synchronized void onMessage(MessageRecord msg) {
            messages.add(msg);
            messagesLatch.countDown();
        }
        @Override public synchronized void onStatusChange(String agentId, AgentState state, String reason) {
            statusChanges.add(agentId + ":" + state);
            statusLatch.countDown();
        }
        @Override public void onInputNeeded(String conversationId, String agentId, String prompt) {}
        @Override public void onAgentAdded(AgentInfo agent) {}
        @Override public void onAgentRemoved(String agentId) {}
        @Override public void onGroupUpdate(String groupId, GroupSummary summary) {}
    }
}
