// proxy/categoriesStore.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILE_PATH = path.join(__dirname, "../data/categories.json");

function ensureFile() {
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "[]");
}

export function loadCategories() {
  ensureFile();
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf8").trim();
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocal(list) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(list, null, 2));
}

async function uploadJsonToPinata(json) {
  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    {
      pinataMetadata: { name: "StreamGateCategories" },
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
  console.log("📤 Categories pinned to Pinata:", cid);
  return cid;
}

export async function saveCategories(list) {
  saveLocal(list);
  const cid = await uploadJsonToPinata(list);
  return cid;
}

// ======================================================
// RESTORE FROM PINATA (USED ON SERVER START)
// ======================================================
export async function restoreCategoriesFromIPFS() {
  try {
    const res = await axios.get(
      "https://api.pinata.cloud/data/pinList",
      {
        params: {
          status: "pinned",
          pageLimit: 100,
          pageOffset: 0
        },
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`
        }
      }
    );

    const rows = (res.data.rows || []).filter(
      r => r.metadata && r.metadata.name === "StreamGateCategories"
    );

    if (!rows.length) {
      console.log("⚠️ No StreamGateCategories found on Pinata");
      return;
    }

    // plus récent d'abord
    rows.sort(
      (a, b) =>
        new Date(b.date_pinned || b.date_queued) -
        new Date(a.date_pinned || a.date_queued)
    );

    const cid = rows[0].ipfs_pin_hash || rows[0].IpfsHash;
    const jsonRes = await axios.get(`https://gateway.pinata.cloud/ipfs/${cid}`);

    fs.writeFileSync(FILE_PATH, JSON.stringify(jsonRes.data, null, 2));
    console.log("📦 Categories restored from IPFS:", cid);
  } catch (err) {
    console.log("❌ Categories restore failed:", err.message);
  }
}
