import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function register(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  await setDoc(doc(db, "users", cred.user.uid), {
    displayName,
    email,
    role: "user",
    library: [],
    wishlist: [],
    createdAt: serverTimestamp()
  });
  return cred.user;
}

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

// 1. подключает topbar (кнопка "Войти"/"Профиль") к реальному состоянию авторизации
//    на любой странице, где вызван watchAuthUI()
export function watchAuthUI() {
  const loginBtn = document.getElementById("login-btn");
  const adminLink = document.getElementById("admin-link");
  onAuthStateChanged(auth, async user => {
    if (loginBtn) {
      if (user) {
        loginBtn.textContent = "Выйти";
        loginBtn.href = "#";
        loginBtn.onclick = e => { e.preventDefault(); logout(); };
      } else {
        loginBtn.textContent = "Войти";
        loginBtn.href = "login.html";
        loginBtn.onclick = null;
      }
    }
    if (adminLink) {
      if (!user) { adminLink.style.display = "none"; return; }
      const snap = await getDoc(doc(db, "users", user.uid));
      adminLink.style.display = snap.exists() && snap.data().role === "admin" ? "" : "none";
    }
  });
}
