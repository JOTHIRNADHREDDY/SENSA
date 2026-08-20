const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Replace the imports
code = code.replace(
  'import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";',
  'import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";\nimport { getPricingForCountry, getCheckoutPrice } from "./src/lib/pricingEngine.js";'
);

// Find the start and end of the API endpoint
const startStr = '  // Regional Pricing Engine API\n  app.get("/api/pricing/:country", async (req, res) => {';
const nextEndpoint = '  // Check Price for Checkout\n  app.post("/api/pricing/checkout-price", async (req, res) => {';

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(nextEndpoint);

if (startIndex !== -1 && endIndex !== -1) {
  const newApi = `  // Regional Pricing Engine API
  app.get("/api/pricing/:country", async (req, res) => {
    try {
      const { country } = req.params;
      const config = getPricingForCountry(country);
      
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
      
      const q = query(collection(db, "regional_prices"), where("country", "==", country.toUpperCase()));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        prices[data.planId] = data; 
      });

      res.json({ success: true, country: country.toUpperCase(), prices });
    } catch (err) {
      console.error("Pricing Engine error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });\n\n`;

  const newCheckout = `  // Check Price for Checkout
  app.post("/api/pricing/checkout-price", async (req, res) => {
    try {
      const { country, planId, cycle } = req.body;
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

  const afterCheckoutStart = code.indexOf('  // Initialize Gemini API client safely');
  
  if (afterCheckoutStart !== -1) {
    code = code.substring(0, startIndex) + newApi + newCheckout + '\n\n' + code.substring(afterCheckoutStart);
    fs.writeFileSync('server.ts', code);
    console.log('Successfully patched server.ts');
  } else {
    console.log('Could not find Gemini API start');
  }
} else {
  console.log('Could not find start or end index');
}
