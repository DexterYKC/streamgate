import express from "express";
import axios from "axios";
import { loadSubscribers, grantSubscriptionByUid } from "../subscribersStore.js";
import { decryptId, hashId } from "../../utils/crypto.mjs";
import { adminAuth } from "../adminAuth.js";

async function notifyUser(chatId, wasActive, expiry) {
  try {
    const date = new Date(expiry).toISOString().slice(0, 10);
    const text = wasActive
      ? `🔄 <b>Subscription extended!</b>\n\nYour premium access has been extended until <b>${date}</b>.\n\nEnjoy ✨`
      : `🎁 <b>Access granted!</b>\n\nYou've been given premium access until <b>${date}</b>.\n\nWelcome to StreamGate ✨`;

    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
      { chat_id: chatId, text, parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("Notify failed:", err.message);
  }
}

const router = express.Router();

router.get("/", adminAuth, async (req, res) => {
  const { subs } = await loadSubscribers();

  const users = subs.map(s => {
    let uid = s.uid || null;
    let partialId = "—";

    if (!uid && s.telegram_id) {
      uid = hashId(s.telegram_id);
      partialId = s.telegram_id.toString().slice(0, 5) + "…";
    } else if (s.tid) {
      try {
        const dec = decryptId(s.tid).toString();
        partialId = dec.slice(0, 5) + "…";
      } catch {}
    }

    return {
      uid:            uid || "unknown",
      partial_id:     partialId,
      plan:           s.plan || "—",
      expires_at:     s.expires_at || null,
      active:         s.expires_at ? new Date(s.expires_at) > new Date() : false,
      started_at:     s.started_at || null,
      referral_count: s.referral_count || 0
    };
  });

  res.json(users);
});

router.post("/:uid/grant", adminAuth, async (req, res) => {
  const { plan, days } = req.body;
  const uid = req.params.uid;

  if (!plan || !days) {
    return res.status(400).json({ success: false, error: "Missing plan or days" });
  }

  const result = await grantSubscriptionByUid(uid, plan, Number(days));
  if (!result) return res.status(404).json({ success: false, error: "User not found" });

  // Notify user on Telegram
  try {
    let chatId = null;
    if (result.tid) chatId = decryptId(result.tid);
    else if (result.telegram_id) chatId = result.telegram_id;
    if (chatId) notifyUser(chatId, result.wasActive, result.newExpiry);
  } catch {}

  res.json({ success: true });
});

export default router;
