package ai.agentbridge.shim;

import ai.agentbridge.api.AgentInfo;
import ai.agentbridge.api.AgentState;
import ai.agentbridge.api.AgentSystem;
import ai.agentbridge.api.FileRef;
import ai.agentbridge.api.GroupInfo;
import ai.agentbridge.api.MessageRecord;
import ai.agentbridge.api.MessageReplacement;
import ai.agentbridge.api.TargetKind;
import ai.agentbridge.api.UI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Stand-in agent system used until the real Java backend lands. Three ELIZA
 * personas live in a single group; sending a message flips the addressed
 * agent to ANSWERING and the reply is streamed (token-by-token via append).
 *
 * <p>Default reply emits a small {@code <details class="thinking">} preamble
 * before the streamed response. Send {@code /check} to instead see the
 * anchored-replace path: a checklist that ticks itself off over a few
 * seconds, exercising {@link UI#onMessageReplace}.
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

        String trimmed = text.trim().toLowerCase();
        switch (trimmed) {
            case "/check" -> runChecklistDemo(conversationId, agentId);
            case "/image" -> runImageDemo(conversationId, agentId);
            case "/pdf"   -> runPdfDemo(conversationId, agentId);
            case "/math"  -> runMathDemo(conversationId, agentId);
            default       -> streamReply(conversationId, agentId, text);
        }
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

    // ─── streaming reply ──────────────────────────────────────────────────

    private void streamReply(String conversationId, String agentId, String userText) {
        String reply = elizaRespond(agentId, userText);
        boolean withThinking = userText.length() > 15;
        String messageId = UUID.randomUUID().toString();
        AtomicReference<String> accumulated = new AtomicReference<>("");

        // Seed with an empty bubble — both for the UI and for the history
        // placeholder so getHistory always returns a consistent count.
        MessageRecord seed = new MessageRecord(messageId, conversationId, agentId, "");
        appendHistory(conversationId, seed);
        ui.onMessage(seed);

        long t = 0;
        if (withThinking) {
            t += 150;
            scheduleAppend(messageId, conversationId, agentId, accumulated,
                    "<details class=\"thinking\">\n<summary>Thinking</summary>\n\n", t);
            String[] lines = {
                    "Parsing the input…",
                    "Consulting the 1966 rule table…",
                    "Reflecting pronouns…",
            };
            for (String line : lines) {
                t += 250;
                scheduleAppend(messageId, conversationId, agentId, accumulated, line + "\n\n", t);
            }
            t += 250;
            scheduleAppend(messageId, conversationId, agentId, accumulated, "</details>\n\n", t);
        }

        String[] parts = reply.split(" ");
        for (int i = 0; i < parts.length; i++) {
            String chunk = (i == 0 ? "" : " ") + parts[i];
            t += 80;
            scheduleAppend(messageId, conversationId, agentId, accumulated, chunk, t);
        }

        long finalDelay = t + 50;
        scheduler.schedule(() -> {
            replaceInHistory(conversationId,
                    new MessageRecord(messageId, conversationId, agentId, accumulated.get()));
            ui.onStatusChange(agentId, AgentState.IDLE, null);
        }, finalDelay, TimeUnit.MILLISECONDS);
    }

    private void scheduleAppend(String messageId, String conversationId, String agentId,
                                AtomicReference<String> accumulated, String chunk, long delayMs) {
        scheduler.schedule(() -> {
            accumulated.updateAndGet(s -> s + chunk);
            ui.onMessageAppend(new MessageRecord(messageId, conversationId, agentId, chunk));
        }, delayMs, TimeUnit.MILLISECONDS);
    }

    // ─── anchored-replace demo (/check) ───────────────────────────────────

    private void runChecklistDemo(String conversationId, String agentId) {
        String messageId = UUID.randomUUID().toString();
        String body =
                "Sure — let's walk through a few steps:\n\n" +
                "- [ ] Step 1: parse the input\n" +
                "- [ ] Step 2: choose a response\n" +
                "- [ ] Step 3: deliver the answer\n";

        MessageRecord seed = new MessageRecord(messageId, conversationId, agentId, body);
        appendHistory(conversationId, seed);
        ui.onMessage(seed);

        // Anchors carry enough preceding context that each one is unambiguous
        // even after previous boxes have been checked.
        scheduleCheck(messageId, conversationId, "let's walk through a few steps:\n\n- ", "] Step 1",  700);
        scheduleCheck(messageId, conversationId, "Step 1: parse the input\n- ",           "] Step 2", 1400);
        scheduleCheck(messageId, conversationId, "Step 2: choose a response\n- ",         "] Step 3", 2100);

        scheduler.schedule(() -> {
            // Persist the fully-checked final body so getHistory matches.
            String checked = body
                    .replaceFirst("\\[ ] Step 1", "[x] Step 1")
                    .replaceFirst("\\[ ] Step 2", "[x] Step 2")
                    .replaceFirst("\\[ ] Step 3", "[x] Step 3");
            replaceInHistory(conversationId,
                    new MessageRecord(messageId, conversationId, agentId, checked));
            ui.onStatusChange(agentId, AgentState.IDLE, null);
        }, 2500, TimeUnit.MILLISECONDS);
    }

    private void scheduleCheck(String messageId, String conversationId,
                               String startAfter, String endBefore, long delayMs) {
        scheduler.schedule(() ->
                ui.onMessageReplace(new MessageReplacement(
                        messageId, conversationId, "[x", startAfter, endBefore)),
                delayMs, TimeUnit.MILLISECONDS);
    }

    // ─── file-viewer demos (/image, /pdf, /math) ──────────────────────────

    private void runImageDemo(String conversationId, String agentId) {
        try {
            String fileId = "eliza-demo-" + UUID.randomUUID() + ".png";
            byte[] png = renderDemoPng();
            ui.onFileAvailable(new FileRef(fileId, "image/png", "eliza-demo.png", png));

            String body = "Here's a Nord-themed PNG generated server-side and pushed via " +
                    "`onFileAvailable`:\n\n" +
                    "![ELIZA demo](bridge://file/" + fileId + ")";
            MessageRecord msg = new MessageRecord(
                    UUID.randomUUID().toString(), conversationId, agentId, body);
            appendHistory(conversationId, msg);
            ui.onMessage(msg);
        } catch (Exception e) {
            log.error("image demo failed", e);
            ui.onStatusChange(agentId, AgentState.ERROR_STATE, e.getMessage());
            return;
        }
        scheduler.schedule(
                () -> ui.onStatusChange(agentId, AgentState.IDLE, null),
                300, TimeUnit.MILLISECONDS);
    }

    private void runPdfDemo(String conversationId, String agentId) {
        try {
            String fileId = "eliza-demo-" + UUID.randomUUID() + ".pdf";
            byte[] pdf = renderDemoPdf();
            ui.onFileAvailable(new FileRef(fileId, "application/pdf", "eliza-demo.pdf", pdf));

            String body = "A tiny PDF generated and pushed via the file registry:\n\n" +
                    "<iframe src=\"bridge://file/" + fileId + "\" height=\"320\"></iframe>";
            MessageRecord msg = new MessageRecord(
                    UUID.randomUUID().toString(), conversationId, agentId, body);
            appendHistory(conversationId, msg);
            ui.onMessage(msg);
        } catch (Exception e) {
            log.error("pdf demo failed", e);
            ui.onStatusChange(agentId, AgentState.ERROR_STATE, e.getMessage());
            return;
        }
        scheduler.schedule(
                () -> ui.onStatusChange(agentId, AgentState.IDLE, null),
                300, TimeUnit.MILLISECONDS);
    }

    private void runMathDemo(String conversationId, String agentId) {
        String body =
                "A few classics. Inline: $E = mc^2$ and Euler's identity " +
                "$e^{i\\pi} + 1 = 0$.\n\n" +
                "Display:\n\n" +
                "$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$\n\n" +
                "$$\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$$";
        MessageRecord msg = new MessageRecord(
                UUID.randomUUID().toString(), conversationId, agentId, body);
        appendHistory(conversationId, msg);
        ui.onMessage(msg);
        scheduler.schedule(
                () -> ui.onStatusChange(agentId, AgentState.IDLE, null),
                300, TimeUnit.MILLISECONDS);
    }

    private byte[] renderDemoPng() throws IOException {
        int w = 480, h = 240;
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            // Nord background
            g.setColor(new Color(0x2e3440));
            g.fillRect(0, 0, w, h);
            // Accent stripe
            g.setColor(new Color(0x88c0d0));
            g.fillRect(0, h - 8, w, 8);
            // Title
            g.setColor(new Color(0xeceff4));
            g.setFont(new Font("SansSerif", Font.BOLD, 36));
            g.drawString("ELIZA", 30, 80);
            // Subtitle
            g.setColor(new Color(0xd08770));
            g.setFont(new Font("SansSerif", Font.PLAIN, 18));
            g.drawString("greetings from 1966", 30, 116);
            // Footer hash
            g.setColor(new Color(0x88c0d0));
            g.setFont(new Font("Monospaced", Font.PLAIN, 12));
            g.drawString("#bridge-file-demo", w - 150, h - 24);
        } finally {
            g.dispose();
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private byte[] renderDemoPdf() {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        List<Integer> offsets = new ArrayList<>();

        writeAscii(buf, "%PDF-1.4\n%âãÏÓ\n");
        offsets.add(buf.size());
        writeAscii(buf, "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
        offsets.add(buf.size());
        writeAscii(buf, "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
        offsets.add(buf.size());
        writeAscii(buf, "3 0 obj\n<< /Type /Page /Parent 2 0 R " +
                "/MediaBox [0 0 612 792] /Contents 4 0 R " +
                "/Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n");
        String content =
                "BT\n/F1 24 Tf\n72 720 Td (Hello from the ELIZA shim!) Tj\n" +
                "0 -36 Td /F1 14 Tf (This PDF was generated server-side) Tj\n" +
                "0 -20 Td (and shipped to the UI via onFileAvailable.) Tj\n" +
                "ET";
        offsets.add(buf.size());
        writeAscii(buf, "4 0 obj\n<< /Length " + content.length() + " >>\nstream\n"
                + content + "\nendstream\nendobj\n");
        offsets.add(buf.size());
        writeAscii(buf, "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

        int xrefAt = buf.size();
        writeAscii(buf, "xref\n0 6\n0000000000 65535 f \n");
        for (int off : offsets) {
            writeAscii(buf, String.format("%010d 00000 n \n", off));
        }
        writeAscii(buf, "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefAt + "\n%%EOF\n");
        return buf.toByteArray();
    }

    private static void writeAscii(ByteArrayOutputStream buf, String s) {
        byte[] bytes = s.getBytes(StandardCharsets.ISO_8859_1);
        buf.write(bytes, 0, bytes.length);
    }

    // ─── history bookkeeping ──────────────────────────────────────────────

    private void appendHistory(String conversationId, MessageRecord msg) {
        List<MessageRecord> list = history.get(conversationId);
        if (list != null) {
            synchronized (list) { list.add(msg); }
        }
    }

    private void replaceInHistory(String conversationId, MessageRecord updated) {
        List<MessageRecord> list = history.get(conversationId);
        if (list == null) return;
        synchronized (list) {
            for (int i = 0; i < list.size(); i++) {
                if (list.get(i).id().equals(updated.id())) {
                    list.set(i, updated);
                    return;
                }
            }
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
