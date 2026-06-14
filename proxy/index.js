import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import videosRouter from "./routes/videos.js";
import paymentsRouter from "./routes/payments.js";
import accessRouter from "./routes/access.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ROUTES PUBLICS
router.use("/videos", videosRouter);
router.use("/payments", paymentsRouter);
router.use("/", accessRouter);

// ADMIN PANEL (STATIC)
router.use("/admin", express.static(path.join(__dirname, "../admin-panel")));

export default router;
