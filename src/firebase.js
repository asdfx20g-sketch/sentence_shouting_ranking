import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA9sVW0XHipByateCPzNPDks847u2YkhpY",
  authDomain: "eie-shouting-scoring.firebaseapp.com",
  projectId: "eie-shouting-scoring",
  storageBucket: "eie-shouting-scoring.firebasestorage.app",
  messagingSenderId: "698885536476",
  appId: "1:698885536476:web:396f77deff9908cb195219",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
