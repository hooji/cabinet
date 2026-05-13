package ai.agentbridge.shim;

import ai.agentbridge.api.AgentInfo;
import ai.agentbridge.api.AgentState;
import ai.agentbridge.api.AgentSystem;
import ai.agentbridge.api.GroupInfo;
import ai.agentbridge.api.MessageRecord;
import ai.agentbridge.api.TargetKind;
import ai.agentbridge.api.UI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Stand-in agent system used until the real Java backend lands. Three ELIZA
 * personas live in a single group; sending a message flips the addressed
 * agent to LIVE for a moment and emits a response.
 */
public class ElizaShim implements AgentSystem, AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(ElizaShim.class);

    private final UI ui;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

    private final List<AgentInfo> agents;
    private final List<GroupInfo> groups;
    private final ConcurrentMap<String, String> agentByConversation = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, List<MessageRecord>> history = new ConcurrentHashMap<>();

    public ElizaShim(UI ui) {
        this.ui = ui;
        AgentInfo classic = new AgentInfo("eliza-classic", "Eliza (Classic)",
                "conv-eliza-classic", "therapy-room", AgentState.IDLE,
                "1966 vintage. Will reflect your statements back as questions.");
        AgentInfo modern = new AgentInfo("eliza-modern", "Eliza (Modern)",
                "conv-eliza-modern", "therapy-room", AgentState.IDLE,
                "Same script, gentler tone.");
        AgentInfo snarky = new AgentInfo("eliza-snarky", "Eliza (Snarky)",
                "conv-eliza-snarky", "therapy-room", AgentState.IDLE,
                "Therapy by way of mild contempt.");
        this.agents = List.of(classic, modern, snarky);
        this.groups = List.of(new GroupInfo("therapy-room", "Therapy Room",
                List.of(classic.id(), modern.id(), snarky.id())));
        for (AgentInfo a : agents) {
            agentByConversation.put(a.conversationId(), a.id());
            history.put(a.conversationId(), new ArrayList<>());
        }
    }

    @Override
    public List<AgentInfo> listAgents() {
        return agents;
    }

    @Override
    public List<GroupInfo> listGroups() {
        return groups;
    }

    @Override
    public List<MessageRecord> getHistory(String conversationId, int limit, String beforeId) {
        List<MessageRecord> all = history.get(conversationId);
        if (all == null) return List.of();
        synchronized (all) {
            int end = all.size();
            if (beforeId != null) {
                for (int i = 0; i < all.size(); i++) {
                    if (all.get(i).id().equals(beforeId)) {
                        end = i;
                        break;
                    }
                }
            }
            int start = Math.max(0, end - Math.max(0, limit));
            return new ArrayList<>(all.subList(start, end));
        }
    }

    @Override
    public void sendMessage(String conversationId, String text) {
        String agentId = agentByConversation.get(conversationId);
        if (agentId == null) {
            log.warn("sendMessage to unknown conversation {}", conversationId);
            return;
        }
        MessageRecord userMsg = new MessageRecord(
                UUID.randomUUID().toString(), conversationId, "user", text);
        appendHistory(conversationId, userMsg);
        ui.onMessage(userMsg);
        ui.onStatusChange(agentId, AgentState.ANSWERING, "composing reply");

        scheduler.schedule(() -> {
            try {
                String reply = elizaRespond(agentId, text);
                MessageRecord agentMsg = new MessageRecord(
                        UUID.randomUUID().toString(), conversationId, agentId, reply);
                appendHistory(conversationId, agentMsg);
                ui.onMessage(agentMsg);
                ui.onStatusChange(agentId, AgentState.IDLE, null);
            } catch (Exception e) {
                log.error("eliza response failed", e);
                ui.onStatusChange(agentId, AgentState.ERROR_STATE, "error: " + e.getMessage());
            }
        }, 800, TimeUnit.MILLISECONDS);
    }

    @Override
    public void sendDirective(String targetId, TargetKind kind, String cmd, Map<String, Object> args) {
        log.info("directive {} {} -> {} (args={})", kind, targetId, cmd, args);
        if (kind == TargetKind.AGENT) {
            switch (cmd) {
                case "pause"  -> ui.onStatusChange(targetId, AgentState.PAUSED, "user request");
                case "resume" -> ui.onStatusChange(targetId, AgentState.IDLE, "user request");
                case "wake"   -> ui.onStatusChange(targetId, AgentState.WORKING, "user request");
                default -> log.warn("unknown directive: {}", cmd);
            }
        }
    }

    @Override
    public void close() {
        scheduler.shutdownNow();
    }

    private void appendHistory(String conversationId, MessageRecord msg) {
        List<MessageRecord> list = history.get(conversationId);
        if (list != null) {
            synchronized (list) { list.add(msg); }
        }
    }

    // ─── ELIZA response logic ─────────────────────────────────────────────

    private record Rule(Pattern pattern, List<String> templates) {}

    private static final List<Rule> RULES = List.of(
            new Rule(Pattern.compile("\\bi am (.+?)[.!?]?$", Pattern.CASE_INSENSITIVE),
                    List.of("How long have you been {1}?", "Why do you say you are {1}?")),
            new Rule(Pattern.compile("\\bi feel (.+?)[.!?]?$", Pattern.CASE_INSENSITIVE),
                    List.of("Do you often feel {1}?", "Tell me more about feeling {1}.")),
            new Rule(Pattern.compile("\\bi (?:want|need) (.+?)[.!?]?$", Pattern.CASE_INSENSITIVE),
                    List.of("What would it mean to you if you got {1}?", "Why do you need {1}?")),
            new Rule(Pattern.compile("\\bmother\\b", Pattern.CASE_INSENSITIVE),
                    List.of("Tell me more about your mother.", "How do you feel about your mother?")),
            new Rule(Pattern.compile("\\bfather\\b", Pattern.CASE_INSENSITIVE),
                    List.of("How does your father make you feel?", "What about your father?")),
            new Rule(Pattern.compile("\\b(?:sad|unhappy|depressed)\\b", Pattern.CASE_INSENSITIVE),
                    List.of("I am sorry to hear that.", "How long have you felt that way?")),
            new Rule(Pattern.compile("\\b(?:yes|yeah|yep)\\b", Pattern.CASE_INSENSITIVE),
                    List.of("You seem certain.", "I see.")),
            new Rule(Pattern.compile("\\b(?:no|nope)\\b", Pattern.CASE_INSENSITIVE),
                    List.of("Why not?", "Are you sure?")),
            new Rule(Pattern.compile("\\?\\s*$"),
                    List.of("What do you think?", "Why do you ask?"))
    );

    private static final List<String> FALLBACKS = List.of(
            "Please go on.", "Tell me more.", "I see.", "Can you elaborate on that?"
    );

    private static final List<String> SNARKY_OVERRIDES = List.of(
            "Mm. And how do you feel about that, exactly?",
            "Fascinating. Really.",
            "Sure. Let's go with that."
    );

    String elizaRespond(String agentId, String input) {
        String normalized = input.trim();
        for (Rule rule : RULES) {
            Matcher m = rule.pattern.matcher(normalized);
            if (m.find()) {
                String template = rule.templates.get(Math.floorMod(input.hashCode(), rule.templates.size()));
                String filled = template;
                for (int i = 1; i <= m.groupCount(); i++) {
                    filled = filled.replace("{" + i + "}", reflect(m.group(i)));
                }
                return maybeSnark(agentId, filled);
            }
        }
        return maybeSnark(agentId, FALLBACKS.get(Math.floorMod(input.hashCode(), FALLBACKS.size())));
    }

    private static String maybeSnark(String agentId, String base) {
        if (!"eliza-snarky".equals(agentId)) return base;
        // 1-in-3 chance the snarky variant overrides with a sassier line.
        if (Math.floorMod(base.hashCode(), 3) == 0) {
            return SNARKY_OVERRIDES.get(Math.floorMod(base.hashCode(), SNARKY_OVERRIDES.size()));
        }
        return base;
    }

    /** Swap first/second person pronouns so the reflected fragment reads naturally. */
    private static String reflect(String fragment) {
        return fragment
                .replaceAll("\\bI am\\b", "you are")
                .replaceAll("\\bi am\\b", "you are")
                .replaceAll("\\bmy\\b", "your")
                .replaceAll("\\bme\\b", "you")
                .replaceAll("\\bI\\b", "you")
                .replaceAll("\\byou are\\b", "I am")
                .replaceAll("\\byour\\b", "my")
                .replaceAll("\\byou\\b", "me");
    }
}
