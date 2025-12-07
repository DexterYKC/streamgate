// ===============================
//  Admin Panel – Video Manager
// ===============================

const API_URL = window.location.origin;
const ADMIN_KEY = localStorage.getItem("ADMIN_KEY") || "";

// ---- Toast ----
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
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ---- Confirm dialog ----
function showConfirm(msg, onConfirm) {
  let overlay = document.getElementById("confirm-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-box">
        <p id="confirm-msg"></p>
        <div class="confirm-btns">
          <button class="button button-ghost" id="confirm-cancel">Cancel</button>
          <button class="button button-danger" id="confirm-ok">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  document.getElementById("confirm-msg").textContent = msg;
  overlay.classList.add("open");
  const close = () => overlay.classList.remove("open");
  document.getElementById("confirm-ok").onclick = () => { close(); onConfirm(); };
  document.getElementById("confirm-cancel").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

// Redirection si l'admin n'est pas connecté
if (!ADMIN_KEY) {
  window.location.href = "login.html";
}

// DOM elements
const uploadForm = document.getElementById("uploadForm");
const uploadStatus = document.getElementById("uploadStatus");
const videoTable = document.querySelector("#videoTable tbody");
const categoryFilter = document.getElementById("filterCategory");
let ALL_VIDEOS = [];

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  uploadStatus.textContent = "Uploading… ⏳";

  const videos = document.getElementById("video").files;
  const image = document.getElementById("image").files[0];

  if (!videos.length) {
    uploadStatus.textContent = "No video selected ❌";
    return;
  }

  let uploaded = 0;

  for (const vid of videos) {
    const fd = new FormData();
    fd.append("title", document.getElementById("title").value);
    fd.append("description", document.getElementById("description").value);
    fd.append("category", document.getElementById("categoriesSelect").value);
    fd.append("type", document.getElementById("videoType").value);

    fd.append("video", vid);     // vidéo individuelle
    fd.append("image", image);   // même thumbnail pour toutes

    try {
      const res = await fetch(`${API_URL}/videos/upload-video`, {
        method: "POST",
        headers: {
          "x-admin-key": ADMIN_KEY
        },
        body: fd
      });

      const data = await res.json();

      if (data.success) {
        uploaded++;
        uploadStatus.textContent = `Uploaded ${uploaded}/${videos.length} ✔️`;
      } else {
        uploadStatus.textContent = "Upload failed ❌";
      }

    } catch (err) {
      console.error(err);
      uploadStatus.textContent = "Network error ❌";
      break;
    }
  }

  loadVideos();
});


// ===============================
//  LOAD VIDEOS
// ===============================
async function loadVideos() {
  videoTable.innerHTML = `<tr><td colspan="6">Loading…</td></tr>`;

  try {
    const res = await fetch(`${API_URL}/videos`);
    const data = await res.json();

    ALL_VIDEOS = data || [];
    renderVideos();
    populateCategoryFilter();
  } catch (err) {
    videoTable.innerHTML = `<tr><td colspan="6">Error loading videos</td></tr>`;
  }
}

async function loadCategoryDropdown() {
  const dropdown = document.getElementById("categoriesSelect");
  dropdown.innerHTML = `<option value="">-- Choose a category --</option>`;

  try {
    const res = await fetch(`${API_URL}/categories`);
    const categories = await res.json();

    categories
      .sort((a,b) => a.position - b.position)
      .forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.name;
        opt.textContent = cat.name;
        dropdown.appendChild(opt);
      });

  } catch (err) {
    console.error("Error loading dropdown categories:", err);
  }
}

async function loadEditCategoryDropdown() {
  const dropdown = document.getElementById("editCategory");
  if (!dropdown) return;

  dropdown.innerHTML = "";

  try {
    const res = await fetch(`${API_URL}/categories`);
    const categories = await res.json();

    categories
      .sort((a, b) => a.position - b.position)
      .forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.name;
        opt.textContent = cat.name;
        dropdown.appendChild(opt);
      });

  } catch (err) {
    console.error("Error loading edit dropdown categories:", err);
  }
}




