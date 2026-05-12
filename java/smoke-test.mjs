// End-to-end smoke test for the Java bridge.
// Verifies:
//   1. listAgents → three eliza agents
//   2. listGroups → one therapy-room group
//   3. sendMessage → onMessage(user) + onStatusChange(LIVE) + onMessage(agent) + onStatusChange(IDLE)
//
// Node 22+ has WebSocket built in.

const URL = process.env.URL || "ws://localhost:9876";
const TIMEOUT_MS = 5000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)),
  ]);
}

const ws = new WebSocket(URL);
const pending = new Map();
const notifications = [];
let notificationWaiter = null;

ws.addEventListener("message", (e) => {
  const frame = JSON.parse(e.data);
  if (frame.id !== undefined && frame.id !== null) {
    const p = pending.get(frame.id);
    if (p) { pending.delete(frame.id); p.resolve(frame); }
  } else {
    notifications.push(frame);
    if (notificationWaiter) notificationWaiter();
  }
});
ws.addEventListener("error", (e) => console.error("ws error:", e.message ?? e));

let nextId = 1;
function call(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

function waitForNotifications(count) {
  return new Promise((resolve) => {
    const check = () => {
      if (notifications.length >= count) {
        notificationWaiter = null;
        resolve();
      }
    };
    notificationWaiter = check;
    check();
  });
}

await withTimeout(new Promise((r) => ws.addEventListener("open", r, { once: true })), TIMEOUT_MS, "ws open");
console.log("connected");

const agents = await withTimeout(call("listAgents"), TIMEOUT_MS, "listAgents");
console.log(`listAgents → ${agents.result.length} agents: ${agents.result.map(a => a.id).join(", ")}`);
if (agents.result.length !== 3) throw new Error("expected 3 agents");

const groups = await withTimeout(call("listGroups"), TIMEOUT_MS, "listGroups");
console.log(`listGroups → ${groups.result.length} groups: ${groups.result.map(g => g.id).join(", ")}`);
if (groups.result.length !== 1) throw new Error("expected 1 group");

const sendAck = await withTimeout(
  call("sendMessage", { conversationId: "conv-eliza-classic", text: "I am tired today." }),
  TIMEOUT_MS,
  "sendMessage",
);
console.log(`sendMessage → "${sendAck.result}"`);

await withTimeout(waitForNotifications(4), TIMEOUT_MS, "expected 4 notifications");

console.log("notifications received:");
for (const n of notifications) {
  let detail = "";
  if (n.method === "onMessage") detail = ` from=${n.params.msg.from} text=${JSON.stringify(n.params.msg.text)}`;
  else if (n.method === "onStatusChange") detail = ` agent=${n.params.agentId} state=${n.params.state}`;
  console.log(`  - ${n.method}${detail}`);
}

const messages = notifications.filter(n => n.method === "onMessage");
const statuses = notifications.filter(n => n.method === "onStatusChange");
if (messages.length < 2) throw new Error(`expected ≥2 onMessage, got ${messages.length}`);
if (statuses.length < 2) throw new Error(`expected ≥2 onStatusChange, got ${statuses.length}`);
if (messages[0].params.msg.from !== "user") throw new Error("first message should be user echo");
if (messages[1].params.msg.from !== "eliza-classic") throw new Error("second message should be agent reply");

console.log("\n✓ smoke test passed");
ws.close();
