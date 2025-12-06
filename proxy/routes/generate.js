import express from "express";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { isActive, getSubscriber } from "../subscribersStore.js";

const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.BASE_URL;

const router = express.Router();

const VIDEOS_FILE = path.join(process.cwd(), "bot/videos.json");

// Load videos safely
function loadVideos() {
  if (!fs.existsSync(VIDEOS_FILE)) return [];
  return JSON.parse(fs.readFileSync(VIDEOS_FILE, "utf-8"));
}

router.post("/generate", async (req, res) => {
  const { telegram_id, video_id } = req.body;

  if (!telegram_id || !video_id) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }

  // Load all videos
  const videos = loadVideos();
  const video = videos.find(v => v.id === video_id);

  if (!video) {
    return res.status(404).json({ success: false, error: "Video not found" });
  }

  // FREE VIDEO → direct access
  if (video.type === "free") {
    const url = `${BASE_URL}/player/index.html?token=free&id=${video.id}&cid=${video.cid}&title=${encodeURIComponent(video.title)}`;
    return res.json({ success: true, url });
  }

  // VIP VIDEO → requires an ACTIVE MONTHLY subscription + drop not expired
  if (video.type === "vip") {
    const sub = await getSubscriber(telegram_id);
    const active = sub?.expires_at && new Date(sub.expires_at) > new Date();

    if (!active || sub.plan !== "month") {
      return res.status(403).json({ success: false, error: "Monthly subscription required" });
    }
    if (video.expiresAt && new Date(video.expiresAt) <= new Date()) {
      return res.status(410).json({ success: false, error: "This VIP drop has expired" });
    }
  } else {
    // PREMIUM VIDEO → check GitHub subscription (any active plan)
    const active = await isActive(telegram_id);

    if (!active) {
      return res.status(403).json({ success: false, error: "Subscription required" });
    }
  }

  // Generate short-lived secure token (3 min)
  const token = jwt.sign(
    { telegram_id, video_id },
    JWT_SECRET,
    { expiresIn: "3m" }
  );

  const url = `${BASE_URL}/player/index.html?token=${token}`;

  return res.json({ success: true, url });
});
// ==================================================
// REFRESH TOKEN (rotation toutes les X secondes)
// ==================================================
router.post("/generate/refresh-token", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: "Missing token" });
    }

    // On lit l'ancien token même s'il est expiré
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    } catch (err) {
      return res.status(403).json({ success: false, error: "Invalid token" });
    }

    const { telegram_id, video_id } = decoded;

    // On revérifie que l'abo est toujours actif
    const active = await isActive(telegram_id);
    if (!active) {
      return res.status(403).json({ success: false, error: "Subscription expired" });
    }

    // Nouveau token (même durée que le token initial)
    const newToken = jwt.sign(
      { telegram_id, video_id },
      JWT_SECRET,
      { expiresIn: "3m" }
    );

    return res.json({ success: true, token: newToken });

  } catch (err) {
    console.error("Refresh token error:", err.message);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

export default router;
