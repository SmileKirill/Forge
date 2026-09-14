import { db, auth } from "./firebase-config.js";
import { watchAuthUI } from "./auth.js";
import { cardTemplate } from "./game-card.js";
import { getWishlist, toggleWishlist } from "./wishlist.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, onSnapshot, collection, query, where, orderBy, limit, getDocs,
  addDoc, serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const root = document.getElementById("game-root");
const params = new URLSearchParams(location.search);
const gameId = params.get("id");

let currentGame = null;
let currentUser = null;
let ownedSlugs = new Set();
let wishlistSlugs = new Set();

function fmtPrice(usd) {
  return "$" + Number(usd).toFixed(2);
}

function sortPlatforms(platforms) {
  return [...platforms].sort((a, b) => {
    if (a.store === "Steam" && b.store !== "Steam") return -1;
    if (b.store === "Steam" && a.store !== "Steam") return 1;
    return a.price - b.price;
  });
}

function platformRow(p) {
  const hasDiscount = p.discountPercent > 0;
  return `
    <div class="platform-row">
      <div class="platform-row-top">
        <span class="platform-name">${p.store}</span>
        ${hasDiscount ? `<span class="platform-badge">-${p.discountPercent}%</span>` : ""}
      </div>
      <div class="platform-row-bottom">
        <span class="platform-price">
          ${hasDiscount ? `<span class="platform-old">${fmtPrice(p.retailPrice)}</span>` : ""}
          ${fmtPrice(p.price)}
        </span>
        <a class="platform-open-btn" href="${p.url}" target="_blank" rel="noopener">Открыть</a>
      </div>
    </div>`;
}

function renderGame(g) {
  const owned = ownedSlugs.has(g.id);
  const wishlisted = wishlistSlugs.has(g.id);
  const platforms = sortPlatforms(g.platforms || []);

  root.innerHTML = `
    <div class="game-hero" style="background-image:url('${g.coverUrl}')">
      <div class="game-hero-overlay">
        <div class="game-hero-inner">
          <h1>${g.title}</h1>
          <div class="game-meta">
            ${(g.genres || []).join(" · ")}
            ${g.releaseDate ? " · " + new Date(g.releaseDate.seconds * 1000).getFullYear() : ""}
            ${g.developer ? " · " + g.developer : ""}
            ${g.ratingsCount ? ` · ★ ${g.rating.toFixed(1)} (${g.ratingsCount.toLocaleString("ru-RU")} отзывов в Steam)` : ""}
          </div>
          <div class="game-hero-actions">
            ${owned ? `<span class="pill pill-owned">В библиотеке</span>` : ""}
            <button class="wishlist-toggle ${wishlisted ? "active" : ""}" id="wishlist-toggle">
              ${wishlisted ? "♥ В вишлисте" : "♡ В вишлист"}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="game-body">
      <div class="game-main">
        <section>
          <h2>Об игре</h2>
          <p class="game-description">${g.description || g.shortDescription || ""}</p>
        </section>

        ${((g.videos || []).length || (g.screenshots || []).length) ? `
        <section>
          <h2>Скриншоты</h2>
          <div class="screens-slider">
            <button class="slider-arrow left" aria-label="Назад">‹</button>
            <div class="screens-row row-scroll">
              ${(g.videos || []).map(v => `<video controls preload="none" poster="${v.thumbnail}"><source src="${v.mp4Url}" type="video/mp4"></video>`).join("")}
              ${(g.screenshots || []).map(s => `<img src="${s}" loading="lazy" alt="">`).join("")}
            </div>
            <button class="slider-arrow right" aria-label="Вперёд">›</button>
          </div>
        </section>` : ""}

        <section id="reviews-section">
          <h2>Отзывы</h2>
          <div id="review-form-wrap"></div>
          <div id="reviews-list" class="reviews-list"></div>
        </section>
      </div>

      <aside class="game-side">
        <h2>Где купить</h2>
        <div class="platforms-list">
          ${platforms.length ? platforms.map(platformRow).join("") : `<p style="color:var(--text-muted)">Сейчас нигде не продаётся</p>`}
        </div>
      </aside>
    </div>

    <section class="row-section" id="related-section" style="display:none">
      <h2 class="row-title">Похожие игры</h2>
      <div class="row-slider" id="related-row"></div>
    </section>
  `;

  const screensSlider = root.querySelector(".screens-slider");
  if (screensSlider) {
    const track = screensSlider.querySelector(".row-scroll");
    screensSlider.querySelector(".left").addEventListener("click", () => track.scrollBy({ left: -400, behavior: "smooth" }));
    screensSlider.querySelector(".right").addEventListener("click", () => track.scrollBy({ left: 400, behavior: "smooth" }));
  }

  document.getElementById("wishlist-toggle").addEventListener("click", async () => {
    if (!currentUser) { location.href = "login.html"; return; }
    const was = wishlistSlugs.has(g.id);
    const now = await toggleWishlist(g.id, was);
    if (now === null) return;
    if (now) wishlistSlugs.add(g.id); else wishlistSlugs.delete(g.id);
    renderGame(g);
  });

  loadRelated(g);
  renderReviewForm();
}

