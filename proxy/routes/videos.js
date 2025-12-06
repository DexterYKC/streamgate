// proxy/routes/videos.js
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import { broadcastNewVideo, broadcastVipDrop } from "../broadcastService.js";
import { adminAuth } from "../adminAuth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const VIDEOS_FILE = path.join(process.cwd(), "bot/videos.json");

// ===============================
// ENSURE FILE
// ===============================
function ensureVideosFile() {
  if (!fs.existsSync(VIDEOS_FILE)) fs.writeFileSync(VIDEOS_FILE, "[]");
}

// ===============================
// LOAD / SAVE
// ===============================
function loadVideos() {
  ensureVideosFile();
  try {
    const raw = fs.readFileSync(VIDEOS_FILE, "utf-8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    fs.writeFileSync(VIDEOS_FILE, "[]");
    return [];
  }
}

function saveVideos(list) {
  fs.writeFileSync(VIDEOS_FILE, JSON.stringify(list, null, 2));
}

const VIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // VIP drops auto-expire after 30 days

function normalizeType(type) {
  if (type === "free") return "free";
  if (type === "vip") return "vip";
  return "premium";
}

// ===============================
// PINATA UPLOAD HELPERS
// ===============================
async function uploadToPinata(buffer, filename, mime) {
  const form = new FormData();
  form.append("file", buffer, { filename, contentType: mime });

  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${process.env.PINATA_JWT}`
      }
    }
  );

  return res.data.IpfsHash || res.data.IpfsHash;
}

async function uploadJsonToPinata(json) {
  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    {
      pinataMetadata: { name: "StreamGateCatalog" },
      pinataContent: json
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PINATA_JWT}`
      }
    }
  );

  const cid = res.data.IpfsHash || res.data.ipfsHash;
  console.log("📤 Catalog pinned to Pinata:", cid);
  return cid;
}

// ===============================
// GET ALL VIDEOS
// ===============================
router.get("/", (req, res) => {
  res.json(loadVideos());
});

// ===============================
// UPLOAD VIDEO
// ===============================
router.post(
  "/upload-video",
  adminAuth,
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "image", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { title, description, category, type } = req.body;
      const videoFile = req.files["video"]?.[0];
      const imageFile = req.files["image"]?.[0];

      if (!title || !videoFile || !imageFile) {
        return res.status(400).json({ success: false, error: "Missing fields" });
      }

      const videoCID = await uploadToPinata(
        videoFile.buffer,
        videoFile.originalname,
        videoFile.mimetype
      );

      const imageCID = await uploadToPinata(
        imageFile.buffer,
        imageFile.originalname,
        imageFile.mimetype
      );

      const list = loadVideos();
      const finalType = normalizeType(type);
      const now = new Date();

      const item = {
        id: "vid_" + Date.now(),
        title,
        description,
        image: imageCID,
        cid: videoCID,
        type: finalType,
        category: category || null,
        likes: 0,
        dislikes: 0,
        createdAt: now.toISOString(),
        ...(finalType === "vip" && { expiresAt: new Date(now.getTime() + VIP_DURATION_MS).toISOString() })
      };

      list.push(item);
      saveVideos(list);

      const catalogCID = await uploadJsonToPinata(list);

      res.json({ success: true, item, catalogCID });

      // notify subscribers (non-blocking)
      if (item.type === "premium") {
        broadcastNewVideo(item).catch(err =>
          console.error("Broadcast error:", err.message)
        );
      } else if (item.type === "vip") {
        broadcastVipDrop(item).catch(err =>
          console.error("VIP broadcast error:", err.message)
        );
      }

    } catch (err) {
      console.error("Upload error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ===============================
// UPDATE VIDEO
// ===============================
router.put(
  "/video/:id",
  adminAuth,
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "image", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const list = loadVideos();
      const index = list.findIndex(v => v.id === req.params.id);

      if (index === -1) {
        return res.json({ success: false, error: "Not found" });
      }

      const videoObj = list[index];
      const { title, description, category, type } = req.body;

      if (title) videoObj.title = title;
      if (description) videoObj.description = description;
      if (category) videoObj.category = category;
      if (type) {
        videoObj.type = normalizeType(type);
        if (videoObj.type === "vip") {
          if (!videoObj.expiresAt) {
            videoObj.expiresAt = new Date(Date.now() + VIP_DURATION_MS).toISOString();
          }
        } else {
          delete videoObj.expiresAt;
        }
      }

      if (req.files["image"]) {
        const img = req.files["image"][0];
        videoObj.image = await uploadToPinata(img.buffer, img.originalname, img.mimetype);
      }

      if (req.files["video"]) {
        const vid = req.files["video"][0];
        videoObj.cid = await uploadToPinata(vid.buffer, vid.originalname, vid.mimetype);
      }

      list[index] = videoObj;
      saveVideos(list);

      const catalogCID = await uploadJsonToPinata(list);

      res.json({ success: true, videoObj, catalogCID });

    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  }
);

// ===============================
// DELETE VIDEO
// ===============================
router.delete("/video/:id", adminAuth, async (req, res) => {
  try {
    const list = loadVideos().filter(v => v.id !== req.params.id);
    saveVideos(list);

    const catalogCID = await uploadJsonToPinata(list);

    res.json({ success: true, catalogCID });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ===============================
// LIKE / DISLIKE
// ===============================
router.post("/like/:id", (req, res) => {
  const list = loadVideos();
  const vid = list.find(v => v.id === req.params.id);

  if (!vid) return res.json({ success: false });

  vid.likes = (vid.likes || 0) + 1;
  saveVideos(list);

  res.json({ success: true, likes: vid.likes });
});

router.post("/dislike/:id", (req, res) => {
  const list = loadVideos();
  const vid = list.find(v => v.id === req.params.id);

  if (!vid) return res.json({ success: false });

  vid.dislikes = (vid.dislikes || 0) + 1;
  saveVideos(list);

  res.json({ success: true, dislikes: vid.dislikes });
});

// ===============================
// GET CATEGORIES
// ===============================
import { loadCategories } from "../categoriesStore.js";

router.get("/categories", (req, res) => {
  res.json(loadCategories());
});

export default router;
