// proxy/ordersStore.js
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 💾 On stocke dans proxy/data/orders.json
const ORDERS_PATH = path.join(__dirname, "orders.json");

// 🚀 Assure la création du fichier si manquant
async function ensureFile() {
  try {
    await fsp.access(ORDERS_PATH);
  } catch {
    await fsp.writeFile(ORDERS_PATH, "[]", "utf8");
  }
}

export async function getOrders() {
  await ensureFile();
  const raw = await fsp.readFile(ORDERS_PATH, "utf8");
  return JSON.parse(raw);
}

export async function addOrder(order) {
  await ensureFile();
  const orders = await getOrders();

  orders.push({
    ...order,
    createdAt: new Date().toISOString(),
  });

  await fsp.writeFile(ORDERS_PATH, JSON.stringify(orders, null, 2));
}