// ===============================
//  RENDER VIDEOS
// ===============================
function renderVideos() {
  videoTable.innerHTML = "";

  const search = document.getElementById("filterSearch").value.toLowerCase();
  const category = categoryFilter.value;

  const filtered = ALL_VIDEOS.filter((v) => {
    if (search && !v.title.toLowerCase().includes(search)) return false;
    if (category && v.category !== category) return false;
    return true;
  });

  if (!filtered.length) {
    videoTable.innerHTML = `<tr><td colspan="6">No videos</td></tr>`;
    return;
  }

  filtered.forEach((v) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><img src="https://gateway.pinata.cloud/ipfs/${v.image}" width="60"></td>
      <td>${v.title}</td>
      <td>${
        v.type === "free" ? "🔥 Preview"
        : v.type === "vip" ? `👑 VIP${v.expiresAt ? ` <small>(until ${new Date(v.expiresAt).toLocaleDateString()})</small>` : ""}`
        : "🔒 Premium"
      }</td>
      <td>${v.category || "-"}</td>
      <td>${(v.likes || 0)} 👍 / ${(v.dislikes || 0)} 👎</td>
      <td>
        <button onclick="openEditModal('${v.id}')" class="button button-ghost">✏️ Edit</button>
        <button onclick="deleteVideo('${v.id}')" class="button button-danger">🗑 Delete</button>
      </td>
    `;
    videoTable.appendChild(tr);
  });
}


// ===============================
//  CATEGORY FILTER
// ===============================
async function populateCategoryFilter() {
  try {
    const res = await fetch(`${API_URL}/categories`);
    const categories = await res.json();

    categoryFilter.innerHTML = `<option value="">All categories</option>`;

    categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = cat.name;
      categoryFilter.appendChild(opt);
    });

  } catch (err) {
    console.error("Error loading categories:", err);
  }
}



// ===============================
//  DELETE VIDEO
// ===============================
async function deleteVideo(id) {
  showConfirm("Delete this video?", async () => {
    try {
      const res = await fetch(`${API_URL}/videos/video/${id}`, {
        method: "DELETE",
        headers: { "x-admin-key": ADMIN_KEY }
      });
      const data = await res.json();
      if (data.success) {
        showToast("Video deleted", "success");
      } else {
        showToast("Delete failed", "error");
      }
      loadVideos();
    } catch (err) {
      showToast("Error deleting video", "error");
    }
  });
}


// ===============================
//  EDIT MODAL
// ===============================
let CURRENT_EDIT_VIDEO = null;

function openEditModal(id) {
  CURRENT_EDIT_VIDEO = ALL_VIDEOS.find((v) => v.id === id);
  if (!CURRENT_EDIT_VIDEO) return showToast("Video not found", "error");

  document.getElementById("editTitle").value = CURRENT_EDIT_VIDEO.title;
  document.getElementById("editDescription").value = CURRENT_EDIT_VIDEO.description;
  document.getElementById("editCategory").value = CURRENT_EDIT_VIDEO.category || "";
  document.getElementById("editType").value = CURRENT_EDIT_VIDEO.type === "vip" ? "vip" : CURRENT_EDIT_VIDEO.type === "free" ? "free" : "premium";

  document.getElementById("editModal").style.display = "flex";
}

function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
}


// ===============================
//  SAVE EDIT
// ===============================
async function saveEdit() {
  if (!CURRENT_EDIT_VIDEO) return;

  const fd = new FormData();
  fd.append("title", document.getElementById("editTitle").value);
  fd.append("description", document.getElementById("editDescription").value);
  fd.append("category", document.getElementById("editCategory").value);
  fd.append("type", document.getElementById("editType").value);

  const newImg = document.getElementById("editImage").files[0];
  const newVid = document.getElementById("editVideo").files[0];

  if (newImg) fd.append("image", newImg);
  if (newVid) fd.append("video", newVid);

  try {
    const res = await fetch(`${API_URL}/videos/video/${CURRENT_EDIT_VIDEO.id}`, {
      method: "PUT",
      headers: {
        "x-admin-key": ADMIN_KEY
      },
      body: fd
    });

    const data = await res.json();

    if (!data.success) {
      showToast("Update failed", "error");
      return;
    }

    closeEditModal();
    showToast("Video updated", "success");
    loadVideos();
  } catch (err) {
    showToast("Error updating video", "error");
  }
}


// ============================
// LOGOUT
// ============================
document.querySelector(".nav-logout-btn").addEventListener("click", () => {
  localStorage.removeItem("ADMIN_KEY");
  window.location.href = "login.html";
});


// ===============================
//  FILTERS LISTENERS
// ===============================
document.getElementById("filterSearch").addEventListener("input", renderVideos);
categoryFilter.addEventListener("change", renderVideos);


// ===============================
//  INIT
// ===============================
loadVideos();
loadCategoryDropdown();
loadEditCategoryDropdown();

