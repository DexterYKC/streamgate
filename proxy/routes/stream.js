import express from "express";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { isActive } from "../subscribersStore.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Load videos
function loadVideos() {
  const f = path.join(process.cwd(), "bot/videos.json");
  if (!fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

router.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;

    // 1️⃣ Decode token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(403).send("Invalid or expired token");
    }

    const { telegram_id, video_id } = decoded;

    // 2️⃣ Check if subscription is still active on GitHub
    const active = await isActive(telegram_id);
    if (!active) {
      return res.status(403).send("Subscription expired");
    }

    // 3️⃣ Find video
    const videos = loadVideos();
    const vid = videos.find(v => v.id === video_id);

    if (!vid) {
      return res.status(404).send("Video not found");
    }

    // 4️⃣ Redirect to IPFS stream
    const streamUrl = `https://gateway.pinata.cloud/ipfs/${vid.cid}`;
    return res.redirect(streamUrl);

  } catch (err) {
    console.error("Stream error:", err.message);
    return res.status(403).send("Invalid or expired token");
  }
});

export default router;
