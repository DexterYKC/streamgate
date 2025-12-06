import { Telegraf } from "telegraf";
import axios from "axios";
import { encryptId, hashId } from "../utils/crypto.mjs";
import { setPendingReferral } from "../proxy/referralStore.js";
import { getSubscriber, getReferralTier, isActive, registerUserIfNew } from "../proxy/subscribersStore.js";

// =============================
// COOLDOWN ANTI-SPAM (shared)
// =============================
const cooldowns = new Map();

function checkCooldown(userId, ms = 1500) {
  const now = Date.now();
  if (cooldowns.has(userId) && now - cooldowns.get(userId) < ms) return true;
  cooldowns.set(userId, now);
  return false;
}

// =============================
// GLOBAL CONFIG (same for all bots)
// =============================
const BASE_URL = process.env.BASE_URL;
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || "SupportUnavailable";
// Admin's personal Telegram chat ID — if set, support messages are relayed
// here instead of showing a static @username. Reply to a forwarded message
// to answer the user directly.
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;
const WEEK_PRICE = 10;
const MONTH_PRICE = 24;
const PAY_CURRENCY = "ETH";
const PAGE_SIZE = 6;
const IPFS_GW = process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
const WELCOME_BANNER = process.env.WELCOME_BANNER_CID
  ? `${IPFS_GW}/${process.env.WELCOME_BANNER_CID}`
  : null;

// =============================
// UI HELPERS
// =============================
function formatDate(dateStr) {
  if (!dateStr) return "unknown";
  return new Date(dateStr).toISOString().slice(0, 10);
}

function mainMenuKeyboard(active = false) {
  return {
    inline_keyboard: [
      [{ text: active ? "🔄 Renew Subscription" : "💎 Unlock Premium Access", callback_data: "sub_menu" }],
      [{ text: "🆕 Latest Drops", callback_data: "latest" }, { text: "🔍 Search", callback_data: "search_start" }],
      [{ text: "🎬 Free Previews", callback_data: "free_videos" }],
      [{ text: "📁 Categories", callback_data: "categories" }],
      [{ text: "👑 VIP Exclusive", callback_data: "vip_content" }],
      [{ text: "👤 My Subscription", callback_data: "my_sub" }],
      [{ text: "🔗 Referral Link", callback_data: "my_ref" }, { text: "📨 Support", callback_data: "contact_support" }]
    ]
  };
}

// =============================
// BACKEND HELPERS
// =============================
async function fetchVideos() {
  const res = await axios.get(`${BASE_URL}/videos`);
  return res.data || [];
}

async function fetchCategories() {
  const res = await axios.get(`${BASE_URL}/categories`);
  return res.data || [];
}

async function fetchSubscription(userId) {
  const res = await axios.get(`${BASE_URL}/subscription/${userId}`);
  return res.data;
}

async function generateVideoLink(userId, videoId) {
  const res = await axios.post(`${BASE_URL}/generate`, {
    telegram_id: userId,
    video_id: videoId
  });
  return res.data.url;
}

// =============================
// VIDEO DISPLAY HELPERS
// =============================
async function sendFreeVideo(ctx, v, category) {
  const url = `${BASE_URL}/player/index.html?token=free&id=${v.id}&cid=${v.cid}&title=${encodeURIComponent(v.title)}`;
  await ctx.replyWithPhoto(
    `${IPFS_GW}/${v.image}`,
    {
      caption: `🎁 <b>Free preview — ${category}</b>\n\n<b>${v.title}</b>\n\n${v.description || ""}\n\n🔗 ${url}`,
      parse_mode: "HTML"
    }
  );
}

async function sendPremiumVideoCard(ctx, v) {
  await ctx.replyWithPhoto(
    `${IPFS_GW}/${v.image}`,
    {
      caption: `🔥 <b>${v.title}</b>\nPremium content.\n\n▶ Tap "Watch" to access.`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "▶ Watch", callback_data: `vid:${v.id}` }],
          [{ text: "💳 Subscribe", callback_data: "sub_menu" }]
        ]
      }
    }
  );
}

async function sendVipVideoCard(ctx, v) {
  await ctx.replyWithPhoto(
    `${IPFS_GW}/${v.image}`,
    {
      caption: `👑 <b>${v.title}</b>\nVIP Exclusive — reserved for monthly subscribers.\n\n▶ Tap "Watch" to access.`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "▶ Watch", callback_data: `vid:${v.id}` }]
        ]
      }
    }
  );
}

