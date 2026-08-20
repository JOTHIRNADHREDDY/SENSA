const fs = require('fs');
let code = fs.readFileSync('src/components/PricingSection.tsx', 'utf8');

if (!code.includes("from 'motion/react'")) {
  code = code.replace(
    "import React, { useState, useEffect } from 'react';",
    "import React, { useState, useEffect } from 'react';\nimport { motion, AnimatePresence } from 'motion/react';"
  );
}

// Animate the numbers by replacing the formatPrice calls with a motion.span
const replacePrice = (plan) => {
  const target = `<span className="text-4xl font-bold text-white">{formatPrice(getPrice('${plan}'), currency)}</span>`;
  const replacement = `<AnimatePresence mode="popLayout">
                  <motion.span 
                    key={getPrice('${plan}')}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-4xl font-bold text-white inline-block"
                  >
                    {formatPrice(getPrice('${plan}'), currency)}
                  </motion.span>
                </AnimatePresence>`;
  code = code.replace(target, replacement);
};

['pilot', 'base_license', 'professional', 'business'].forEach(replacePrice);

// Also add a nice hover effect to the cards.
// We can find `relative p-8 rounded-2xl` for cards and add `transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1`
code = code.replace(/className="relative p-8 rounded-2xl bg-white\/5 border border-white\/10 flex flex-col"/g, 'className="relative p-8 rounded-2xl bg-white/5 border border-white/10 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50"');
code = code.replace(/className="relative p-8 rounded-2xl bg-\[#0b1221\] border border-\[\#5fa9f2\]\/30 shadow-xl shadow-sky-900\/20 flex flex-col"/g, 'className="relative p-8 rounded-2xl bg-[#0b1221] border border-[#5fa9f2]/30 shadow-xl shadow-sky-900/20 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-sky-900/40"');

// Recommendation slider smooth height expansion
// Wait, for recommendation we can just change the slide-in class to use framer motion or just let tailwind do it. It already has `animate-in fade-in slide-in-from-bottom-4`

fs.writeFileSync('src/components/PricingSection.tsx', code);
console.log('PricingSection patched');
