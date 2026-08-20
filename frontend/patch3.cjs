const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Fix duplicate import
code = code.replace(
  'import { getPricingForCountry, getCheckoutPrice } from "./src/lib/pricingEngine.js";\nimport { getPricingForCountry, getCheckoutPrice } from "./src/lib/pricingEngine.js";',
  'import { getPricingForCountry, getCheckoutPrice } from "./src/lib/pricingEngine.js";'
);

// Fix type error
const oldLines = `            monthly: planData.monthly,
            annual: planData.annual`;

const newLines = `            monthly: (planData as any).monthly,
            annual: (planData as any).annual`;

code = code.replace(oldLines, newLines);

fs.writeFileSync('server.ts', code);
console.log('Fixed');
