import express from "express";
import { loadCategories, saveCategories } from "../categoriesStore.js";
import { adminAuth } from "../adminAuth.js";

const router = express.Router();

/* ---- GET all categories ---- */
router.get("/", (req, res) => {
  res.json(loadCategories());
});

/* ---- CREATE category ---- */
router.post("/", adminAuth, async (req, res) => {
  const list = loadCategories();

  const cat = {
    id: "cat_" + Date.now(),
    name: req.body.name,
    description: req.body.description,
    thumbnail: req.body.thumbnail || "",
    banner: req.body.banner || "",
    visibility: req.body.visibility || "free",
    position: Number(req.body.position || 1),
    created_at: new Date().toISOString()
  };

  list.push(cat);
  const cid = await saveCategories(list);

  res.json({ success: true, cat, cid });
});

/* ---- UPDATE category ---- */
router.put("/:id", adminAuth, async (req, res) => {
  let list = loadCategories();
  const idx = list.findIndex(c => c.id === req.params.id);

  if (idx === -1) return res.sendStatus(404);

  list[idx] = { ...list[idx], ...req.body };
  const cid = await saveCategories(list);

  res.json({ success: true, category: list[idx], cid });
});

/* ---- DELETE category ---- */
router.delete("/:id", adminAuth, async (req, res) => {
  let list = loadCategories().filter(c => c.id !== req.params.id);

  const cid = await saveCategories(list);

  res.json({ success: true, cid });
});

export default router;
