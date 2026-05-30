// proxy/paymentsStore.js
import fs from "fs";
import path from "path";
import { hashId } from "../utils/crypto.mjs";

const FILE = path.join(process.cwd(), "proxy/payments.json");

function loadPayments() {
  if (!fs.existsSync(FILE)) return [];
  try {
    const raw = fs.readFileSync(FILE, "utf8").trim();
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("payments.json corrupted, reset", e.message);
    return [];
  }
}

function savePayments(list) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

// Vérifie si ce paiement a déjà été traité
export function isPaymentProcessed(paymentId) {
  if (!paymentId) return false;
  const list = loadPayments();
  return list.some((p) => p.payment_id === paymentId);
}

// Ajoute un paiement dans l'historique
export function recordPayment(payment) {
  const list = loadPayments();
  list.push({
    ...payment,
    telegram_id: hashId(payment.telegram_id),
    created_at: new Date().toISOString(),
  });
  savePayments(list);
}

// Pour les analytics
export function getAllPayments() {
  return loadPayments();
}
