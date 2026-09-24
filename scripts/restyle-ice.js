const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "frontend", "src");

const map = [
  ["#0f0f11", "#07070b"],
  ["#09090b", "rgba(9, 9, 11, 0.72)"],
  ["#18181b", "rgba(18, 20, 32, 0.55)"],
  ["#27272a", "rgba(148, 163, 184, 0.14)"],
  ["#3f3f46", "rgba(148, 163, 184, 0.22)"],
  ["#52525b", "#475569"],
  ["#71717a", "#64748b"],
  ["#a1a1aa", "#94a3b8"],
  ["#e4e4e7", "#e2e8f0"],
  ["#fafafa", "#f8fafc"],
  ["#2563eb", "#818cf8"],
  ["#1e3a5f", "rgba(30, 58, 95, 0.65)"],
  ["#3b82f6", "#38bdf8"],
  ["#93c5fd", "#7dd3fc"],
  ["#60a5fa", "#7dd3fc"],
];

const skip = new Set([
  "theme.js",
  "actors.js",
  "icpLedger.js",
  "candidUtils.js",
  "theme.css",
]);

function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (f === "declarations") continue;
      walk(p);
    } else if ((f.endsWith(".jsx") || f.endsWith(".js")) && !skip.has(f)) {
      let s = fs.readFileSync(p, "utf8");
      const orig = s;
      for (const [a, b] of map) {
        s = s.split(a).join(b);
      }
      if (s !== orig) {
        fs.writeFileSync(p, s);
        console.log("updated", path.relative(dir, p));
      }
    }
  }
}

walk(dir);
console.log("done");
