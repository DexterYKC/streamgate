// proxy/expireSubscriptions.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBS_FILE = path.join(__dirname, "../bot/subscribers.json");

if (!fs.existsSync(SUBS_FILE)) {
  console.log("No subscribers.json, nothing to do.");
  process.exit(0);
}

const raw = fs.readFileSync(SUBS_FILE, "utf8").trim() || "[]";
const subs = JSON.parse(raw);

const now = new Date();
let changed = 0;

for (const s of subs) {
  if (!s.expires_at) continue;
  const exp = new Date(s.expires_at);
  if (exp < now && s.active) {
    s.active = false;
    changed++;
  }
}

if (changed > 0) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

console.log(`Expired ${changed} subscriptions at ${now.toISOString()}`);
