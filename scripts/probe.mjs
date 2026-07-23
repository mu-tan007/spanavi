import { spawn } from "node:child_process";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9335; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, "--disable-gpu", "--user-data-dir=C:\\Windows\\Temp\\dora-cdp3", "about:blank"]);
async function getWs() { for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error("no cdp"); }
const ws = new WebSocket(await getWs()); let id = 0; const pending = new Map(); const logs = [];
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled") logs.push("CONSOLE:" + (m.params.args || []).map((a) => a.value || a.description || "").join(" "));
  if (m.method === "Runtime.exceptionThrown") logs.push("EXCEPTION:" + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
};
const { targetId } = await new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: "Target.createTarget", params: { url: "about:blank" } })); });
const { sessionId } = await new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: "Target.attachToTarget", params: { targetId, flatten: true } })); });
const s = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, sessionId, method, params })); });
await s("Page.enable"); await s("Runtime.enable");
await s("Page.navigate", { url: process.argv[2] });
await sleep(8000);
const { result } = await s("Runtime.evaluate", { expression: "({path:location.pathname, txt:document.body.innerText.slice(0,400), root:document.getElementById('root')?.children.length})", returnByValue: true });
console.log("STATE:", JSON.stringify(result.value, null, 2));
console.log(logs.slice(0, 25).join("\n"));
edge.kill(); process.exit(0);
