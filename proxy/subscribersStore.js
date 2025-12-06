// subscribersStore.js
import axios from "axios";
import dotenv from "dotenv";
import { hashId, encryptId } from "../utils/crypto.mjs";
dotenv.config();

/*
  ===============================
  CONFIG
  ===============================
*/
const REPO_OWNER = process.env.GITHUB_REPO_OWNER; 
const REPO_NAME = process.env.GITHUB_REPO_NAME;  
const FILE_PATH = "bot/subscribers.json";        
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const BASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;

/*
  ===============================
  HELPERS
  ===============================
*/

async function fetchSubscribersFromGitHub() {
  const res = await axios.get(BASE_URL, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
  });

  const decoded = Buffer.from(res.data.content, "base64").toString("utf8");
  const json = JSON.parse(decoded || "[]");

  return { subs: json, sha: res.data.sha };
}

// Charger subscribers.json + SHA GitHub (toujours frais — requis avant un
// writeSubscribers pour avoir un SHA à jour et éviter un conflit GitHub)
export async function loadSubscribers() {
  try {
    const fresh = await fetchSubscribersFromGitHub();
    subscribersCache = { ...fresh, fetchedAt: Date.now() };
    return fresh;

  } catch (err) {
    console.error("❌ Unable to load subscribers.json:", err.message);
    return { subs: [], sha: null };
  }
}

// ===============================
// READ-PATH CACHE
// ===============================
// isActive/getSubscriber are hit on every /generate and /stream/:token request
// (so on every chunk a viewer's player loads). Hitting GitHub's API live each
// time risks rate limits/hiccups — and since loadSubscribers() returns an empty
// list on failure, a transient GitHub error used to look like "no subscription"
// and broke playback. Cache briefly and fall back to the last known-good list
// instead of an empty one when GitHub is unreachable.
const CACHE_TTL_MS = 30_000;
let subscribersCache = { subs: null, sha: null, fetchedAt: 0 };

async function loadSubscribersForRead() {
  const isFresh = subscribersCache.subs && (Date.now() - subscribersCache.fetchedAt) < CACHE_TTL_MS;
  if (isFresh) return subscribersCache;

  try {
    const fresh = await fetchSubscribersFromGitHub();
    subscribersCache = { ...fresh, fetchedAt: Date.now() };
    return subscribersCache;

  } catch (err) {
    console.error("❌ Unable to load subscribers.json (using cached copy):", err.message);
    return subscribersCache.subs ? subscribersCache : { subs: [], sha: null };
  }
}

