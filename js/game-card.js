export function fmtPrice(usd) {
  return "$" + Number(usd).toFixed(2);
}

export function priceLabel(g) {
  const platformsCount = (g.platforms || []).length;
  if (!platformsCount) return "нет в продаже";
  if (g.isFree) return "Бесплатно";
  return `от ${fmtPrice(g.lowestPrice)}`;
}

export function cardTemplate(g, { owned = false, wishlisted = false } = {}) {
  const platformsCount = (g.platforms || []).length;
  const discount = g.bestDiscountPercent || 0;
  return `
    <div class="card">
      <a href="game.html?id=${g.id}" class="card-cover-link">
        <div class="card-cover" style="background-image:url('${g.coverUrl}')">
          ${owned ? `<span class="card-owned">Куплено</span>` : discount > 0 ? `<span class="card-discount">-${discount}%</span>` : ""}
        </div>
      </a>
      <button class="wishlist-btn ${wishlisted ? "active" : ""}" data-id="${g.id}" aria-label="В вишлист">${wishlisted ? "♥" : "♡"}</button>
      <a href="game.html?id=${g.id}" class="card-body-link">
        <div class="card-body">
          <div class="card-title">${g.title}</div>
          <div class="card-genres">${(g.genres || []).join(" / ")}</div>
          <div class="card-bottom">
            <span class="card-platforms">${platformsCount} площад${platformsCount === 1 ? "ка" : "ки"}</span>
            <span class="card-price ${g.isFree ? "free" : ""}">${priceLabel(g)}</span>
          </div>
        </div>
      </a>
    </div>`;
}
