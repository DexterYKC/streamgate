const API_URL = window.location.origin;
const ADMIN_KEY = localStorage.getItem("ADMIN_KEY") || "";

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("ADMIN_KEY");
  window.location.href = "login.html";
});

// ---- Toast ----
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

// ---- Load users ----
async function loadUsers() {
  const tbody = document.getElementById("usersBody");
  tbody.innerHTML = `<tr><td colspan="7">Loading…</td></tr>`;

  try {
    const res = await fetch(`${API_URL}/users`, {
      headers: { "x-admin-key": ADMIN_KEY }
    });
    const users = await res.json();

    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="7">No users yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    users.forEach(u => {
      const expires = u.expires_at
        ? new Date(u.expires_at).toISOString().slice(0, 10)
        : "—";
      const status = u.active
        ? `<span style="color:#22c55e;">● Active</span>`
        : `<span style="color:#ef4444;">● Inactive</span>`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-size:12px;">${u.partial_id}</td>
        <td style="font-size:11px; color:#6b7280;">${u.uid.slice(0, 12)}…</td>
        <td>${u.plan}</td>
        <td>${expires}</td>
        <td>${status}</td>
        <td>${u.referral_count}</td>
        <td>
          <button class="button button-ghost" onclick="openGrantModal('${u.uid}', '${u.partial_id}')">
            🎁 Grant
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">Error loading users</td></tr>`;
  }
}

// ---- Grant modal ----
let currentUid = null;

function openGrantModal(uid, label) {
  currentUid = uid;
  document.getElementById("grantUidLabel").textContent = `User: ${label} — ${uid.slice(0, 12)}…`;
  document.getElementById("grantPlan").value = "week";
  document.getElementById("customDaysWrap").style.display = "none";
  document.getElementById("grantModal").style.display = "flex";
}

function closeGrantModal() {
  document.getElementById("grantModal").style.display = "none";
  currentUid = null;
}

document.getElementById("grantPlan").addEventListener("change", (e) => {
  document.getElementById("customDaysWrap").style.display =
    e.target.value === "custom" ? "block" : "none";
});

async function confirmGrant() {
  if (!currentUid) return;

  const plan = document.getElementById("grantPlan").value;
  const days = plan === "custom"
    ? Number(document.getElementById("customDays").value)
    : plan === "week" ? 7 : 30;

  try {
    const res = await fetch(`${API_URL}/users/${currentUid}/grant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": ADMIN_KEY
      },
      body: JSON.stringify({ plan, days })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`✅ Premium granted (${days} days)`, "success");
      closeGrantModal();
      loadUsers();
    } else {
      showToast(data.error || "Grant failed", "error");
    }
  } catch {
    showToast("Network error", "error");
  }
}

document.getElementById("grantModal").addEventListener("click", (e) => {
  if (e.target.id === "grantModal") closeGrantModal();
});

loadUsers();
