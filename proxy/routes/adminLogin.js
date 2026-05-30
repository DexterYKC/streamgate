// proxy/routes/adminLogin.js
import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";

const router = express.Router();

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || process.env.JWT_SECRET;
const SESSION_DURATION = "12h";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LOCKOUT_STEPS_MS = [60_000, 5 * 60_000, 30 * 60_000, 60 * 60_000]; // 1m → 5m → 30m → 1h

const attempts = new Map(); // ip -> { count, firstFailAt, lockedUntil, strikes }

function getIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? fwd.split(",")[0] : req.socket.remoteAddress || "unknown").trim();
}

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // burn equal time, don't leak length via timing
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function pruneStale(now) {
  if (attempts.size < 500) return;
  for (const [ip, rec] of attempts) {
    if ((!rec.lockedUntil || rec.lockedUntil < now) && now - rec.firstFailAt > WINDOW_MS) {
      attempts.delete(ip);
    }
  }
}

function recordFailure(ip, now) {
  const record = attempts.get(ip);
  if (!record || now - record.firstFailAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstFailAt: now, lockedUntil: 0, strikes: record?.strikes || 0 });
  } else {
    record.count++;
    if (record.count >= MAX_ATTEMPTS) {
      const step = Math.min(record.strikes, LOCKOUT_STEPS_MS.length - 1);
      record.lockedUntil = now + LOCKOUT_STEPS_MS[step];
      record.strikes++;
      record.count = 0;
      record.firstFailAt = now;
    }
  }
}

// POST /admin-auth/login — body: { key, code? }
// Verifies the admin password (and TOTP code, if ADMIN_TOTP_SECRET is set),
// then issues a short-lived signed session token used as x-admin-key afterwards.
router.post("/login", (req, res) => {
  const now = Date.now();
  const ip = getIp(req);
  pruneStale(now);

  const record = attempts.get(ip);
  if (record?.lockedUntil && record.lockedUntil > now) {
    const waitSec = Math.ceil((record.lockedUntil - now) / 1000);
    return res.status(429).json({ error: `Too many attempts — try again in ${waitSec}s` });
  }

  const { key, code } = req.body || {};
  const expectedKey = process.env.ADMIN_PANEL_PASSWORD || "";
  const totpSecret = process.env.ADMIN_TOTP_SECRET || "";

  const keyOk = !!key && !!expectedKey && safeCompare(key, expectedKey);
  const codeOk = !totpSecret || (!!code && authenticator.check(String(code).trim(), totpSecret));

  if (!keyOk || !codeOk) {
    recordFailure(ip, now);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  attempts.delete(ip);
  const token = jwt.sign({ role: "admin" }, SESSION_SECRET, { expiresIn: SESSION_DURATION });
  res.json({ success: true, token, twoFactorEnabled: !!totpSecret });
});

export default router;
