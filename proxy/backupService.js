import axios from "axios";
import FormData from "form-data";
import { loadSubscribers } from "./subscribersStore.js";
import { encryptText } from "../utils/crypto.mjs";

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;

// Sends an AES-256 encrypted snapshot of subscribers.json straight to the
// admin's Telegram chat — decryptable only with ID_SALT (see utils/crypto.mjs).
export async function sendEncryptedBackup() {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token || !ADMIN_CHAT_ID) return false;

  const { subs, sha } = await loadSubscribers();
  if (!sha) return false;

  const encrypted = encryptText(JSON.stringify(subs, null, 2));

  const form = new FormData();
  form.append("chat_id", ADMIN_CHAT_ID);
  form.append(
    "caption",
    `🔐 <b>Encrypted backup</b>\n${subs.length} entries — ${new Date().toISOString().slice(0, 10)}\n\n` +
    `Decrypt with ID_SALT using decryptText() from utils/crypto.mjs`
  );
  form.append("parse_mode", "HTML");
  form.append("document", Buffer.from(encrypted, "utf8"), {
    filename: `subscribers_backup_${Date.now()}.enc`,
    contentType: "text/plain"
  });

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendDocument`, form, {
      headers: form.getHeaders()
    });
    console.log(`🔐 Encrypted backup sent (${subs.length} entries)`);
    return true;
  } catch (err) {
    console.error("Backup send error:", err.message);
    return false;
  }
}
