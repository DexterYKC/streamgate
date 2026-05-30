// In-memory referral tracking (lives for the duration of the server session)
// pending: telegramId → referrerUid (hash)
// rewarded: telegramIds already credited (no double reward)

const pending = new Map();
const rewarded = new Set();

export function setPendingReferral(telegramId, referrerUid) {
  const id = Number(telegramId);
  if (!rewarded.has(id)) {
    pending.set(id, referrerUid);
  }
}

export function getPendingReferral(telegramId) {
  return pending.get(Number(telegramId)) || null;
}

export function clearPendingReferral(telegramId) {
  const id = Number(telegramId);
  pending.delete(id);
  rewarded.add(id);
}
