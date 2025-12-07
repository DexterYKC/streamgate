import express from "express";
import { loadSubscribers } from "../subscribersStore.js";
import { getAllPayments } from "../paymentsStore.js";
import { adminAuth } from "../adminAuth.js";

const router = express.Router();

router.get("/overview", adminAuth, async (req, res) => {
  const { subs } = await loadSubscribers();
  const payments = getAllPayments();
  const now = new Date();

  const activeSubs = subs.filter(
    s => s.expires_at && new Date(s.expires_at) > now
  );

  const totalRevenue = payments.reduce(
    (sum, p) => sum + (Number(p.amount) || 0), 0
  );

  const planStats = payments.reduce((acc, p) => {
    const k = p.plan || "unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  // truncate hashed telegram IDs for display
  const lastPayments = [...payments].slice(-20).reverse().map(p => ({
    ...p,
    telegram_id: p.telegram_id
      ? p.telegram_id.toString().slice(0, 10) + "…"
      : "—"
  }));

  res.json({
    totalSubscribers: subs.length,
    activeSubscribers: activeSubs.length,
    totalRevenueUSD: totalRevenue,
    planStats,
    lastPayments,
  });
});

export default router;
