import { db, auth } from "./firebase-config.js";
import { watchAuthUI } from "./auth.js";
import { cardTemplate, priceLabel } from "./game-card.js";
import { getWishlist, attachWishlistHandlers } from "./wishlist.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PAGE_SIZE = 12;
const TOP_CATEGORIES_COUNT = 4;

const popularRow = document.getElementById("popular-row");
const dealsRow = document.getElementById("deals-row");
const categoryTiles = document.getElementById("category-tiles");
const hero = document.getElementById("hero");
const grid = document.getElementById("games-grid");
const genreWrap = document.getElementById("filter-genres");
const sortSelect = document.getElementById("sort-select");
const searchInput = document.getElementById("search-input");
const loadMoreBtn = document.getElementById("load-more");

let catalogState = { genre: "all", sort: "relevance", cursor: null, done: false };
let allGenres = [];
let ownedSlugs = new Set();
let wishlistSlugs = new Set();
const wishlistRef = { get current() { return wishlistSlugs; } };

function render(g) {
  return cardTemplate(g, { owned: ownedSlugs.has(g.id), wishlisted: wishlistSlugs.has(g.id) });
}

function docsToGames(snapshot) {
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function wrapSlider(container, rowInnerHTML) {
  container.innerHTML = `
    <button class="slider-arrow left" aria-label="Назад">‹</button>
    <div class="row-scroll">${rowInnerHTML}</div>
    <button class="slider-arrow right" aria-label="Вперёд">›</button>`;
  const track = container.querySelector(".row-scroll");
  container.querySelector(".left").addEventListener("click", () => track.scrollBy({ left: -600, behavior: "smooth" }));
  container.querySelector(".right").addEventListener("click", () => track.scrollBy({ left: 600, behavior: "smooth" }));
}

async function loadHeroAndPopular() {
  const snap = await getDocs(query(collection(db, "games"), orderBy("ratingsCount", "desc"), limit(10)));
  const games = docsToGames(snap);
  wrapSlider(popularRow, games.map(render).join(""));

  const g = games[0];
  if (!g) { hero.innerHTML = ""; return; }
  const platformsCount = (g.platforms || []).length;
  hero.innerHTML = `
    <div class="hero-inner">
      <div class="hero-text">
        <span class="hero-kicker">Популярное сейчас</span>
        <h2 class="hero-title">${g.title}</h2>
        <p class="hero-desc">${g.shortDescription}</p>
        <div class="hero-cta">
          <span class="hero-price">${priceLabel(g)}</span>
          <span class="hero-platforms">${platformsCount} площад${platformsCount === 1 ? "ка" : "ки"}</span>
          <button class="btn-outline" onclick="location.href='game.html?id=${g.id}'">Смотреть площадки</button>
        </div>
      </div>
      <div class="hero-img" style="background-image:url('${g.coverUrl}')"></div>
    </div>`;
}

async function loadDeals() {
  const snap = await getDocs(query(
    collection(db, "games"),
    where("bestDiscountPercent", ">", 0),
    orderBy("bestDiscountPercent", "desc"),
    limit(10)
  ));
  wrapSlider(dealsRow, docsToGames(snap).map(render).join(""));
}

async function loadGenreCounts() {
  const snap = await getDoc(doc(db, "meta", "genres"));
  const counts = snap.exists() ? snap.data().counts || {} : {};
  allGenres = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  return counts;
}

async function renderPopularCategories(counts) {
  const top = allGenres.slice(0, TOP_CATEGORIES_COUNT);
  const usedIds = new Set();
  const tiles = [];
  for (const genre of top) {
    const snap = await getDocs(query(
      collection(db, "games"),
      where("genres", "array-contains", genre),
      orderBy("randomIndex"),
      limit(10)
    ));
    const candidates = docsToGames(snap);
    const g = candidates.find(c => !usedIds.has(c.id)) || candidates[0];
    if (g) usedIds.add(g.id);
    const cover = g?.coverUrl || "";
    tiles.push(`<button class="category-tile" data-genre="${genre}" style="background-image:url('${cover}')">
      <span class="category-tile-label">${genre}</span>
      <span class="category-tile-count">${counts[genre]} игр${counts[genre] === 1 ? "а" : ""}</span>
    </button>`);
  }
  categoryTiles.innerHTML = tiles.join("");
  categoryTiles.querySelectorAll(".category-tile").forEach(btn => btn.addEventListener("click", () => {
    setGenreFilter(btn.dataset.genre);
    document.getElementById("catalog-anchor").scrollIntoView({ behavior: "smooth" });
  }));
}

function renderGenreChips() {
  genreWrap.innerHTML = `<button data-genre="all" class="chip ${catalogState.genre === "all" ? "active" : ""}">Все</button>` +
    allGenres.map(g => `<button data-genre="${g}" class="chip ${catalogState.genre === g ? "active" : ""}">${g}</button>`).join("");
  genreWrap.querySelectorAll(".chip").forEach(btn => btn.addEventListener("click", () => setGenreFilter(btn.dataset.genre)));
}

function setGenreFilter(genre) {
  catalogState.genre = genre;
  renderGenreChips();
  resetCatalog().catch(e => console.error("Не удалось применить категорию (возможно, нужен composite index — см. ссылку выше):", e));
}

function buildCatalogQuery(cursor) {
  const orderField = catalogState.sort === "price-asc" || catalogState.sort === "price-desc"
    ? "lowestPrice"
    : catalogState.sort === "discount-desc"
      ? "bestDiscountPercent"
      : "randomIndex";
  const direction = catalogState.sort === "price-desc" || catalogState.sort === "discount-desc" ? "desc" : "asc";

  const clauses = [collection(db, "games")];
  if (catalogState.genre !== "all") clauses.push(where("genres", "array-contains", catalogState.genre));
  clauses.push(orderBy(orderField, direction));
  if (cursor) clauses.push(startAfter(cursor));
  clauses.push(limit(PAGE_SIZE));
  return query(...clauses);
}

async function loadCatalogPage() {
  const q = buildCatalogQuery(catalogState.cursor);
  const snap = await getDocs(q);
  const games = docsToGames(snap);
  grid.insertAdjacentHTML("beforeend", games.map(render).join(""));
  catalogState.cursor = snap.docs[snap.docs.length - 1] || null;
  catalogState.done = snap.docs.length < PAGE_SIZE;
  loadMoreBtn.style.display = catalogState.done ? "none" : "inline-block";
}

async function resetCatalog() {
  catalogState.cursor = null;
  catalogState.done = false;
  grid.innerHTML = "";
  await loadCatalogPage();
}

async function runSearch(text) {
  const lower = text.toLowerCase();
  const snap = await getDocs(query(
    collection(db, "games"),
    orderBy("titleLower"),
    where("titleLower", ">=", lower),
    where("titleLower", "<=", lower + "\uf8ff"),
    limit(24)
  ));
  grid.innerHTML = docsToGames(snap).map(render).join("");
  loadMoreBtn.style.display = "none";
}

sortSelect.addEventListener("change", e => {
  catalogState.sort = e.target.value;
  resetCatalog();
});

let searchTimer;
searchInput.addEventListener("input", e => {
  clearTimeout(searchTimer);
  const text = e.target.value.trim();
  searchTimer = setTimeout(() => {
    if (text) runSearch(text);
    else resetCatalog();
  }, 250);
});

loadMoreBtn.addEventListener("click", loadCatalogPage);
attachWishlistHandlers(wishlistRef);

async function init() {
  try {
    const counts = await loadGenreCounts();
    renderGenreChips();
    await renderPopularCategories(counts);
  } catch (e) {
    console.error("Не удалось загрузить категории (возможно, нужен composite index — см. ссылку выше):", e);
  }

  try {
    await loadHeroAndPopular();
  } catch (e) {
    console.error("Не удалось загрузить hero/популярное:", e);
  }

  try {
    await loadDeals();
  } catch (e) {
    console.error("Не удалось загрузить скидки:", e);
  }

  try {
    await resetCatalog();
  } catch (e) {
    console.error("Не удалось загрузить каталог (возможно, нужен composite index — см. ссылку выше):", e);
  }
}

async function loadUserDataAndRerender(user) {
  if (!user) { ownedSlugs = new Set(); wishlistSlugs = new Set(); }
  else {
    const snap = await getDoc(doc(db, "users", user.uid));
    const data = snap.exists() ? snap.data() : {};
    ownedSlugs = new Set(data.library || []);
    wishlistSlugs = new Set(data.wishlist || []);
  }
  try { await loadHeroAndPopular(); } catch (e) { console.error(e); }
  try { await loadDeals(); } catch (e) { console.error(e); }
  try { await resetCatalog(); } catch (e) { console.error(e); }
}

onAuthStateChanged(auth, user => { loadUserDataAndRerender(user); });

init();
watchAuthUI();

// 1. Firestore при первом запросе с новой комбинацией where+orderBy попросит создать
//    composite index — в консоли появится прямая ссылка, просто перейти и нажать Create.