// =============================
// FACTORY — creates one bot instance
// botUsername: per-bot t.me username (for referral links)
// =============================
export function createBot(token, botUsername) {
  const BOT_USERNAME = botUsername || process.env.BOT_USERNAME || "StreamGateBot";
  const bot = new Telegraf(token);

  // Per-bot search mode tracking
  const searchMode = new Set();

  // Per-bot support relay tracking
  const supportMode = new Set();           // users currently writing a support message
  const supportThreads = new Map();        // admin-side message_id -> user telegram_id

  // =============================
  // /start
  // =============================
  bot.start(async (ctx) => {
    try {
      const isNewUser = await registerUserIfNew(ctx.from.id).catch(() => false);

      const payload = ctx.startPayload;
      if (payload?.startsWith("ref_")) {
        const refCode = payload.slice(4);
        if (refCode !== hashId(ctx.from.id).slice(0, 12)) {
          setPendingReferral(ctx.from.id, refCode);
        }
      }

      await ctx.sendChatAction("typing");
      await new Promise(r => setTimeout(r, 900));
      await ctx.reply("🔐 <b>Access granted.</b>", { parse_mode: "HTML" });

      await ctx.sendChatAction("typing");
      await new Promise(r => setTimeout(r, 1300));

      const trialLine = isNewUser
        ? `\n🎁 <b>You just unlocked 2 hours of free premium access.</b> Enjoy.\n`
        : "";

      const welcomeText =
        `💎 <b>Welcome to StreamGate.</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Premium video, delivered securely on Telegram.\n` +
        `<i>Subscribe once, watch anywhere.</i>\n\n` +
        `✦ New videos added every week\n` +
        `✦ Token-secured streams\n` +
        `✦ Pay in crypto\n` +
        `✦ Free previews available right now\n` +
        trialLine + `\n` +
        `Choose an option below 👇`;

      const active = await isActive(ctx.from.id);

      if (WELCOME_BANNER) {
        await ctx.replyWithAnimation(WELCOME_BANNER, {
          caption: welcomeText,
          parse_mode: "HTML",
          reply_markup: mainMenuKeyboard(active)
        });
      } else {
        await ctx.reply(welcomeText, {
          parse_mode: "HTML",
          reply_markup: mainMenuKeyboard(active)
        });
      }
    } catch (err) {
      console.error("start error:", err.message);
    }
  });

  // =============================
  // CALLBACK HANDLER
  // =============================
  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    if (checkCooldown(userId)) {
      return ctx.answerCbQuery("Slow down ⏳", { show_alert: false });
    }

    try {
      if (data === "contact_support") {
        await ctx.answerCbQuery();

        if (ADMIN_CHAT_ID) {
          supportMode.add(userId);
          await ctx.reply(
            `📨 <b>Support</b>\n\nDescribe your issue below — an admin will read it and reply right here. ✨`,
            { parse_mode: "HTML", reply_markup: { force_reply: true } }
          );
        } else {
          await ctx.reply(`📩 Support: @${SUPPORT_USERNAME}`);
        }
        return;
      }

      if (data === "sub_menu") {
        await ctx.answerCbQuery();
        await ctx.reply(
          `💎 <b>Choose your Premium Plan</b>

🔥 <b>1 Week Access</b> — $${WEEK_PRICE}
Perfect to test everything without limits.

✨ <b>1 Month Access</b> — $${MONTH_PRICE}
Best value — unlock full platform for 30 days.

Select your plan below ⬇️`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔥 1 Week — $" + WEEK_PRICE, callback_data: "sub_week" }],
                [{ text: "✨ 1 Month — $" + MONTH_PRICE, callback_data: "sub_month" }],
                [{ text: "⬅️ Back", callback_data: "back_main" }]
              ]
            }
          });
        return;
      }

      if (data === "noop") {
        return ctx.answerCbQuery();
      }

      if (data === "free_videos" || data.startsWith("fv:")) {
        await ctx.answerCbQuery();
        const page = data.startsWith("fv:") ? parseInt(data.split(":")[1]) : 0;
        const videos = await fetchVideos();
        const list = videos.filter(v => v.type === "free");

        if (!list.length) {
          await ctx.reply("No free previews available yet.");
          return;
        }

        const totalPages = Math.ceil(list.length / PAGE_SIZE);
        const pageVideos = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        const buttons = pageVideos.map(v => [{ text: `🎁 ${v.title}`, callback_data: `fvw:${v.id}` }]);

        if (totalPages > 1) {
          const nav = [];
          if (page > 0) nav.push({ text: "◀", callback_data: `fv:${page - 1}` });
          nav.push({ text: `${page + 1} / ${totalPages}`, callback_data: "noop" });
          if (page < totalPages - 1) nav.push({ text: "▶", callback_data: `fv:${page + 1}` });
          buttons.push(nav);
        }

        await ctx.reply(
          `🎬 <b>Free Previews</b> — ${list.length} video${list.length > 1 ? "s" : ""}\n\nTap a title to watch 👇`,
          { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } }
        );
        return;
      }

      if (data.startsWith("fvw:")) {
        await ctx.answerCbQuery();
        const videoId = data.slice(4);
        const videos = await fetchVideos();
        const v = videos.find(v => v.id === videoId);
        if (!v) { await ctx.reply("Video not found."); return; }
        await sendFreeVideo(ctx, v, v.category || "Free");
        return;
      }

      if (data === "categories") {
        await ctx.answerCbQuery();

        if (!(await isActive(userId))) {
          await ctx.reply(
            `🔒 <b>Members only.</b>\n\nCategories are reserved for active subscribers.\nSubscribe to unlock all content. 💎`,
            { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "💎 Unlock Premium Access", callback_data: "sub_menu" }]] } }
          );
          return;
        }

        const categories = await fetchCategories();
        if (!categories.length) { await ctx.reply("No categories available."); return; }

        await ctx.reply("📂 Choose a category:", {
          reply_markup: {
            inline_keyboard: categories.map(c => [{ text: c.name, callback_data: `cat:${c.name}` }])
          }
        });
        return;
      }

      if (data === "vip_content" || data.startsWith("vipw:")) {
        await ctx.answerCbQuery();

        if (data.startsWith("vipw:")) {
          const videoId = data.slice(5);
          const videos = await fetchVideos();
          const v = videos.find(v => v.id === videoId);
          if (!v) { await ctx.reply("Video not found."); return; }
          await sendVipVideoCard(ctx, v);
          return;
        }

        const sub = await getSubscriber(userId);
        const activeMonthly = sub?.expires_at && new Date(sub.expires_at) > new Date() && sub.plan === "month";

        if (!activeMonthly) {
          await ctx.reply(
            `👑 <b>VIP Exclusive</b>\n\nA special drop every month — reserved exclusively for <b>Monthly</b> subscribers, as a reward for their loyalty. ✨\n\nEach VIP video disappears after 30 days, so once it's gone, it's gone for good.\n\nUpgrade to a Monthly plan to unlock it.`,
            { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "✨ Upgrade to Monthly — $" + MONTH_PRICE, callback_data: "sub_month" }]] } }
          );
          return;
        }

        const videos = await fetchVideos();
        const now = new Date();
        const list = videos.filter(v => v.type === "vip" && (!v.expiresAt || new Date(v.expiresAt) > now));

        if (!list.length) {
          await ctx.reply("👑 No VIP drop available right now. Check back soon — a new one is coming! 🔜");
          return;
        }

        const buttons = list.map(v => {
          const daysLeft = v.expiresAt ? Math.max(0, Math.ceil((new Date(v.expiresAt) - now) / (1000 * 60 * 60 * 24))) : null;
          const label = daysLeft !== null ? `👑 ${v.title} (${daysLeft}d left)` : `👑 ${v.title}`;
          return [{ text: label, callback_data: `vipw:${v.id}` }];
        });

        await ctx.reply(
          `👑 <b>VIP Exclusive</b> — your monthly reward ✨\n\nTap a title to watch 👇`,
          { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } }
        );
        return;
      }

      if (data === "back_main") {
        await ctx.answerCbQuery();
        const active = await isActive(userId);
        await ctx.reply("Main menu:", { reply_markup: mainMenuKeyboard(active) });
        return;
      }

      if (data.startsWith("cat:") || data.startsWith("cv:")) {
        await ctx.answerCbQuery();

        let category, page;
        if (data.startsWith("cv:")) {
          const lastColon = data.lastIndexOf(":");
          category = data.slice(3, lastColon);
          page = parseInt(data.slice(lastColon + 1));
        } else {
          category = data.slice(4);
          page = 0;
        }

        const videos = await fetchVideos();
        const all = videos.filter(v => v.category === category);

        if (!all.length) { await ctx.reply("No videos in this category yet."); return; }

        if (page === 0) {
          const free = all.find(v => v.type === "free");
          if (free) await sendFreeVideo(ctx, free, category);
        }

        const premium = all.filter(v => v.type === "premium");
        if (!premium.length) { await ctx.reply("No premium videos in this category yet."); return; }

        const totalPages = Math.ceil(premium.length / PAGE_SIZE);
        const pageVideos = premium.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        const buttons = pageVideos.map(v => [{ text: `▶ ${v.title}`, callback_data: `vid:${v.id}` }]);

        if (totalPages > 1) {
          const nav = [];
          if (page > 0) nav.push({ text: "◀", callback_data: `cv:${category}:${page - 1}` });
          nav.push({ text: `${page + 1} / ${totalPages}`, callback_data: "noop" });
          if (page < totalPages - 1) nav.push({ text: "▶", callback_data: `cv:${category}:${page + 1}` });
          buttons.push(nav);
        }

        await ctx.reply(
          `📁 <b>${category}</b> — ${premium.length} video${premium.length > 1 ? "s" : ""}\n\nSelect a video to watch 👇`,
          { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } }
        );
        return;
      }

      if (data.startsWith("vid:")) {
        await ctx.answerCbQuery();
        const videoId = data.slice(4);

        try {
          const url = await generateVideoLink(userId, videoId);
          await ctx.reply(`🎬 <b>Your premium video:</b>\n${url}`, { parse_mode: "HTML" });
        } catch (err) {
          if (err.response && err.response.status === 403) {
            await ctx.reply(
              `🔐 <b>This is Premium Content</b>\n\nSubscribe now to unlock full access to all videos instantly.`,
              {
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🔥 1 Week — $" + WEEK_PRICE, callback_data: "sub_week" }],
                    [{ text: "✨ 1 Month — $" + MONTH_PRICE, callback_data: "sub_month" }]
                  ]
                }
              }
            );
          } else {
            await ctx.reply("Error generating access link.");
          }
        }
        return;
      }

      if (data === "my_sub") {
        await ctx.answerCbQuery();
        const sub = await fetchSubscription(userId);

        if (!sub.active) {
          await ctx.reply(
            `🔒 <b>No active subscription</b>\nUnlock full access now 👇`,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "🔥 1 Week — $" + WEEK_PRICE, callback_data: "sub_week" }],
                  [{ text: "✨ 1 Month — $" + MONTH_PRICE, callback_data: "sub_month" }]
                ]
              }
            }
          );
          return;
        }

        const expiry = new Date(sub.expires_at);
        const isTrial = sub.plan === "trial";
        const daysLeft = Math.max(0, Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24)));
        const hoursLeft = Math.max(0, Math.ceil((expiry - new Date()) / (1000 * 60 * 60)));
        const planLabel = sub.plan === "week" ? "1 Week" : sub.plan === "month" ? "1 Month" : "🎁 2h Free Trial";
        const memberSince = sub.started_at ? formatDate(sub.started_at) : "—";
        const daysLeftBar = isTrial ? "🕐" : (daysLeft > 5 ? "🟢" : daysLeft > 2 ? "🟡" : "🔴");
        const timeLeftStr = isTrial ? `${hoursLeft}h remaining` : `${daysLeft} days`;

        await ctx.reply(
          `✅ <b>Subscription Active</b>\n\n` +
          `📋 Plan: <b>${planLabel}</b>\n` +
          `⏳ Expires: <b>${formatDate(sub.expires_at)}</b>\n` +
          `${daysLeftBar} Time left: <b>${timeLeftStr}</b>\n` +
          `📅 Member since: <b>${memberSince}</b>\n\n` +
          `Enjoy unlimited premium access ✨`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔄 Renew", callback_data: "sub_menu" }, { text: "🔗 Referral", callback_data: "my_ref" }]
              ]
            }
          }
        );
        return;
      }

      if (data === "latest" || data.startsWith("lv:")) {
        await ctx.answerCbQuery();
        const page = data.startsWith("lv:") ? parseInt(data.split(":")[1]) : 0;
        const videos = await fetchVideos();
        const sorted = videos
          .filter(v => v.type === "premium")
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        if (!sorted.length) { await ctx.reply("No premium videos yet. Check back soon! 🔜"); return; }

        const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
        const pageVideos = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        const buttons = pageVideos.map(v => [{ text: `🆕 ${v.title}`, callback_data: `vid:${v.id}` }]);

        if (totalPages > 1) {
          const nav = [];
          if (page > 0) nav.push({ text: "◀", callback_data: `lv:${page - 1}` });
          nav.push({ text: `${page + 1} / ${totalPages}`, callback_data: "noop" });
          if (page < totalPages - 1) nav.push({ text: "▶", callback_data: `lv:${page + 1}` });
          buttons.push(nav);
        }

        await ctx.reply(
          `🆕 <b>Latest Drops</b> — ${sorted.length} video${sorted.length > 1 ? "s" : ""}\n\nNewest first 👇`,
          { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } }
        );
        return;
      }

      if (data === "search_start") {
        await ctx.answerCbQuery();
        searchMode.add(userId);
        await ctx.reply("🔍 <b>Search</b>\n\nType a title (or part of it):", {
          parse_mode: "HTML",
          reply_markup: { force_reply: true }
        });
        return;
      }

      if (data === "my_ref") {
        await ctx.answerCbQuery();

        if (!(await isActive(userId))) {
          await ctx.reply(
            `🔐 <b>Members only.</b>\n\nThe referral program is a premium benefit.\nSubscribe first to unlock your referral link and start earning free days. 🎁`,
            { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "💳 Subscribe", callback_data: "sub_menu" }]] } }
          );
          return;
        }

        const shortCode = hashId(userId).slice(0, 12);
        const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${shortCode}`;

        const sub = await getSubscriber(userId);
        const refCount = sub?.referral_count || 0;
        const tier = getReferralTier(refCount);

        const currentMonth = new Date().toISOString().slice(0, 7);
        const monthDays = sub?.referral_month === currentMonth ? (sub?.referral_month_days || 0) : 0;

        const BAR = 15;
        const tierStart = refCount >= 100 ? 100 : refCount >= 50 ? 50 : refCount >= 10 ? 10 : 0;
        let bar;
        if (!tier.nextAt) {
          bar = "▓".repeat(BAR);
        } else {
          const filled = Math.round(((refCount - tierStart) / (tier.nextAt - tierStart)) * BAR);
          bar = "▓".repeat(Math.min(filled, BAR)) + "░".repeat(Math.max(0, BAR - filled));
        }

        const nextTierName = tier.nextAt
          ? tier.nextAt >= 100 ? "💎 Diamond" : tier.nextAt >= 50 ? "🥇 Gold" : "🥈 Silver"
          : null;

        const progressLine = tier.nextAt
          ? `${bar}  ${refCount}/${tier.nextAt} → ${nextTierName}`
          : `${bar}  Max tier reached!`;

        await ctx.reply(
          `🏆 <b>Referral Program</b>\n\n` +
          `Tier : ${tier.label}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `${progressLine}\n\n` +
          `💡 Reward : <b>+${tier.daysPerRef} day${tier.daysPerRef > 1 ? "s" : ""} per referral</b>\n` +
          `📅 This month : <b>${monthDays}/14</b> days earned\n` +
          `✅ Total referrals : <b>${refCount}</b>\n\n` +
          `🔗 <b>Your link :</b>\n<code>${refLink}</code>`,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (data === "sub_week") {
        await ctx.answerCbQuery();
        try {
          const invoice = await axios.post(
            "https://api.nowpayments.io/v1/invoice",
            {
              price_amount: WEEK_PRICE,
              price_currency: "USD",
              pay_currency: PAY_CURRENCY,
              order_id: `sub_week_${Date.now()}`,
              order_description: encryptId(userId),
              ipn_callback_url: `${BASE_URL}/payments/nowpayments-ipn`
            },
            { headers: { "x-api-key": process.env.NOWPAYMENTS_API_KEY } }
          );
          await ctx.reply(
            `🗓 <b>1 Week Subscription</b>\n\nPay with ETH:\n${invoice.data.invoice_url}`,
            { parse_mode: "HTML" }
          );
        } catch {
          await ctx.reply("Payment creation error.");
        }
        return;
      }

      if (data === "sub_month") {
        await ctx.answerCbQuery();
        try {
          const invoice = await axios.post(
            "https://api.nowpayments.io/v1/invoice",
            {
              price_amount: MONTH_PRICE,
              price_currency: "USD",
              pay_currency: PAY_CURRENCY,
              order_id: `sub_month_${Date.now()}`,
              order_description: encryptId(userId),
              ipn_callback_url: `${BASE_URL}/payments/nowpayments-ipn`
            },
            { headers: { "x-api-key": process.env.NOWPAYMENTS_API_KEY } }
          );
          await ctx.reply(
            `📅 <b>1 Month Subscription</b>\n\nPay with ETH:\n${invoice.data.invoice_url}`,
            { parse_mode: "HTML" }
          );
        } catch {
          await ctx.reply("Payment creation error.");
        }
        return;
      }

    } catch (err) {
      console.error("callback error:", err.message);
    }
  });

  // =============================
  // ANY USER MESSAGE
  // =============================
  bot.on("message", async (ctx) => {
    try {
      const userId = ctx.from.id;
      const text = ctx.message?.text;

      // =============================
      // ADMIN REPLYING TO A SUPPORT THREAD
      // (admin replies to the forwarded message in their own chat with the bot)
      // =============================
      if (ADMIN_CHAT_ID && String(ctx.chat.id) === String(ADMIN_CHAT_ID)) {
        if (ctx.message.reply_to_message && text) {
          const targetUserId = supportThreads.get(ctx.message.reply_to_message.message_id);
          if (targetUserId) {
            try {
              await ctx.telegram.sendMessage(
                targetUserId,
                `📨 <b>Support replied:</b>\n\n${text}`,
                { parse_mode: "HTML" }
              );
              await ctx.reply("✅ Sent to user.");
            } catch {
              await ctx.reply("⚠️ Could not deliver — the user may have blocked the bot.");
            }
            return;
          }
        }
        // Any other message from the admin chat falls through to normal handling below
      }

      // =============================
      // USER WRITING A SUPPORT MESSAGE
      // =============================
      if (supportMode.has(userId) && text && !text.startsWith("/")) {
        supportMode.delete(userId);

        if (ADMIN_CHAT_ID) {
          try {
            const uidShort = hashId(userId).slice(0, 12);
            const sent = await ctx.telegram.sendMessage(
              ADMIN_CHAT_ID,
              `🆘 <b>Support request</b>\nFrom: <code>${uidShort}</code>\n\n${text}\n\n<i>Reply to this message to answer the user.</i>`,
              { parse_mode: "HTML" }
            );
            supportThreads.set(sent.message_id, userId);
            await ctx.reply(
              "✅ <b>Message sent!</b>\n\nWe'll get back to you right here as soon as possible. ✨",
              { parse_mode: "HTML" }
            );
          } catch {
            await ctx.reply("⚠️ Unable to reach support right now. Please try again later.");
          }
        } else {
          await ctx.reply(`📩 Support: @${SUPPORT_USERNAME}`);
        }
        return;
      }

      if (searchMode.has(userId) && text && !text.startsWith("/")) {
        searchMode.delete(userId);
        const videos = await fetchVideos();
        const query = text.toLowerCase().trim();
        const results = videos.filter(v =>
          v.title.toLowerCase().includes(query) ||
          (v.description || "").toLowerCase().includes(query)
        );

        if (!results.length) {
          await ctx.reply(
            `🔍 No results for "<b>${text}</b>"\n\nTry another title 👇`,
            { parse_mode: "HTML", reply_markup: mainMenuKeyboard() }
          );
          return;
        }

        const buttons = results.slice(0, PAGE_SIZE).map(v => [{
          text: `${v.type === "free" ? "🎁" : "▶"} ${v.title}`,
          callback_data: v.type === "free" ? `fvw:${v.id}` : `vid:${v.id}`
        }]);

        await ctx.reply(
          `🔍 <b>${results.length} result${results.length > 1 ? "s" : ""}</b> for "<b>${text}</b>"`,
          { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } }
        );
        return;
      }

      await ctx.reply(
        `👋 <b>Welcome to StreamGate.</b>\n\n` +
        `Premium video subscriptions — secure and private.\n\n` +
        `Tap the button below to get started 👇`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[
              { text: "🚀 Start", url: `https://t.me/${BOT_USERNAME}?start=welcome` }
            ]]
          }
        }
      );
    } catch (err) {
      console.error("msg err:", err.message);
    }
  });

  return bot;
}
