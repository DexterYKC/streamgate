const API_URL = window.location.origin;
const ADMIN_KEY = localStorage.getItem("ADMIN_KEY") || "";

if (!ADMIN_KEY) window.location.href = "login.html";

function showToast(msg, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("show")));
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3500);
}

let BOTS = [];

async function loadBots() {
  document.getElementById("botsBody").innerHTML = `<tr><td colspan="4">Loading…</td></tr>`;
  try {
    const res = await fetch(`${API_URL}/bots`, { headers: { "x-admin-key": ADMIN_KEY } });
    BOTS = await res.json();
    renderBots();
    populateMigrationSelects();
  } catch {
    document.getElementById("botsBody").innerHTML = `<tr><td colspan="4">Error loading bots</td></tr>`;
  }
}

function renderBots() {
  const tbody = document.getElementById("botsBody");
  if (!BOTS.length) {
    tbody.innerHTML = `<tr><td colspan="4">No bots configured</td></tr>`;
    return;
  }
  tbody.innerHTML = BOTS.map(b => `
    <tr>
      <td>${b.index}</td>
      <td><a href="https://t.me/${b.username}" target="_blank" style="color:#6366f1;">@${b.username}</a></td>
      <td><code style="font-size:11px; color:#9ca3af;">${b.webhookPath}</code></td>
      <td>${b.primary ? `<span style="color:#10b981; font-weight:600;">Primary</span>` : `<span style="color:#f59e0b;">Backup</span>`}</td>
    </tr>
  `).join("");
}

function populateMigrationSelects() {
  const fromSel = document.getElementById("fromBotSelect");
  const toSel = document.getElementById("toBotSelect");
  fromSel.innerHTML = "";
  toSel.innerHTML = "";

  BOTS.forEach(b => {
    const opt1 = document.createElement("option");
    opt1.value = b.index;
    opt1.textContent = `Bot ${b.index} — @${b.username}`;
    fromSel.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = b.index;
    opt2.textContent = `Bot ${b.index} — @${b.username}`;
    toSel.appendChild(opt2);
  });

  // Default: from=1, to=2
  if (BOTS.length >= 2) toSel.value = BOTS[1].index;
}

async function triggerMigration() {
  const fromIndex = parseInt(document.getElementById("fromBotSelect").value);
  const toIndex = parseInt(document.getElementById("toBotSelect").value);

  if (fromIndex === toIndex) {
    showToast("Source and destination must be different", "error");
    return;
  }

  const fromBot = BOTS.find(b => b.index === fromIndex);
  const toBot = BOTS.find(b => b.index === toIndex);

  if (!confirm(`Send migration broadcast from @${fromBot?.username} → @${toBot?.username}?\n\nThis will message ALL active subscribers.`)) return;

  const resultDiv = document.getElementById("migrationResult");
  resultDiv.style.display = "block";
  resultDiv.innerHTML = `<p style="color:#9ca3af;">Sending…</p>`;

  try {
    const res = await fetch(`${API_URL}/bots/broadcast-migration`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
      body: JSON.stringify({ fromIndex, toIndex })
    });
    const data = await res.json();

    if (data.ok) {
      resultDiv.innerHTML = `
        <div style="background:#052e16; border:1px solid #10b981; border-radius:8px; padding:16px; color:#10b981;">
          ✅ Migration broadcast sent<br>
          <span style="font-size:13px; color:#6ee7b7;">Delivered: ${data.sent} / ${data.total} | Failed: ${data.failed}</span>
        </div>`;
      showToast(`Sent to ${data.sent} subscribers`, "success");
    } else {
      resultDiv.innerHTML = `<p style="color:#ef4444;">${data.error}</p>`;
      showToast("Broadcast failed", "error");
    }
  } catch {
    resultDiv.innerHTML = `<p style="color:#ef4444;">Network error</p>`;
    showToast("Network error", "error");
  }
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("ADMIN_KEY");
  window.location.href = "login.html";
});

loadBots();
