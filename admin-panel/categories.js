/* ======================================
   MODAL LOGIC
====================================== */
const ADMIN_KEY = localStorage.getItem("ADMIN_KEY") || "";
const modal = document.getElementById("editModal");
let editingId = null;

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

function openModal(category = null) {
  modal.style.display = "flex";

  if (!category) {
    // NEW CATEGORY
    editingId = null;
    document.getElementById("modalTitle").innerText = "New Category";
    document.getElementById("deleteBtn").style.display = "none";

    document.getElementById("catName").value = "";
    document.getElementById("catDesc").value = "";
    document.getElementById("catThumb").value = "";
    document.getElementById("catBanner").value = "";
    document.getElementById("catPosition").value = 1;

  } else {
    // EDIT CATEGORY
    editingId = category.id;
    document.getElementById("modalTitle").innerText = "Edit Category";
    document.getElementById("deleteBtn").style.display = "inline-block";

    document.getElementById("catName").value = category.name;
    document.getElementById("catDesc").value = category.description;
    document.getElementById("catThumb").value = category.thumbnail;
    document.getElementById("catBanner").value = category.banner;
    document.getElementById("catPosition").value = category.position;
  }
}

function closeModal() {
  modal.style.display = "none";
}

modal.addEventListener("click", (e) => {
  if (e.target.id === "editModal") closeModal();
});

document.getElementById("addCategoryBtn").addEventListener("click", () => openModal());



/* ======================================
   CREATE / UPDATE CATEGORY
====================================== */
document.getElementById("saveBtn").addEventListener("click", async () => {
  const payload = {
    name: document.getElementById("catName").value,
    description: document.getElementById("catDesc").value,
    thumbnail: document.getElementById("catThumb").value,
    banner: document.getElementById("catBanner").value,
    position: Number(document.getElementById("catPosition").value)
  };

  try {
    if (!editingId) {
      // CREATE
      const res = await fetch("/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": ADMIN_KEY
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast("Category created", "success");
      } else {
        showToast("Failed to create category", "error");
      }
    } else {
      // UPDATE
      const res = await fetch(`/categories/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": ADMIN_KEY
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast("Category updated", "success");
      } else {
        showToast("Failed to update category", "error");
      }
    }
  } catch (err) {
    showToast("Network error", "error");
  }

  closeModal();
  loadCategories();
});



/* ======================================
   DELETE CATEGORY
====================================== */
document.getElementById("deleteBtn").addEventListener("click", async () => {
  if (!editingId) return;

  try {
    const res = await fetch(`/categories/${editingId}`, {
      method: "DELETE",
      headers: { "x-admin-key": ADMIN_KEY }
    });
    const data = await res.json();
    if (data.success) {
      showToast("Category deleted", "success");
    } else {
      showToast("Failed to delete category", "error");
    }
  } catch (err) {
    showToast("Network error", "error");
  }

  closeModal();
  loadCategories();
});



/* ======================================
   LOAD CATEGORIES (READ)
====================================== */
async function loadCategories() {
  const res = await fetch("/categories");
  const data = await res.json();

  const container = document.getElementById("categoriesList");

  if (!data.length) {
    container.innerHTML = "<p>No categories yet.</p>";
    return;
  }

  container.innerHTML = data
    .sort((a, b) => a.position - b.position)
    .map(
      cat => `
      <div class="card" style="margin-bottom:10px;">
        <div class="card-header">
          <h2>${cat.name}</h2>
          <button class="mini-btn" onclick='openModal(${JSON.stringify(cat)})'>Edit</button>
        </div>
        <p>${cat.description}</p>
        <p><b>Position:</b> ${cat.position}</p>
      </div>`
    )
    .join("");
}

loadCategories();
