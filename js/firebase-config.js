import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB72v979o4YXEny_gmw8zNWo973_WSiTr8",
  authDomain: "forge-bc457.firebaseapp.com",
  projectId: "forge-bc457",
  storageBucket: "forge-bc457.firebasestorage.app",
  messagingSenderId: "474978796813",
  appId: "1:474978796813:web:877fe437e2693db44d1c44"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);