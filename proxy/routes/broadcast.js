// proxy/routes/broadcast.js
import express from "express";
import axios from "axios";
import { adminAuth } from "../adminAuth.js";
import { loadSubscribers } from "../subscribersStore.js";
import { decryptId } from "../../utils/crypto.mjs";

const router = express.Router();
router.use(adminAuth);

function getChatId(sub) {
  try {
    return sub.tid ? decryptId(sub.tid) : Number(sub.telegram_id);
  } catch {
    return Number(sub.telegram_id) || null;
  }
}

// POST /broadcast/send
// Body: { text, imageUrl?, audience: "all"|"active"|"inactive", buttonText?, buttonUrl?, buttonCallback? }
router.post("/send", async (req, res) => {
  const { text, imageUrl, audience = "all", buttonText, buttonUrl, buttonCallback } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Message text is required" });
  }

  const token = process.env.TELEGRAM_TOKEN;
  const { subs } = await loadSubscribers();
  const now = new Date();

  let targets;
  if (audience === "active") {
    targets = subs.filter(s => s.expires_at && new Date(s.expires_at) > now);
  } else if (audience === "inactive") {
    targets = subs.filter(s => !s.expires_at || new Date(s.expires_at) <= now);
  } else {
    targets = subs;
  }

  let replyMarkup;
  if (buttonText && (buttonUrl || buttonCallback)) {
    const btn = buttonUrl
      ? { text: buttonText, url: buttonUrl }
      : { text: buttonText, callback_data: buttonCallback };
    replyMarkup = JSON.stringify({ inline_keyboard: [[btn]] });
  }

  let sent = 0;
  let failed = 0;

  for (const sub of targets) {
    const chatId = getChatId(sub);
    if (!chatId) continue;

    try {
      if (imageUrl) {
        await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, {
          chat_id: chatId,
          photo: imageUrl,
          caption: text,
          parse_mode: "HTML",
          ...(replyMarkup && { reply_markup: replyMarkup })
        });
      } else {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          ...(replyMarkup && { reply_markup: replyMarkup })
        });
      }
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch {
      failed++;
    }
  }

  res.json({ ok: true, sent, failed, total: targets.length });
});

export default router;
