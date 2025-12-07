(async function () {
  const storedKey = localStorage.getItem("ADMIN_KEY");
  if (!storedKey) {
    window.location.href = "login.html";
    return;
  }

  try {
    const res = await fetch("/analytics/overview", {
      headers: { "x-admin-key": storedKey }
    });
    if (res.status === 401) {
      localStorage.removeItem("ADMIN_KEY");
      window.location.href = "login.html";
    }
  } catch {
    // network error — let page load; individual API calls will handle 401s
  }
})();
