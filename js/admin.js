import { db, auth } from "./firebase-config.js";
import { watchAuthUI } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, where, orderBy, limit, getDocs, getCountFromServer,
  doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const root = document.getElementById("admin-root");
let activeTab = "games";

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/(^-|-$)/g, "");
}

function shellHtml() {
  return `
    <div class="admin-tabs">
      <button class="admin-tab" data-tab="games">Игры</button>
      <button class="admin-tab" data-tab="users">Пользователи</button>
      <button class="admin-tab" data-tab="reviews">Отзывы</button>
      <button class="admin-tab" data-tab="stats">Статистика</button>
    </div>
    <div id="admin-tab-content"></div>`;
}

function renderTabs() {
  document.querySelectorAll(".admin-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === activeTab);
    btn.onclick = () => { activeTab = btn.dataset.tab; renderTabs(); loadTab(); };
  });
}

async function loadTab() {
  const content = document.getElementById("admin-tab-content");
  content.innerHTML = `<p style="color:var(--text-muted)">Загрузка...</p>`;
  if (activeTab === "games") return renderGamesTab(content);
  if (activeTab === "users") return renderUsersTab(content);
  if (activeTab === "reviews") return renderReviewsTab(content);
  if (activeTab === "stats") return renderStatsTab(content);
}

// ---------- Игры ----------

function gameFormHtml(g = {}) {
  return `
    <div class="game-form" id="game-form">
      <label>Название<input id="f-title" value="${g.title || ""}"></label>
      <label>Обложка (URL)<input id="f-cover" value="${g.coverUrl || ""}"></label>
      <label>Жанры (через запятую)<input id="f-genres" value="${(g.genres || []).join(", ")}"></label>
      <label>Разработчик<input id="f-dev" value="${g.developer || ""}"></label>
      <label>Издатель<input id="f-pub" value="${g.publisher || ""}"></label>
      <label>Цена, $<input id="f-price" type="number" step="0.01" value="${g.lowestPrice ?? ""}"></label>
      <label class="full-row">Краткое описание<textarea id="f-short">${g.shortDescription || ""}</textarea></label>
      <label class="full-row">Полное описание<textarea id="f-desc">${g.description || ""}</textarea></label>
      <div class="game-form-actions">
        <button class="btn-outline" id="f-save">${g.__editId ? "Сохранить" : "Добавить"}</button>
        <button class="btn-outline" id="f-cancel">Отмена</button>
      </div>
    </div>`;
}

function attachGameForm(content, editId, existing) {
  document.getElementById("f-cancel").addEventListener("click", () => loadTab());
  document.getElementById("f-save").addEventListener("click", async () => {
    const title = document.getElementById("f-title").value.trim();
    if (!title) return;
    const genres = document.getElementById("f-genres").value.split(",").map(s => s.trim()).filter(Boolean);
    const price = Number(document.getElementById("f-price").value) || 0;

    const data = {
      title,
      titleLower: title.toLowerCase(),
      coverUrl: document.getElementById("f-cover").value.trim(),
      genres,
      developer: document.getElementById("f-dev").value.trim() || "Unknown",
      publisher: document.getElementById("f-pub").value.trim() || "Unknown",
      shortDescription: document.getElementById("f-short").value.trim(),
      description: document.getElementById("f-desc").value.trim(),
      lowestPrice: price,
      updatedAt: serverTimestamp()
    };

    if (editId) {
      await updateDoc(doc(db, "games", editId), data);
    } else {
      const slug = slugify(title);
      await setDoc(doc(db, "games", slug), {
        ...data,
        slug,
        screenshots: [], videos: [], tags: [],
        steamAppId: null, cheapsharkGameId: null,
        bestDiscountPercent: 0, rating: 0, ratingsCount: 0,
        randomIndex: Math.random(), featured: false,
        platforms: price > 0 ? [{ store: "Admin", price, retailPrice: price, discountPercent: 0, url: "#" }] : [],
        createdAt: serverTimestamp()
      });
    }
    loadTab();
  });
}

