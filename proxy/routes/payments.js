// proxy/routes/payments.js
import express from "express";
import crypto from "crypto";
import axios from "axios";
import fs from "fs";
import path from "path";
import { updateSubscriber, addReferralReward } from "../subscribersStore.js";
import { isPaymentProcessed, recordPayment } from "../paymentsStore.js";
import { decryptId } from "../../utils/crypto.mjs";
import { getPendingReferral, clearPendingReferral } from "../referralStore.js";


function getLatestPremiumVideo() {
  try {
    const file = path.join(process.cwd(), "bot/videos.json");
    const videos = JSON.parse(fs.readFileSync(file, "utf8"));
    const premium = videos.filter(v => v.type === "premium");
    if (!premium.length) return null;
    return premium.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  } catch {
    return null;
  }
}

const router = express.Router();

// =====================================
//  TEST MODE (pour Postman)
// =====================================
const TEST_MODE = false;

// Capture du RAW BODY (obligatoire pour la signature HMAC)
router.use(
  express.raw({
    type: "*/*",
  })
);

router.post("/nowpayments-ipn", async (req, res) => {
  try {
    const raw = req.body.toString("utf8");

    const signature = req.headers["x-nowpayments-sig"];
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;

    // =====================================
    //  Vérification de signature
    // =====================================
    if (!TEST_MODE) {
      const hmac = crypto.createHmac("sha512", secret);
      hmac.update(raw);
      const expected = hmac.digest("hex");

      if (expected !== signature) {
        console.log("❌ Invalid signature");
        return res.status(400).send("Invalid signature");
      }
    } else {
      console.log("⚠️ TEST MODE ACTIVE — Signature skipped");
    }

    // Parse JSON du body brut
    const data = JSON.parse(raw);

    // =====================================
    //  Protection contre traitement en doublon
    // =====================================
    const paymentId = data.payment_id || data.paymentId || data.invoice_id;

    if (!paymentId) return res.status(200).send("No payment_id");

    if (isPaymentProcessed(paymentId)) {
      console.log(`⏩ Payment already processed: ${paymentId}`);
      return res.status(200).send("Already processed");
    }

    // =====================================
    //  Vérifier que le paiement est terminé
    // =====================================
    if (data.payment_status !== "finished") {
      return res.status(200).send("Ignored (not finished)");
    }

    let telegramId;
    try {
      telegramId = decryptId(data.order_description);
    } catch {
      // fallback for legacy plain-text order_descriptions
      telegramId = Number(data.order_description);
    }
    const amount = Number(data.price_amount);

    // =====================================
    //  Déterminer le plan selon le montant
    // =====================================
    let durationDays = 0;
    let planName = "";

    // ⚠️ CONFIGURE YOUR PRICES HERE — must match the prices set in bot/bot.js
    // WEEK_PRICE (default $10) → 7 days
    // MONTH_PRICE (default $24) → 30 days
    if (amount === 10) {
      durationDays = 7;
      planName = "week";
    } else if (amount === 24) {
      durationDays = 30;
      planName = "month";
    } else {
      return res.status(200).send("Unknown plan");
    }

    // Expiration = maintenant + durée
    const expires = new Date();
    expires.setDate(expires.getDate() + durationDays);

    // =====================================
    //  Mise à jour GitHub subscribers.json
    // =====================================
    await updateSubscriber({
      telegram_id: telegramId,
      plan: planName,
      expires_at: expires.toISOString(),
    });

    // Sauvegarder le paiement dans paymentsStore
    recordPayment({
      payment_id: paymentId,
      telegram_id: telegramId,
      amount,
      price_currency: data.price_currency,
      pay_currency: data.pay_currency,
      status: data.payment_status,
      plan: planName,
      duration_days: durationDays,
    });

    console.log(`✔ Subscription updated for ${telegramId} → ${planName}`);

    // =====================================
    //  REFERRAL CREDIT
    // =====================================
    const referrerUid = getPendingReferral(telegramId);
    if (referrerUid) {
      await addReferralReward(referrerUid);
      clearPendingReferral(telegramId);
    }

    // =====================================
    //  NOTIFICATION TELEGRAM ENRICHIE
    // =====================================
    try {
      const latest = getLatestPremiumVideo();
      const planLabel = planName === "week" ? "1 Week" : "1 Month";

      if (latest) {
        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendPhoto`,
          {
            chat_id: telegramId,
            photo: `https://gateway.pinata.cloud/ipfs/${latest.image}`,
            caption:
              `💎 <b>Welcome to StreamGate Premium!</b>\n\n` +
              `Plan: <b>${planLabel}</b>\n` +
              `Expires: <b>${expires.toISOString().slice(0, 10)}</b>\n\n` +
              `Here's our latest drop — enjoy 🔥`,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
              inline_keyboard: [
                [{ text: "▶ Watch Now", callback_data: `vid:${latest.id}` }],
                [{ text: "📁 Browse All Videos", callback_data: "categories" }]
              ]
            })
          }
        );
      } else {
        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
          {
            chat_id: telegramId,
            text:
              `💎 <b>Welcome to StreamGate Premium!</b>\n\n` +
              `Plan: <b>${planLabel}</b>\n` +
              `Expires: <b>${expires.toISOString().slice(0, 10)}</b>\n\n` +
              `Start browsing now 👇`,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
              inline_keyboard: [
                [{ text: "📁 Browse Videos", callback_data: "categories" }]
              ]
            })
          }
        );
      }
    } catch (err) {
      console.error("Telegram notify error:", err.message);
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error("❌ IPN ERROR:", err);
    return res.sendStatus(500);
  }
});

export default router;
