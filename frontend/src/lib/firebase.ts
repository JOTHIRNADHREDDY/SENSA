import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCKQ4rGw0cHwNpS-XCd0scB3PzGrGCQhF4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sensa-f74e9.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sensa-f74e9",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sensa-f74e9.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "761649011400",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:761649011400:web:5f303194e85654941723fd",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-JZKKP2REFX",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Validating connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
