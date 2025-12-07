const API_URL = window.location.origin;
const ADMIN_KEY = localStorage.getItem("ADMIN_KEY") || "";

// Logout
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector(".nav-logout-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      localStorage.removeItem("ADMIN_KEY");
      window.location.href = "login.html";
    });
  }
});

async function loadAnalytics() {
  try {
    const res = await fetch(`${API_URL}/analytics/overview`, {
      headers: { "x-admin-key": ADMIN_KEY }
    });
    const data = await res.json();

    document.getElementById("statTotalSubs").textContent =
      data.totalSubscribers ?? 0;
    document.getElementById("statActiveSubs").textContent =
      data.activeSubscribers ?? 0;
    document.getElementById("statRevenue").textContent =
      (data.totalRevenueUSD ?? 0).toFixed(2);

    const planStats = data.planStats || {};
    const plansText = Object.entries(planStats)
      .map(([plan, count]) => `${plan}: ${count}`)
      .join(" · ");
    document.getElementById("statPlans").textContent =
      plansText || "No data";

    const tbody = document.getElementById("paymentsTableBody");
    tbody.innerHTML = "";

    if (!data.lastPayments || !data.lastPayments.length) {
      tbody.innerHTML = `<tr><td colspan="6">No payments yet</td></tr>`;
      return;
    }

    data.lastPayments.forEach((p) => {
      const tr = document.createElement("tr");
      const dt = p.created_at
        ? new Date(p.created_at).toISOString().slice(0, 16).replace("T", " ")
        : "–";
      tr.innerHTML = `
        <td>${dt}</td>
        <td>${p.telegram_id || "-"}</td>
        <td>${p.plan || "-"}</td>
        <td>${p.amount || 0} ${p.price_currency || "USD"}</td>
        <td>${p.status || "-"}</td>
        <td style="font-size:11px;">${p.payment_id || "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    document.getElementById("paymentsTableBody").innerHTML =
      `<tr><td colspan="6">Error loading analytics</td></tr>`;
  }
}

loadAnalytics();