// Écrire subscribers.json sur GitHub
async function writeSubscribers(newSubs, sha) {
  try {
    const encoded = Buffer.from(JSON.stringify(newSubs, null, 2)).toString("base64");

    await axios.put(
      BASE_URL,
      {
        message: "Update subscribers.json",
        content: encoded,
        sha,
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    console.log("✔ GitHub subscribers.json updated");

  } catch (err) {
    console.error("❌ Failed to write subscribers.json:", err.message);
  }
}

/*
  ===============================
  GET SUBSCRIBER
  ===============================
*/
export async function getSubscriber(telegramId) {
  const { subs } = await loadSubscribersForRead();
  const uid = hashId(telegramId);
  // support new format (uid) and legacy format (telegram_id)
  return subs.find((s) => s.uid === uid || Number(s.telegram_id) === Number(telegramId)) || null;
}

/*
  ===============================
  CHECK ACTIVE
  ===============================
*/
export async function isActive(telegramId) {
  const user = await getSubscriber(telegramId);
  if (!user) return false;

  if (!user.expires_at) return false;

  return new Date(user.expires_at) > new Date();
}

/*
  ===============================
  REGISTER USER (first /start, no subscription)
  ===============================
*/
export async function registerUserIfNew(telegramId) {
  const { subs, sha } = await loadSubscribers();
  if (!sha) return;

  const uid = hashId(telegramId);
  const exists = subs.find(
    (s) => s.uid === uid || (s.telegram_id && hashId(s.telegram_id) === uid)
  );
  if (exists) return false;

  const trialExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  subs.push({
    uid,
    tid: encryptId(telegramId),
    plan: "trial",
    expires_at: trialExpiry,
    active: true,
    started_at: new Date().toISOString(),
    referral_count: 0
  });

  await writeSubscribers(subs, sha);
  console.log(`👤 New user registered (2h trial): ${uid.slice(0, 8)}...`);
  return true;
}

/*
  ===============================
  UPDATE SUBSCRIBER (WRITE)
  ===============================
*/
export async function updateSubscriber({ telegram_id, plan, expires_at }) {
  const { subs, sha } = await loadSubscribers();

  if (!sha) {
    console.error("❌ Cannot update subscribers.json (missing SHA)");
    return;
  }

  const uid = hashId(telegram_id);
  const tid = encryptId(telegram_id);

  // find by new uid or legacy telegram_id
  let user = subs.find((s) => s.uid === uid || Number(s.telegram_id) === Number(telegram_id));

  if (!user) {
    user = { uid, tid, plan, expires_at, started_at: new Date().toISOString(), active: true, notified_expiring: false };
    subs.push(user);
  } else {
    // migrate legacy entry on first write
    if (user.telegram_id !== undefined) {
      user.uid = uid;
      user.tid = tid;
      delete user.telegram_id;
    }
    user.plan = plan;
    user.expires_at = expires_at;
    user.active = true;
    user.notified_expiring = false;
  }

  await writeSubscribers(subs, sha);

  console.log(`✔ Subscriber ${uid.slice(0, 8)}... updated → ${plan}`);
}

/*
  ===============================
  GRANT SUBSCRIPTION (admin)
  ===============================
*/
export async function grantSubscriptionByUid(uid, plan, days) {
  const { subs, sha } = await loadSubscribers();
  if (!sha) return false;

  // Find by uid (new) or by hashed legacy telegram_id
  let user = subs.find(s => s.uid === uid);
  if (!user) {
    user = subs.find(s => s.telegram_id && hashId(s.telegram_id) === uid);
  }
  if (!user) return false;

  // Migrate legacy entry on grant
  if (!user.uid && user.telegram_id) {
    user.uid = hashId(user.telegram_id);
    user.tid = encryptId(user.telegram_id);
    delete user.telegram_id;
  }

  const wasActive = user.expires_at && new Date(user.expires_at) > new Date();

  const base = new Date();
  base.setDate(base.getDate() + days);
  user.expires_at = base.toISOString();
  user.plan = plan;
  user.active = true;
  if (!user.started_at) user.started_at = new Date().toISOString();

  await writeSubscribers(subs, sha);
  console.log(`🎁 Admin grant: ${uid.slice(0, 8)}... → ${plan} (${days}d)`);

  return {
    wasActive,
    newExpiry: user.expires_at,
    tid: user.tid || null,
    telegram_id: user.telegram_id || null
  };
}

/*
  ===============================
  REFERRAL TIERS
  ===============================
*/
const MONTHLY_CAP = 14;

export function getReferralTier(count) {
  if (count >= 100) return { label: "💎 Diamond", daysPerRef: 5, nextAt: null };
  if (count >= 50)  return { label: "🥇 Gold",    daysPerRef: 3, nextAt: 100 };
  if (count >= 10)  return { label: "🥈 Silver",  daysPerRef: 2, nextAt: 50 };
  return                   { label: "🥉 Bronze",  daysPerRef: 1, nextAt: 10 };
}

/*
  ===============================
  REFERRAL REWARD (tiered)
  ===============================
*/
export async function addReferralReward(referrerUid) {
  const { subs, sha } = await loadSubscribers();
  if (!sha) return null;

  const user = subs.find(s => s.uid && (s.uid === referrerUid || s.uid.startsWith(referrerUid)));
  if (!user) return null;

  const currentMonth = new Date().toISOString().slice(0, 7);

  if (user.referral_month !== currentMonth) {
    user.referral_month = currentMonth;
    user.referral_month_days = 0;
  }

  const alreadyEarned = user.referral_month_days || 0;
  if (alreadyEarned >= MONTHLY_CAP) return null;

  user.referral_count = (user.referral_count || 0) + 1;

  const tier = getReferralTier(user.referral_count);
  const daysToAdd = Math.min(tier.daysPerRef, MONTHLY_CAP - alreadyEarned);

  const base = user.expires_at && new Date(user.expires_at) > new Date()
    ? new Date(user.expires_at)
    : new Date();
  base.setDate(base.getDate() + daysToAdd);
  user.expires_at = base.toISOString();

  user.referral_month_days = alreadyEarned + daysToAdd;

  await writeSubscribers(subs, sha);
  console.log(`🎁 Referral reward: +${daysToAdd}d (${tier.label}) → ${referrerUid.slice(0, 8)}...`);
  return { daysAdded: daysToAdd, tier, referralCount: user.referral_count };
}
