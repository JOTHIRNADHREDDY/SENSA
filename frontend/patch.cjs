const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";`;

const replacement = `import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { getPricingForCountry, getCheckoutPrice } from "./src/lib/pricingEngine.js";`;

code = code.replace(target, replacement);

const target2 = `  // Regional Pricing Engine API
  app.get("/api/pricing/:country", async (req, res) => {
    try {
      const { country } = req.params;
      const q = query(collection(db, "regional_prices"), where("country", "==", country.toUpperCase()));
      const querySnapshot = await getDocs(q);
      
      const prices: Record<string, any> = {};
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        prices[data.planId] = data;
      });
      
      // Determine fallback
      const eurozone = ['AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'MC', 'SM', 'VA', 'AD', 'ME', 'XK'];
      let fallbackCountry = "US";
      if (eurozone.includes(country.toUpperCase())) {
        fallbackCountry = "DE"; // Eurozone fallback
      }
      
      if (Object.keys(prices).length === 0) {
        const fallbackQ = query(collection(db, "regional_prices"), where("country", "==", fallbackCountry));
        const fallbackSnapshot = await getDocs(fallbackQ);
        fallbackSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          prices[data.planId] = data;
        });
      }

      res.json({ success: true, country: Object.keys(prices).length > 0 ? Object.values(prices)[0].country : 'US', prices });
    } catch (err: any) {
      console.error("Pricing Engine error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Check Price for Checkout
  app.post("/api/pricing/checkout-price", async (req, res) => {
    try {
      const { country, planId, cycle } = req.body;
      const docId = \`\${country.toUpperCase()}_\${planId}\`;
      let docSnap = await getDoc(doc(db, "regional_prices", docId));
      
      if (!docSnap.exists()) {
        // Fallback to US
        docSnap = await getDoc(doc(db, "regional_prices", \`US_\${planId}\`));
      }

      if (!docSnap.exists()) {
         return res.status(404).json({ success: false, error: "Plan not found" });
      }

      const data = docSnap.data();
      const amount = cycle === 'annual' ? data.annual : data.monthly;

      res.json({
        success: true,
        price: {
          currency: data.currency,
          amountMinor: amount,
        }
      });
    } catch (err: any) {
       console.error("Checkout price error:", err);
       res.status(500).json({ success: false, error: err.message });
    }
  });`;

const replacement2 = `  // Regional Pricing Engine API
  app.get("/api/pricing/:country", async (req, res) => {
    try {
      const { country } = req.params;
      const config = getPricingForCountry(country);
      
      // We format it into the expected frontend format
      const prices = {};
      Object.entries(config.plans).forEach(([planId, planData]) => {
        if (planId !== 'enterprise') {
          prices[planId] = {
            planId,
            country: country.toUpperCase(),
            currency: config.currency,
            monthly: planData.monthly,
            annual: planData.annual
          };
        }
      });
      
      // Try to check if Firestore has overrides
      const q = query(collection(db, "regional_prices"), where("country", "==", country.toUpperCase()));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        prices[data.planId] = data; // DB overrides config
      });

      res.json({ success: true, country: country.toUpperCase(), prices });
    } catch (err) {
      console.error("Pricing Engine error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Check Price for Checkout
  app.post("/api/pricing/checkout-price", async (req, res) => {
    try {
      const { country, planId, cycle } = req.body;
      
      // Check DB overrides first
      const docId = \`\${country.toUpperCase()}_\${planId}\`;
      const docSnap = await getDoc(doc(db, "regional_prices", docId));
      
      let finalPrice;
      if (docSnap.exists()) {
        const data = docSnap.data();
        finalPrice = {
          currency: data.currency,
          amountMinor: cycle === 'annual' ? data.annual : data.monthly,
        };
      } else {
        finalPrice = getCheckoutPrice(country, planId, cycle);
      }

      if (!finalPrice) {
         return res.status(404).json({ success: false, error: "Plan not found" });
      }

      res.json({
        success: true,
        price: finalPrice
      });
    } catch (err) {
       console.error("Checkout price error:", err);
       res.status(500).json({ success: false, error: err.message });
    }
  });`;

code = code.replace(target2, replacement2);
fs.writeFileSync('server.ts', code);
console.log('patched');
