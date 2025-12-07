const API_URL = window.location.origin;
const ADMIN_KEY = localStorage.getItem("ADMIN_KEY") || "";
if (!ADMIN_KEY) window.location.href = "login.html";

let BOT_USERNAME = "StreamGateBot";

function showToast(msg, type = "info") {
  let c = document.getElementById("toast-container");
  if (!c) { c = document.createElement("div"); c.id = "toast-container"; document.body.appendChild(c); }
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("show")));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 3500);
}

// ---- Pre-written templates ----
const TEMPLATES = [
  {
    key: "new_drop",
    label: "🔥 New Premium Drop",
    text:
`🔥 <b>New Premium Drop!</b>

Fresh content just landed. ✨

Don't miss out, tap below to dive in 👇`,
    button: "categories",
    buttonLabel: "▶ Watch Now"
  },
  {
    key: "reengage",
    label: "✨ Win-back (inactive users)",
    text:
`✨ <b>We miss you...</b>

Your access expired, but the content keeps getting better.
New videos. New topics. New everything.

Come back and pick up right where you left off 💎`,
    button: "sub_menu",
    buttonLabel: "🔄 Renew Access"
  },
  {
    key: "limited_offer",
    label: "⚡ Limited-Time Push",
    text:
`⚡ <b>Limited Time</b>

For the next 48h, unlock full premium access and never miss a drop again.

Don't miss it.`,
    button: "sub_menu",
    buttonLabel: "💎 Unlock Now"
  },
  {
    key: "generic_hook",
    label: "💎 Generic Hook",
    text:
`💎 <b>StreamGate</b>

Premium video, delivered securely on Telegram — made for you.

Tap below and see what's new 👇`,
    button: "open_bot",
    buttonLabel: "🚀 Explore Now"
  },
  {
    key: "preview_tease",
    label: "🎬 Free Preview Hook",
    text:
`🎬 <b>Curious?</b>

We just dropped fresh free previews — no subscription needed.

See for yourself what premium members get every week 👇`,
    button: "categories",
    buttonLabel: "🎬 Watch Free Previews"
  },
  {
    key: "referral_push",
    label: "🎁 Referral Reminder",
    text:
`🎁 <b>Did you know?</b>

You can earn <b>free premium days</b> just by sharing your link.
The more you share, the higher your tier — up to +5 days per referral. 💎

Check your stats and grab your link below 👇`,
    button: "open_bot",
    buttonLabel: "🔗 Get My Referral Link"
  }
];

function renderTemplates() {
  const grid = document.getElementById("templateGrid");
  grid.innerHTML = TEMPLATES.map(t => `
    <button type="button" class="button button-ghost"
      style="text-align:left; padding:14px; height:auto; white-space:normal; display:flex; flex-direction:column; gap:6px;"
      onclick="applyTemplate('${t.key}')">
      <b>${t.label}</b>
      <span style="font-size:12px; color:#9ca3af;">${t.text.split("\n")[0].replace(/<\/?b>/g, "")}</span>
    </button>
  `).join("");
}

function applyTemplate(key) {
  const t = TEMPLATES.find(x => x.key === key);
  if (!t) return;
  document.getElementById("broadcastText").value = t.text;
  document.getElementById("buttonPreset").value = t.button || "";
  document.getElementById("buttonLabel").value = t.buttonLabel || "";
  showToast(`Template "${t.label}" loaded — feel free to edit it`, "info");
}

async function loadBotUsername() {
  try {
    const res = await fetch(`${API_URL}/bots`, { headers: { "x-admin-key": ADMIN_KEY } });
    const bots = await res.json();
    const primary = bots.find(b => b.primary) || bots[0];
    if (primary) BOT_USERNAME = primary.username;
  } catch {}
}

async function sendBroadcast() {
  const text = document.getElementById("broadcastText").value.trim();
  const imageUrl = document.getElementById("broadcastImage").value.trim();
  const audience = document.getElementById("audienceSelect").value;
  const buttonPreset = document.getElementById("buttonPreset").value;
  const buttonLabel = document.getElementById("buttonLabel").value.trim();

  if (!text) { showToast("Write a message first", "error"); return; }

  let buttonUrl, buttonCallback;
  if (buttonPreset === "open_bot") buttonUrl = `https://t.me/${BOT_USERNAME}`;
  else if (buttonPreset) buttonCallback = buttonPreset;

  const audienceLabel = {
    all: "EVERYONE who has used the bot",
    active: "ACTIVE subscribers only",
    inactive: "INACTIVE / expired users only"
  }[audience];

  if (!confirm(`Send this broadcast to ${audienceLabel}?\n\nThis cannot be undone.`)) return;

  const resultDiv = document.getElementById("broadcastResult");
  resultDiv.style.display = "block";
  resultDiv.innerHTML = `<p style="color:#9ca3af;">Sending… this may take a while for large lists.</p>`;

  try {
    const res = await fetch(`${API_URL}/broadcast/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
      body: JSON.stringify({
        text,
        imageUrl: imageUrl || undefined,
        audience,
        buttonText: buttonLabel || undefined,
        buttonUrl,
        buttonCallback
      })
    });
    const data = await res.json();

    if (data.ok) {
      resultDiv.innerHTML = `
        <div style="background:#052e16; border:1px solid #10b981; border-radius:8px; padding:16px; color:#10b981;">
          ✅ Broadcast sent<br>
          <span style="font-size:13px; color:#6ee7b7;">Delivered: ${data.sent} / ${data.total} | Failed: ${data.failed}</span>
        </div>`;
      showToast(`Sent to ${data.sent} users`, "success");
    } else {
      resultDiv.innerHTML = `<p style="color:#ef4444;">${data.error}</p>`;
      showToast(data.error || "Broadcast failed", "error");
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

renderTemplates();
loadBotUsername();
