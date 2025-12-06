// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import "dotenv/config";
import fs from "fs";

// Routers
import { createBot } from "./bot/bot.js";
import proxy from "./proxy/index.js";
import videosRouter from "./proxy/routes/videos.js";
import paymentsRouter from "./proxy/routes/payments.js";
import accessRouter from "./proxy/routes/access.js";
import generateRouter from "./proxy/routes/generate.js";
import analyticsRouter from "./proxy/routes/analytics.js";
import categoriesRouter from "./proxy/routes/categories.js";
import usersRouter from "./proxy/routes/users.js";
import botsRouter from "./proxy/routes/bots.js";
import broadcastRouter from "./proxy/routes/broadcast.js";
import adminLoginRouter from "./proxy/routes/adminLogin.js";
import { sendEncryptedBackup } from "./proxy/backupService.js";
import streamRoute from "./proxy/routes/stream.js";
import { restoreCategoriesFromIPFS } from "./proxy/categoriesStore.js";


// -------------------------------------------------------
//  PATH FIX (ESM)
// -------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------------------------------
//  RESTORE VIDEOS CATALOG FROM PINATA
// -------------------------------------------------------
async function restoreCatalog() {
  try {
    const res = await axios.get(
      "https://api.pinata.cloud/data/pinList",
      {
        params: { status: "pinned", pageLimit: 100, pageOffset: 0 },
        headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` }
      }
    );

    const rows = (res.data.rows || []).filter(
      r => r.metadata && r.metadata.name === "StreamGateCatalog"
    );

    if (!rows.length) { console.log("⚠️ No StreamGateCatalog found on Pinata"); return; }

    rows.sort((a, b) =>
      new Date(b.date_pinned || b.date_queued) - new Date(a.date_pinned || a.date_queued)
    );

    const cid = rows[0].ipfs_pin_hash || rows[0].IpfsHash;
    const jsonRes = await axios.get(`https://gateway.pinata.cloud/ipfs/${cid}`);

    fs.writeFileSync(
      path.join(__dirname, "bot/videos.json"),
      JSON.stringify(jsonRes.data, null, 2)
    );

    console.log("📦 Catalog restored from IPFS:", cid);
  } catch (err) {
    console.log("❌ Catalog restore failed:", err.message);
  }
}

// Simple in-memory dedupe cache (shared across all bots)
const processedUpdates = new Set();

const app = express();

// -------------------------------------------------------
// 0️⃣ NOWPAYMENTS IPN — RAW BODY
// -------------------------------------------------------
app.post(
  "/payments/nowpayments-ipn",
  express.raw({ type: "*/*" }),
  (req, res, next) => {
    try { req.rawBody = req.body.toString("utf8"); } catch { req.rawBody = ""; }
    next();
  }
);

// -------------------------------------------------------
// 1️⃣ JSON & FORM
// -------------------------------------------------------
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));

// -------------------------------------------------------
// 2️⃣ RESTORE FROM IPFS (VIDEOS + CATEGORIES)
// -------------------------------------------------------
await restoreCatalog();
await restoreCategoriesFromIPFS();

// -------------------------------------------------------
// 3️⃣ MULTI-BOT WEBHOOK SETUP
// -------------------------------------------------------
const BASE_URL = process.env.BASE_URL;

// Build list of all configured bots
// Primary: TELEGRAM_TOKEN + BOT_USERNAME
// Backups: TELEGRAM_TOKEN_2 + BOT_USERNAME_2, TELEGRAM_TOKEN_3 + BOT_USERNAME_3, ...
const botConfigs = [];

if (process.env.TELEGRAM_TOKEN) {
  botConfigs.push({
    token: process.env.TELEGRAM_TOKEN,
    username: process.env.BOT_USERNAME || "StreamGateBot",
    webhookPath: "/telegram-webhook"
  });
}

for (let i = 2; i <= 10; i++) {
  const token = process.env[`TELEGRAM_TOKEN_${i}`];
  if (!token) break;
  botConfigs.push({
    token,
    username: process.env[`BOT_USERNAME_${i}`] || `BackupBot${i}`,
    webhookPath: `/telegram-webhook-${i}`
  });
}

// Create Telegraf instances and register webhooks
for (const cfg of botConfigs) {
  const botInstance = createBot(cfg.token, cfg.username);

  // Register webhook route
  app.post(cfg.webhookPath, (req, res) => {
    try {
      const update = req.body;
      const updateId = update.update_id;

      if (processedUpdates.has(updateId)) return res.sendStatus(200);
      processedUpdates.add(updateId);
      if (processedUpdates.size > 5000) processedUpdates.clear();

      botInstance.handleUpdate(update, res);
    } catch (err) {
      console.error(`❌ Webhook error [${cfg.username}]:`, err.message);
      res.sendStatus(500);
    }
  });

  // Set webhook with Telegram
  const webhookUrl = `${BASE_URL}${cfg.webhookPath}`;
  try {
    const r = await axios.get(`https://api.telegram.org/bot${cfg.token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    console.log(`✅ Webhook set [${cfg.username}]:`, r.data.description || "ok");
  } catch (err) {
    console.error(`❌ Webhook error [${cfg.username}]:`, err.message);
  }
}

if (!botConfigs.length) {
  console.warn("⚠️ No TELEGRAM_TOKEN configured — bot disabled");
}

// -------------------------------------------------------
// 4️⃣ ENCRYPTED SUBSCRIBERS BACKUP → ADMIN TELEGRAM
// (expiry reminders are handled by the check-subscribers GitHub Action,
// which keeps working even if this server is down)
// -------------------------------------------------------
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day
sendEncryptedBackup().catch((err) => console.error("Backup error:", err.message));
setInterval(() => {
  sendEncryptedBackup().catch((err) => console.error("Backup error:", err.message));
}, BACKUP_INTERVAL_MS);

// -------------------------------------------------------
// 5️⃣ API ROUTES
// -------------------------------------------------------
app.use("/categories", categoriesRouter);
app.use("/videos", videosRouter);
app.use("/payments", paymentsRouter);
app.use("/stream", streamRoute);
app.use("/analytics", analyticsRouter);
app.use("/users", usersRouter);
app.use("/bots", botsRouter);
app.use("/broadcast", broadcastRouter);
app.use("/admin-auth", adminLoginRouter);

// -------------------------------------------------------
// 6️⃣ ACCESS TOKEN SYSTEM
// -------------------------------------------------------
app.use("/", accessRouter);
app.use("/", generateRouter);

// -------------------------------------------------------
// 7️⃣ STATIC PLAYER
// -------------------------------------------------------
app.use("/player", express.static(path.join(__dirname, "public/player")));

// -------------------------------------------------------
// 8️⃣ ADMIN PANEL
// -------------------------------------------------------
app.use("/admin", express.static(path.join(__dirname, "admin-panel")));

// -------------------------------------------------------
// 9️⃣ PROXY GLOBAL
// -------------------------------------------------------
app.use("/", proxy);

// -------------------------------------------------------
// 🔟 KEEP ALIVE
// -------------------------------------------------------
app.get("/keep-alive", (req, res) => res.send("OK"));

// -------------------------------------------------------
// 🚀 START SERVER
// -------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur ${BASE_URL}`);
  console.log(`🤖 ${botConfigs.length} bot(s) actif(s): ${botConfigs.map(b => b.username).join(", ")}`);
});