async function renderGamesTab(content) {
  content.innerHTML = `
    <div class="admin-search">
      <input id="game-search" placeholder="Поиск по названию...">
      <button class="btn-outline" id="add-game-btn">+ Добавить игру</button>
    </div>
    <div id="game-form-wrap"></div>
    <table class="admin-table">
      <thead><tr><th>Название</th><th>Жанры</th><th>Цена</th><th>Площадок</th><th></th></tr></thead>
      <tbody id="games-tbody"></tbody>
    </table>`;

  document.getElementById("add-game-btn").addEventListener("click", () => {
    document.getElementById("game-form-wrap").innerHTML = gameFormHtml();
    attachGameForm(content, null);
  });

  async function loadRows(games) {
    const tbody = document.getElementById("games-tbody");
    tbody.innerHTML = games.map(g => `
      <tr data-id="${g.id}">
        <td class="cell-title">${g.title}</td>
        <td>${(g.genres || []).join(", ")}</td>
        <td>${g.isFree ? "Free" : "$" + Number(g.lowestPrice || 0).toFixed(2)}</td>
        <td>${(g.platforms || []).length}</td>
        <td class="row-actions">
          <button class="edit-game-btn">Изменить</button>
          <button class="delete-game-btn danger">Удалить</button>
        </td>
      </tr>`).join("") || `<tr><td colspan="5" style="color:var(--text-muted)">Ничего не найдено</td></tr>`;

    tbody.querySelectorAll(".edit-game-btn").forEach(btn => btn.addEventListener("click", async () => {
      const id = btn.closest("tr").dataset.id;
      const snap = await getDoc(doc(db, "games", id));
      document.getElementById("game-form-wrap").innerHTML = gameFormHtml(snap.data());
      attachGameForm(content, id);
    }));
    tbody.querySelectorAll(".delete-game-btn").forEach(btn => btn.addEventListener("click", async () => {
      const id = btn.closest("tr").dataset.id;
      if (!confirm(`Удалить игру "${id}" из каталога?`)) return;
      await deleteDoc(doc(db, "games", id));
      btn.closest("tr").remove();
    }));
  }

  const snap = await getDocs(query(collection(db, "games"), orderBy("updatedAt", "desc"), limit(20)));
  loadRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));

  let searchTimer;
  document.getElementById("game-search").addEventListener("input", e => {
    clearTimeout(searchTimer);
    const text = e.target.value.trim().toLowerCase();
    searchTimer = setTimeout(async () => {
      if (!text) {
        const s = await getDocs(query(collection(db, "games"), orderBy("updatedAt", "desc"), limit(20)));
        return loadRows(s.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      const s = await getDocs(query(
        collection(db, "games"), orderBy("titleLower"),
        where("titleLower", ">=", text), where("titleLower", "<=", text + "\uf8ff"), limit(20)
      ));
      loadRows(s.docs.map(d => ({ id: d.id, ...d.data() })));
    }, 250);
  });
}

// ---------- Пользователи ----------

async function renderUsersTab(content) {
  content.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Имя</th><th>Email</th><th>Роль</th><th>Steam</th><th>Библиотека</th></tr></thead>
      <tbody id="users-tbody"><tr><td colspan="5" style="color:var(--text-muted)">Загрузка...</td></tr></tbody>
    </table>`;

  const snap = await getDocs(collection(db, "users"));
  const tbody = document.getElementById("users-tbody");
  tbody.innerHTML = snap.docs.map(d => {
    const u = d.data();
    return `
      <tr data-uid="${d.id}">
        <td>${u.displayName || "—"}</td>
        <td class="cell-text">${u.email || "—"}</td>
        <td>
          <select class="role-select">
            <option value="user" ${u.role !== "admin" ? "selected" : ""}>user</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
          </select>
        </td>
        <td>${u.steamLinked ? "привязан" : "—"}</td>
        <td>${(u.library || []).length}</td>
      </tr>`;
  }).join("") || `<tr><td colspan="5" style="color:var(--text-muted)">Пользователей нет</td></tr>`;

  tbody.querySelectorAll(".role-select").forEach(sel => sel.addEventListener("change", async e => {
    const uid = e.target.closest("tr").dataset.uid;
    await updateDoc(doc(db, "users", uid), { role: e.target.value });
  }));
}

// ---------- Отзывы ----------

async function renderReviewsTab(content) {
  content.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Игра</th><th>Автор</th><th>Оценка</th><th>Текст</th><th></th></tr></thead>
      <tbody id="reviews-tbody"><tr><td colspan="5" style="color:var(--text-muted)">Загрузка...</td></tr></tbody>
    </table>`;

  const snap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc"), limit(50)));
  const gameTitleCache = new Map();
  const rows = await Promise.all(snap.docs.map(async d => {
    const r = d.data();
    if (!gameTitleCache.has(r.gameId)) {
      const gSnap = await getDoc(doc(db, "games", r.gameId));
      gameTitleCache.set(r.gameId, gSnap.exists() ? gSnap.data().title : r.gameId);
    }
    return `
      <tr data-id="${d.id}">
        <td class="cell-title">${gameTitleCache.get(r.gameId)}</td>
        <td>${r.userName || "—"}</td>
        <td>${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</td>
        <td class="cell-text">${r.text}</td>
        <td class="row-actions"><button class="delete-review-btn danger">Удалить</button></td>
      </tr>`;
  }));

  const tbody = document.getElementById("reviews-tbody");
  tbody.innerHTML = rows.join("") || `<tr><td colspan="5" style="color:var(--text-muted)">Отзывов нет</td></tr>`;
  tbody.querySelectorAll(".delete-review-btn").forEach(btn => btn.addEventListener("click", async () => {
    const id = btn.closest("tr").dataset.id;
    if (!confirm("Удалить отзыв?")) return;
    await deleteDoc(doc(db, "reviews", id));
    btn.closest("tr").remove();
  }));
}

// ---------- Статистика ----------

async function renderStatsTab(content) {
  content.innerHTML = `<p style="color:var(--text-muted)">Считаю...</p>`;
  const [gamesCount, usersCount, reviewsCount] = await Promise.all([
    getCountFromServer(collection(db, "games")),
    getCountFromServer(collection(db, "users")),
    getCountFromServer(collection(db, "reviews"))
  ]);
  content.innerHTML = `
    <div class="admin-stats">
      <div class="stat-card"><div class="stat-value">${gamesCount.data().count}</div><div class="stat-label">игр в каталоге</div></div>
      <div class="stat-card"><div class="stat-value">${usersCount.data().count}</div><div class="stat-label">пользователей</div></div>
      <div class="stat-card"><div class="stat-value">${reviewsCount.data().count}</div><div class="stat-label">отзывов</div></div>
    </div>`;
}

// ---------- Доступ ----------

onAuthStateChanged(auth, async user => {
  if (!user) {
    root.innerHTML = `<div class="admin-denied"><p>Нужно войти в аккаунт с правами администратора.</p></div>`;
    return;
  }
  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? snap.data().role : "user";
  if (role !== "admin") {
    root.innerHTML = `<div class="admin-denied"><p>Доступ только для администраторов.</p></div>`;
    return;
  }
  root.innerHTML = shellHtml();
  renderTabs();
  loadTab();
});

watchAuthUI();
