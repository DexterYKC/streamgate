import express from "express";
import jwt from "jsonwebtoken";
import { getSubscriber, isActive } from "../subscribersStore.js";
import fs from "fs";
import path from "path";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Load videos
function getVideos() {
  const filePath = path.join(process.cwd(), "bot", "videos.json");
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/* ============================================================
   SUBSCRIPTION STATUS → USED BY bot.js
============================================================ */
router.get("/subscription/:telegram_id", async (req, res) => {
  const id = Number(req.params.telegram_id);

  const sub = await getSubscriber(id);
  const active = await isActive(id);

  if (!sub) {
    return res.json({
      active: false,
      plan: null,
      expires_at: null
    });
  }

  return res.json({
    active,
    plan: active ? sub.plan : null,
    expires_at: active ? sub.expires_at : null,
    started_at: sub.started_at || null
  });
});

export default router;
