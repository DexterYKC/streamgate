// proxy/routes/bots.js
import express from "express";
import axios from "axios";
import { adminAuth } from "../adminAuth.js";
import { loadSubscribers } from "../subscribersStore.js";
import { decryptId } from "../../utils/crypto.mjs";

const router = express.Router();
router.use(adminAuth);

// GET /bots — list all configured bots
router.get("/", (req, res) => {
  const bots = [];

  // Primary bot
  if (process.env.TELEGRAM_TOKEN) {
    bots.push({
      index: 1,
      username: process.env.BOT_USERNAME || "Bot1",
      webhookPath: "/telegram-webhook",
      primary: true
    });
  }

  // Backup bots
  for (let i = 2; i <= 10; i++) {
    const token = process.env[`TELEGRAM_TOKEN_${i}`];
    if (!token) break;
    bots.push({
      index: i,
      username: process.env[`BOT_USERNAME_${i}`] || `BackupBot${i}`,
      webhookPath: `/telegram-webhook-${i}`,
      primary: false
    });
  }

  res.json(bots);
});

// POST /bots/broadcast-migration
// Body: { fromIndex: 1, toIndex: 2 }
// Sends a migration message from bot `fromIndex` to all active subscribers
router.post("/broadcast-migration", async (req, res) => {
  const { fromIndex, toIndex } = req.body;

  const fromToken = fromIndex === 1
    ? process.env.TELEGRAM_TOKEN
    : process.env[`TELEGRAM_TOKEN_${fromIndex}`];

  const toUsername = toIndex === 1
    ? process.env.BOT_USERNAME
    : process.env[`BOT_USERNAME_${toIndex}`];

  if (!fromToken) return res.status(400).json({ error: `No token configured for bot ${fromIndex}` });
  if (!toUsername) return res.status(400).json({ error: `No username configured for bot ${toIndex}` });

  const { subs } = await loadSubscribers();
  const now = new Date();
  const active = subs.filter(s => s.expires_at && new Date(s.expires_at) > now);

  let sent = 0;
  let failed = 0;

  for (const sub of active) {
    let chatId;
    try {
      chatId = sub.tid ? decryptId(sub.tid) : Number(sub.telegram_id);
    } catch {
      chatId = Number(sub.telegram_id);
    }
    if (!chatId) continue;

    try {
      await axios.post(`https://api.telegram.org/bot${fromToken}/sendMessage`, {
        chat_id: chatId,
        text:
          `⚠️ <b>Important Notice</b>\n\n` +
          `Our bot has moved to a new address.\n\n` +
          `👉 Please continue using:\n<b>@${toUsername}</b>\n\n` +
          `Your subscription is <b>fully active</b> and transfers automatically. 🔐`,
        parse_mode: "HTML",
        reply_markup: JSON.stringify({
          inline_keyboard: [[
            { text: "🚀 Open New Bot", url: `https://t.me/${toUsername}` }
          ]]
        })
      });
      sent++;
      // Small delay to avoid Telegram rate limits
      await new Promise(r => setTimeout(r, 50));
    } catch {
      failed++;
    }
  }

  res.json({ ok: true, sent, failed, total: active.length });
});

export default router;
