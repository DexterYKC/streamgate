import axios from "axios";
import { loadSubscribers } from "./subscribersStore.js";
import { decryptId } from "../utils/crypto.mjs";

export async function broadcastNewVideo(video) {
  const token = process.env.TELEGRAM_TOKEN;
  const { subs } = await loadSubscribers();
  const now = new Date();
  const active = subs.filter(s => s.expires_at && new Date(s.expires_at) > now);

  let sent = 0;
  for (const sub of active) {
    let chatId;
    try {
      chatId = sub.tid ? decryptId(sub.tid) : Number(sub.telegram_id);
    } catch {
      chatId = Number(sub.telegram_id);
    }
    if (!chatId) continue;

    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, {
        chat_id: chatId,
        photo: `https://gateway.pinata.cloud/ipfs/${video.image}`,
        caption:
          `🔥 <b>New Drop!</b>\n\n` +
          `<b>${video.title}</b>` +
          (video.description ? `\n${video.description}` : "") +
          `\n\nTap below to watch now 👇`,
        parse_mode: "HTML",
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [{ text: "▶ Watch Now", callback_data: `vid:${video.id}` }]
          ]
        })
      });
      sent++;
    } catch {
      // user may have blocked the bot — skip silently
    }
  }

  console.log(`📢 Broadcast: ${sent}/${active.length} subscribers notified`);
  return sent;
}

export async function broadcastVipDrop(video) {
  const token = process.env.TELEGRAM_TOKEN;
  const { subs } = await loadSubscribers();
  const now = new Date();
  const targets = subs.filter(
    s => s.plan === "month" && s.expires_at && new Date(s.expires_at) > now
  );

  let sent = 0;
  for (const sub of targets) {
    let chatId;
    try {
      chatId = sub.tid ? decryptId(sub.tid) : Number(sub.telegram_id);
    } catch {
      chatId = Number(sub.telegram_id);
    }
    if (!chatId) continue;

    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, {
        chat_id: chatId,
        photo: `https://gateway.pinata.cloud/ipfs/${video.image}`,
        caption:
          `👑 <b>New VIP Exclusive Drop!</b>\n\n` +
          `<b>${video.title}</b>` +
          (video.description ? `\n${video.description}` : "") +
          `\n\n🔒 Reserved for monthly subscribers — disappears in 30 days. Don't miss it 👇`,
        parse_mode: "HTML",
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [{ text: "👑 Watch VIP Drop", callback_data: `vid:${video.id}` }]
          ]
        })
      });
      sent++;
    } catch {
      // user may have blocked the bot — skip silently
    }
  }

  console.log(`👑 VIP Broadcast: ${sent}/${targets.length} monthly subscribers notified`);
  return sent;
}