async function loadRelated(g) {
  const genre = (g.genres || [])[0];
  if (!genre) return;
  const snap = await getDocs(query(
    collection(db, "games"),
    where("genres", "array-contains", genre),
    orderBy("randomIndex"),
    limit(7)
  ));
  const related = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.id !== g.id)
    .slice(0, 6);
  if (!related.length) return;
  const section = document.getElementById("related-section");
  const row = document.getElementById("related-row");
  section.style.display = "block";
  row.innerHTML = `
    <button class="slider-arrow left" aria-label="Назад">‹</button>
    <div class="row-scroll">${related.map(r => cardTemplate(r, {
      owned: ownedSlugs.has(r.id), wishlisted: wishlistSlugs.has(r.id)
    })).join("")}</div>
    <button class="slider-arrow right" aria-label="Вперёд">›</button>`;
  const track = row.querySelector(".row-scroll");
  row.querySelector(".left").addEventListener("click", () => track.scrollBy({ left: -600, behavior: "smooth" }));
  row.querySelector(".right").addEventListener("click", () => track.scrollBy({ left: 600, behavior: "smooth" }));
}

function renderReviewForm() {
  const wrap = document.getElementById("review-form-wrap");
  if (!currentUser) {
    wrap.innerHTML = `<p style="color:var(--text-muted)"><a href="login.html">Войди</a>, чтобы оставить отзыв.</p>`;
    return;
  }
  wrap.innerHTML = `
    <form id="review-form" class="review-form">
      <select id="review-rating">
        <option value="5">★★★★★</option>
        <option value="4">★★★★☆</option>
        <option value="3">★★★☆☆</option>
        <option value="2">★★☆☆☆</option>
        <option value="1">★☆☆☆☆</option>
      </select>
      <textarea id="review-text" placeholder="Твой отзыв..." required></textarea>
      <button class="btn-outline" type="submit">Опубликовать</button>
    </form>`;
  document.getElementById("review-form").addEventListener("submit", async e => {
    e.preventDefault();
    const text = document.getElementById("review-text").value.trim();
    if (!text) return;
    await addDoc(collection(db, "reviews"), {
      gameId,
      userId: currentUser.uid,
      userName: currentUser.displayName || "Игрок",
      rating: Number(document.getElementById("review-rating").value),
      text,
      createdAt: serverTimestamp()
    });
    document.getElementById("review-text").value = "";
  });
}

function watchReviews() {
  const q = query(collection(db, "reviews"), where("gameId", "==", gameId), orderBy("createdAt", "desc"), limit(20));
  onSnapshot(q, snap => {
    const list = document.getElementById("reviews-list");
    if (!list) return;
    const reviews = snap.docs.map(d => d.data());
    list.innerHTML = reviews.length ? reviews.map(r => `
      <div class="review-item">
        <div class="review-head">
          <span class="review-author">${r.userName}</span>
          <span class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
        </div>
        <p>${r.text}</p>
      </div>`).join("") : `<p style="color:var(--text-muted)">Отзывов пока нет — будь первым.</p>`;
  });
}

async function loadUserContext() {
  if (!currentUser) { ownedSlugs = new Set(); wishlistSlugs = new Set(); return; }
  const snap = await getDoc(doc(db, "users", currentUser.uid));
  const data = snap.exists() ? snap.data() : {};
  ownedSlugs = new Set(data.library || []);
  wishlistSlugs = new Set(data.wishlist || []);
}

if (!gameId) {
  root.innerHTML = `<p style="max-width:1280px;margin:48px auto;padding:0 24px;color:var(--text-muted)">Игра не найдена.</p>`;
} else {
  onSnapshot(doc(db, "games", gameId), snap => {
    if (!snap.exists()) {
      root.innerHTML = `<p style="max-width:1280px;margin:48px auto;padding:0 24px;color:var(--text-muted)">Игра не найдена.</p>`;
      return;
    }
    currentGame = { id: snap.id, ...snap.data() };
    renderGame(currentGame);
  });

  onAuthStateChanged(auth, async user => {
    currentUser = user;
    await loadUserContext();
    if (currentGame) renderGame(currentGame);
  });

  watchReviews();
}

watchAuthUI();