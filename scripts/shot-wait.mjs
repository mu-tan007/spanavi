// CDP screenshot that POLLS for a selector before capturing (SPA-safe).
// Usage: node scripts/shot-wait.mjs <url> <outPath> <waitSelector> [width] [height]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const URL = process.argv[2];
const OUT = process.argv[3] || "shot.png";
const SEL = process.argv[4] || "body";
const W = Number(process.argv[5] || 1440);
const H = Number(process.argv[6] || 1000);
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--disable-gpu",
  "--hide-scrollbars", `--window-size=${W},${H}`,
  "--user-data-dir=C:\\Windows\\Temp\\dora-cdp2", "about:blank",
]);

async function getWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("CDP not up");
}

const ws = new WebSocket(await getWs());
let id = 0; const pending = new Map();
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};
const { targetId } = await new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: "Target.createTarget", params: { url: "about:blank" } })); });
const { sessionId } = await new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: "Target.attachToTarget", params: { targetId, flatten: true } })); });
const ssend = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, sessionId, method, params })); });

await ssend("Page.enable");
await ssend("Runtime.enable");
await ssend("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await ssend("Page.navigate", { url: URL });

// poll for selector up to 30s
let found = false;
for (let i = 0; i < 120; i++) {
  const { result } = await ssend("Runtime.evaluate", {
    expression: `!!document.querySelector(${JSON.stringify(SEL)})`, returnByValue: true,
  });
  if (result?.value) { found = true; break; }
  await sleep(250);
}
await sleep(800); // settle
const { data } = await ssend("Page.captureScreenshot", { format: "png" });
writeFileSync(OUT, Buffer.from(data, "base64"));
console.log(found ? "saved (selector found)" : "saved (selector NOT found - timeout)", OUT);
edge.kill();
process.exit(0);
