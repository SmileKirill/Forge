import { db, auth } from "./firebase-config.js";
import {
  doc, updateDoc, arrayUnion, arrayRemove, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function getWishlist(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return new Set(snap.exists() ? snap.data().wishlist || [] : []);
}

export async function toggleWishlist(gameId, isInWishlist) {
  const user = auth.currentUser;
  if (!user) { location.href = "login.html"; return null; }
  const ref = doc(db, "users", user.uid);
  await setDoc(ref, {
    wishlist: isInWishlist ? arrayRemove(gameId) : arrayUnion(gameId)
  }, { merge: true });
  return !isInWishlist;
}

// 1. один делегированный обработчик на всё сердечко-меню на странице,
//    не завязан на конкретные карточки — можно вызывать один раз при загрузке
export function attachWishlistHandlers(wishlistSlugsRef) {
  document.addEventListener("click", async e => {
    const btn = e.target.closest(".wishlist-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.dataset.id;
    const wasWishlisted = wishlistSlugsRef.current.has(id);
    btn.disabled = true;
    try {
      const nowWishlisted = await toggleWishlist(id, wasWishlisted);
      if (nowWishlisted === null) return;
      if (nowWishlisted) wishlistSlugsRef.current.add(id);
      else wishlistSlugsRef.current.delete(id);
      btn.classList.toggle("active", nowWishlisted);
      btn.textContent = nowWishlisted ? "♥" : "♡";
    } catch (err) {
      console.error("Не удалось изменить вишлист:", err);
    } finally {
      btn.disabled = false;
    }
  });
}
