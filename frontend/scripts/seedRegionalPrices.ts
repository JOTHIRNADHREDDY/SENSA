import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection } from "firebase/firestore";
import fs from "fs";

const configRaw = fs.readFileSync("./firebase-applet-config.json", "utf-8");
const firebaseConfig = JSON.parse(configRaw);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const regionalPrices = [
  // USD (United States / Global Default)
  { country: "US", currency: "USD", planId: "pilot", monthly: 0, annual: 0 },
  { country: "US", currency: "USD", planId: "base_license", monthly: 29900, annual: 299000 },
  { country: "US", currency: "USD", planId: "professional", monthly: 59900, annual: 599000 },
  { country: "US", currency: "USD", planId: "business", monthly: 99900, annual: 999000 },
  
  // INR (India - Adjusting for PPP)
  { country: "IN", currency: "INR", planId: "pilot", monthly: 0, annual: 0 },
  { country: "IN", currency: "INR", planId: "base_license", monthly: 999900, annual: 9999000 }, // ₹9,999 / mo
  { country: "IN", currency: "INR", planId: "professional", monthly: 1999900, annual: 19999000 }, // ₹19,999 / mo
  { country: "IN", currency: "INR", planId: "business", monthly: 3999900, annual: 39999000 }, // ₹39,999 / mo

  // GBP (United Kingdom)
  { country: "GB", currency: "GBP", planId: "pilot", monthly: 0, annual: 0 },
  { country: "GB", currency: "GBP", planId: "base_license", monthly: 24900, annual: 249000 }, // £249 / mo
  { country: "GB", currency: "GBP", planId: "professional", monthly: 49900, annual: 499000 },
  { country: "GB", currency: "GBP", planId: "business", monthly: 89900, annual: 899000 },
  
  // EUR (Germany / General Europe)
  { country: "DE", currency: "EUR", planId: "pilot", monthly: 0, annual: 0 },
  { country: "DE", currency: "EUR", planId: "base_license", monthly: 27900, annual: 279000 }, // €279 / mo
  { country: "DE", currency: "EUR", planId: "professional", monthly: 54900, annual: 549000 },
  { country: "DE", currency: "EUR", planId: "business", monthly: 94900, annual: 949000 },
];

async function seed() {
  console.log("Starting to seed regional_prices...");
  for (const p of regionalPrices) {
    const docId = `${p.country}_${p.planId}`;
    const docRef = doc(collection(db, "regional_prices"), docId);
    await setDoc(docRef, p);
    console.log(`Seeded ${docId}`);
  }
  console.log("Seeding complete.");
  process.exit(0);
}

seed().catch(err => {
  console.error("Failed to seed:", err);
  process.exit(1);
});
